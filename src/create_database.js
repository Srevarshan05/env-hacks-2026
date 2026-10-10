const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

const ssl = { ca: fs.readFileSync('./global-bundle.pem', 'utf8'), rejectUnauthorized: false };

const client = new Client({
  host: 'hackathon-rdb.cpq0kqcegj1p.ap-south-1.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: '.envhack2026',
  database: 'postgres',
  ssl
});

(async () => {
  try {
    await client.connect();
    console.log('✅ Connected to master database "postgres" on AWS RDS!');
    
    const dbs = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('Existing databases on your AWS RDS:', dbs.rows.map(r => r.datname));

    const targetDb = process.env.DATABASE_URL ? (process.env.DATABASE_URL.split('/').pop().split('?')[0]) : 'env_db';
    if (!dbs.rows.some(r => r.datname === targetDb)) {
      console.log(`Creating database "${targetDb}"...`);
      await client.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`🎉 Database "${targetDb}" CREATED SUCCESSFULLY ON AWS RDS!`);
    } else {
      console.log(`Database "${targetDb}" already exists.`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end().catch(() => {});
  }
})();
