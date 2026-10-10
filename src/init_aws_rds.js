const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const ssl = process.env.DB_CA_PATH && fs.existsSync(process.env.DB_CA_PATH)
  ? { ca: fs.readFileSync(process.env.DB_CA_PATH, 'utf8'), rejectUnauthorized: false }
  : undefined;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl
});

(async () => {
  try {
    await client.connect();
    console.log('✅ Connected to AWS RDS PostgreSQL database.');

    // 1. Run base schema
    const schemaSql = fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8');
    console.log('Applying schema.sql to AWS RDS...');
    await client.query(schemaSql);
    console.log('✅ Base tables verified in AWS RDS.');

    // Relax nodes_id_check constraint to allow both NODE-### and ECO-* format
    await client.query(`
      ALTER TABLE nodes DROP CONSTRAINT IF EXISTS nodes_id_check;
      ALTER TABLE nodes ADD CONSTRAINT nodes_id_check CHECK (id ~ '^(NODE-[0-9]{3,}|ECO-[A-Z0-9-]+)$');
    `);
    console.log('✅ Updated nodes check constraint for ECO-* and NODE-* support.');

    // 2. Run migration
    const migrationSql = fs.readFileSync(path.join(__dirname, '../sql/migration_001.sql'), 'utf8');
    console.log('Applying migration_001.sql to AWS RDS...');
    await client.query(migrationSql);
    console.log('✅ Migration applied.');

    // 3. Seed demo admin user
    const adminPass = await bcrypt.hash('demo12345', 10);
    await client.query(`
      INSERT INTO users (full_name, email, password_hash, role)
      VALUES ('Demo Eco Champion', 'demo@env.app', $1, 'admin')
      ON CONFLICT (email) DO NOTHING;
    `, [adminPass]);
    console.log('✅ Seeded demo admin user (demo@env.app / demo12345).');

    // 4. Verify tables
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    console.log('\n🎉 ALL TABLES IN LIVE AWS RDS POSTGRESQL:');
    tables.rows.forEach(t => console.log('   - ' + t.table_name));

    const nodes = await client.query('SELECT id, name, location FROM nodes');
    console.log('\nStations in AWS RDS:', nodes.rows);

    const rewards = await client.query('SELECT title, points_cost FROM rewards');
    console.log('\nRewards in AWS RDS count:', rewards.rows.length);

  } catch (err) {
    console.error('❌ Error initializing AWS RDS:', err.message);
  } finally {
    await client.end().catch(() => {});
  }
})();
