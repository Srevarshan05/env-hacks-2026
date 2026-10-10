const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

const ssl = process.env.DB_CA_PATH && fs.existsSync(process.env.DB_CA_PATH)
  ? { ca: fs.readFileSync(process.env.DB_CA_PATH, 'utf8'), rejectUnauthorized: false }
  : (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('amazonaws.com')
      ? { rejectUnauthorized: false }
      : undefined);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl
});

async function viewAllData() {
  try {
    await client.connect();
    console.log('\n===============================================================');
    console.log('☁️  AWS RDS CLOUD DATABASE VIEWER (.env user dashboard)');
    console.log('📍 Endpoint:', process.env.DATABASE_URL.split('@')[1]);
    console.log('===============================================================\n');

    // 1. Users
    const users = await client.query('SELECT id, full_name, email, role, created_at FROM users ORDER BY created_at DESC');
    console.log(`👥 USERS IN AWS RDS (${users.rows.length}):`);
    if (users.rows.length === 0) console.log('   (No users found)');
    else console.table(users.rows);

    // 2. Nodes / Refill Stations
    const nodes = await client.query('SELECT id, name, location, active, created_at FROM nodes ORDER BY created_at DESC');
    console.log(`\n🚰 REFILL STATIONS / NODES IN AWS RDS (${nodes.rows.length}):`);
    if (nodes.rows.length === 0) console.log('   (No stations found)');
    else console.table(nodes.rows);

    // 3. Contributions / Refills
    const contributions = await client.query('SELECT id, user_id, node_id, liters, status, points_awarded, created_at FROM contributions ORDER BY created_at DESC LIMIT 10');
    console.log(`\n💧 REFILL CONTRIBUTIONS IN AWS RDS (${contributions.rows.length} latest):`);
    if (contributions.rows.length === 0) console.log('   (No refill records yet)');
    else console.table(contributions.rows);

    // 4. Points Ledger
    const ledger = await client.query('SELECT id, user_id, delta, reason, created_at FROM points_ledger ORDER BY created_at DESC LIMIT 10');
    console.log(`\n🪙 POINTS TRANSACTIONS IN AWS RDS (${ledger.rows.length} latest):`);
    if (ledger.rows.length === 0) console.log('   (No transactions yet)');
    else console.table(ledger.rows);

    // 5. Rewards Catalog
    const rewards = await client.query('SELECT id, title, points_cost, stock, active FROM rewards ORDER BY points_cost ASC');
    console.log(`\n🎁 AVAILABLE REWARDS IN AWS RDS (${rewards.rows.length}):`);
    if (rewards.rows.length === 0) console.log('   (No rewards found)');
    else console.table(rewards.rows);

    console.log('\n===============================================================');
    console.log('✅ End of AWS RDS Data Report');
    console.log('===============================================================\n');

  } catch (err) {
    console.error('❌ Error fetching data:', err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

viewAllData();
