const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

// SSL configuration using AWS certificate
const ssl = process.env.DB_CA_PATH && fs.existsSync(process.env.DB_CA_PATH)
  ? { ca: fs.readFileSync(process.env.DB_CA_PATH, 'utf8'), rejectUnauthorized: false }
  : undefined;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl
});

async function runTest() {
  console.log('🔄 Connecting to AWS RDS PostgreSQL...');
  await client.connect();
  console.log('✅ Connected to AWS RDS!\n');

  // 1. READ: Check database and version
  console.log('--- 1. READING DATABASE INFO ---');
  const dbInfo = await client.query('SELECT current_database(), current_user, version()');
  console.log('Database:', dbInfo.rows[0].current_database);
  console.log('User:', dbInfo.rows[0].current_user);
  console.log('PostgreSQL Version:', dbInfo.rows[0].version.split(' ')[0] + ' ' + dbInfo.rows[0].version.split(' ')[1]);

  // 2. WRITE: Insert a test record into sensor_readings
  console.log('\n--- 2. WRITING DATA TO AWS RDS ---');
  const testNodeId = 'ECO-DEMO-001';
  const testCo2 = 415.50;
  const testWaterLevel = 92.00;
  
  const insertRes = await client.query(`
    INSERT INTO sensor_readings (node_id, co2_ppm, water_level_pct, recorded_at)
    VALUES ($1, $2, $3, NOW())
    RETURNING id, node_id, co2_ppm, water_level_pct, recorded_at
  `, [testNodeId, testCo2, testWaterLevel]);

  const inserted = insertRes.rows[0];
  console.log('✅ Successfully wrote record to table "sensor_readings":');
  console.table([inserted]);

  // 3. READ: Read back the exact record from AWS RDS by its ID
  console.log('--- 3. READING BACK FROM AWS RDS ---');
  const readRes = await client.query(`
    SELECT id, node_id, co2_ppm, water_level_pct, recorded_at
    FROM sensor_readings
    WHERE id = $1
  `, [inserted.id]);

  console.log('✅ Successfully read record back from AWS RDS:');
  console.table(readRes.rows);

  // 4. READ: Count total records in users, nodes, and sensor_readings
  console.log('--- 4. CURRENT AWS RDS RECORD COUNTS ---');
  const userCount = await client.query('SELECT COUNT(*)::int AS count FROM users');
  const nodeCount = await client.query('SELECT COUNT(*)::int AS count FROM nodes');
  const refillCount = await client.query('SELECT COUNT(*)::int AS count FROM contributions');
  const sensorCount = await client.query('SELECT COUNT(*)::int AS count FROM sensor_readings');

  console.log({
    users: userCount.rows[0].count,
    stations: nodeCount.rows[0].count,
    refills: refillCount.rows[0].count,
    sensor_telemetry: sensorCount.rows[0].count
  });

  console.log('\n🎉 ALL READ AND WRITE OPERATIONS TO AWS RDS SUCCEEDED 100%!');
  await client.end();
}

runTest().catch(err => {
  console.error('❌ Error during RDS test:', err.message);
  client.end().catch(() => {});
});
