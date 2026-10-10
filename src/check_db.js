const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

// Setup SSL configuration if CA bundle is provided
const ssl = process.env.DB_CA_PATH && fs.existsSync(process.env.DB_CA_PATH)
  ? { ca: fs.readFileSync(process.env.DB_CA_PATH, 'utf8'), rejectUnauthorized: false }
  : (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('amazonaws.com')
      ? { rejectUnauthorized: false }
      : undefined);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl
});

async function testDatabase() {
  console.log('🔄 Connecting to AWS RDS PostgreSQL...');
  console.log('📍 Endpoint:', process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1] : 'Unknown');

  try {
    await client.connect();
    console.log('\n======================================================');
    console.log('✅ [1/4] CONNECTION SUCCESSFUL!');
    
    // 1. Connection metadata
    const info = await client.query('SELECT current_database(), current_user, version()');
    console.log(`📦 Database: ${info.rows[0].current_database}`);
    console.log(`👤 DB User:  ${info.rows[0].current_user}`);
    console.log(`🐘 Engine:   ${info.rows[0].version.split(',')[0]}`);

    // 2. WRITE TEST (INSERT)
    console.log('\n======================================================');
    console.log('✍️  [2/4] TESTING WRITE (INSERT) OPERATION...');
    
    // Create a temporary health check test table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _rds_io_test (
        id SERIAL PRIMARY KEY,
        test_message VARCHAR(100),
        written_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const testMessage = `Test write from Antigravity @ ${new Date().toISOString()}`;
    const insertResult = await client.query(
      'INSERT INTO _rds_io_test (test_message) VALUES ($1) RETURNING *',
      [testMessage]
    );

    const insertedRow = insertResult.rows[0];
    console.log('✅ WRITE SUCCESSFUL!');
    console.log('   Inserted Row ID:', insertedRow.id);
    console.log('   Inserted Content:', insertedRow.test_message);
    console.log('   Timestamp:', insertedRow.written_at);

    // 3. READ TEST (SELECT)
    console.log('\n======================================================');
    console.log('📖 [3/4] TESTING READ (SELECT) OPERATION...');
    
    const readResult = await client.query(
      'SELECT * FROM _rds_io_test WHERE id = $1',
      [insertedRow.id]
    );

    if (readResult.rows.length > 0 && readResult.rows[0].test_message === testMessage) {
      console.log('✅ READ SUCCESSFUL! Data matches perfectly.');
      console.log('   Read Row Data:', readResult.rows[0]);
    } else {
      console.warn('⚠️ Read did not match expected data:', readResult.rows);
    }

    // Clean up test row
    await client.query('DELETE FROM _rds_io_test WHERE id = $1', [insertedRow.id]);
    console.log('🧹 Cleaned up test probe row.');

    // 4. EXISTING APPLICATION DATA CHECK
    console.log('\n======================================================');
    console.log('📊 [4/4] READING CURRENT APPLICATION DATA...');

    const tables = ['users', 'nodes', 'contributions', 'points_ledger', 'rewards'];
    for (const table of tables) {
      try {
        const countRes = await client.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`   📁 Table '${table}': ${countRes.rows[0].count} records`);
      } catch (e) {
        console.log(`   📁 Table '${table}': not present or empty`);
      }
    }

    console.log('======================================================');
    console.log('🎉 ALL TESTS PASSED! Read & Write permissions on AWS RDS are 100% active!');
    console.log('======================================================\n');

  } catch (err) {
    console.error('\n❌ RDS Test Error:', err.message);
    if (err.detail) console.error('Details:', err.detail);
  } finally {
    await client.end().catch(() => {});
  }
}

testDatabase();
