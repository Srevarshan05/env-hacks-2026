require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { z } = require('zod');
const db = require('./db');

const app = express();
app.disable('x-powered-by');
app.use(helmet());

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to .env Backend',
    status: 'Server is running',
    healthCheck: '/api/health',
    database: db.isPostgres() ? 'AWS RDS PostgreSQL' : 'Local Store',
    mode: process.env.HACKATHON_MODE !== 'false' ? 'hackathon-simulation' : 'production'
  });
});

const origins = (process.env.CORS_ORIGINS || '*').split(',').map(x => x.trim());
app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.includes('*') || origins.includes(origin)) }));
app.use(express.json({ limit: '64kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));

// ─── Helpers ────────────────────────────────────────────────────────────────
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parse = (schema, body) => {
  const r = schema.safeParse(body);
  if (!r.success) {
    const e = new Error('Invalid input: ' + r.error.issues.map(x => x.path.join('.') + ': ' + x.message).join('; '));
    e.status = 400;
    throw e;
  }
  return r.data;
};

// Node IDs: accept NODE-### and ECO-* format
const idSchema = z.string().regex(/^(NODE-[0-9]{3,}|ECO-[A-Z0-9-]+)$/i);

const auth = (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const value = jwt.verify(token, process.env.JWT_SECRET);
    req.user = value;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid. Please login again.' });
  }
};

const roles = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' });
const tokenFor = u => jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Accepts both name and full_name
const accountSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  full_name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(250).transform(x => x.toLowerCase()),
  password: z.string().min(8).max(128)
}).transform(d => ({
  full_name: d.full_name || d.name,
  email: d.email,
  password: d.password
}));

// Unified user shape
const shapeUser = u => ({
  id: u.id,
  name: u.full_name || u.name,
  full_name: u.full_name || u.name,
  email: u.email,
  role: u.role,
  created_at: u.created_at
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', asyncRoute(async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      ok: true,
      service: '.env API',
      database: db.isPostgres() ? 'postgresql-rds' : 'local-resilient-store'
    });
  } catch (err) {
    res.json({ ok: true, service: '.env API', database: 'fallback-active', error: err.message });
  }
}));

// ─── Auth ────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const p = parse(accountSchema, req.body);
  const hash = await bcrypt.hash(p.password, 10);
  try {
    const { rows } = await db.query(
      'INSERT INTO users(full_name,email,password_hash) VALUES($1,$2,$3) RETURNING id,full_name,email,role,created_at',
      [p.full_name, p.email, hash]
    );
    const user = shapeUser(rows[0]);
    res.status(201).json({ user, token: tokenFor(rows[0]) });
  } catch (e) {
    if (e.code === '23505' || e.message?.includes('already registered')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw e;
  }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const p = parse(z.object({
    email: z.string().email().transform(x => x.toLowerCase()),
    password: z.string()
  }), req.body);

  const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [p.email]);
  if (!rows[0] || !(await bcrypt.compare(p.password, rows[0].password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const { password_hash, ...rest } = rows[0];
  const user = shapeUser(rest);
  res.json({ user, token: tokenFor(rest) });
}));

// /api/me and /api/auth/me support
const getMe = asyncRoute(async (req, res) => {
  const { rows } = await db.query('SELECT id,full_name,email,role,created_at FROM users WHERE id=$1', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Account not found' });
  const user = shapeUser(rows[0]);
  res.json({ user });
});
app.get('/api/me', auth, getMe);
app.get('/api/auth/me', auth, getMe);

// ─── Dashboard ───────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, asyncRoute(async (req, res) => {
  const uid = req.user.id;

  const { rows: [{ balance }] } = await db.query(
    'SELECT COALESCE(SUM(delta),0)::int AS balance FROM points_ledger WHERE user_id=$1', [uid]
  );

  const { rows: contribs } = await db.query(
    "SELECT liters, points_awarded, created_at FROM contributions WHERE user_id=$1 AND status='approved' ORDER BY created_at ASC",
    [uid]
  );
  const totalLiters = contribs.reduce((a, c) => a + Number(c.liters), 0);
  const plasticAvoided = totalLiters * 40;

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const weekly = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().slice(0, 10);
    const pts = contribs
      .filter(c => c.created_at && new Date(c.created_at).toISOString().slice(0, 10) === dayStr)
      .reduce((a, c) => a + Number(c.points_awarded), 0);
    return { day: days[d.getDay()], points: pts };
  });

  const { rows: [{ nodeCount }] } = await db.query(
    'SELECT COUNT(*)::int AS "nodeCount" FROM nodes WHERE active=true'
  );

  const { rows: sensors } = await db.query(
    'SELECT co2_ppm, water_level_pct FROM sensor_readings ORDER BY recorded_at DESC LIMIT 1'
  );
  const sensor = sensors[0] || null;

  res.json({
    stats: {
      points: balance,
      refills: contribs.length,
      liters: totalLiters,
      plasticAvoided
    },
    weekly,
    environment: {
      aqi: sensor ? Number(sensor.co2_ppm) : null,
      tankLevel: sensor ? Number(sensor.water_level_pct) : null
    },
    nodeCount
  });
}));

// ─── Nodes & QR ──────────────────────────────────────────────────────────────
app.get('/api/nodes', asyncRoute(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM nodes WHERE active=true ORDER BY id');
  res.json(rows.map(n => ({ ...n, uid: n.id })));
}));

app.get('/api/nodes/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { rows } = await db.query('SELECT * FROM nodes WHERE id=$1 AND active=true', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Node not found' });
  res.json({ ...rows[0], uid: rows[0].id });
}));

app.get('/api/nodes/:id/qr', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { rows } = await db.query('SELECT * FROM nodes WHERE id=$1 AND active=true', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Node not found' });
  const url = `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/scan?uid=${id}`;
  res.type('png').send(await QRCode.toBuffer(url, { width: 350, margin: 2 }));
}));

// ─── Refills (Scan flow) ─────────────────────────────────────────────────────
app.post('/api/refills/validate', auth, asyncRoute(async (req, res) => {
  const p = parse(z.object({ uid: idSchema }), req.body);
  const { rows } = await db.query('SELECT * FROM nodes WHERE id=$1 AND active=true', [p.uid]);
  if (!rows[0]) return res.status(404).json({ error: 'Unknown station UID. Try ECO-DEMO-001 or NODE-001' });
  res.json({ node: { ...rows[0], uid: rows[0].id } });
}));

app.post('/api/refills', auth, asyncRoute(async (req, res) => {
  const p = parse(z.object({ uid: idSchema, liters: z.number().positive().max(20) }), req.body);

  const { rows: nodeRows } = await db.query('SELECT * FROM nodes WHERE id=$1 AND active=true', [p.uid]);
  if (!nodeRows[0]) return res.status(404).json({ error: 'Invalid or inactive station UID' });
  const node = nodeRows[0];

  const client = await db.connect();
  try {
    const { rows: [contrib] } = await client.query(
      'INSERT INTO contributions(user_id,node_id,liters) VALUES($1,$2,$3) RETURNING *',
      [req.user.id, p.uid, p.liters]
    );

    const pointsEarned = Math.round(Number(p.liters) * 20);

    await client.query(
      "UPDATE contributions SET status='approved', points_awarded=$1, reviewed_at=now() WHERE id=$2",
      [pointsEarned, contrib.id]
    );

    await client.query(
      'INSERT INTO points_ledger(user_id,delta,reason,contribution_id) VALUES($1,$2,$3,$4)',
      [req.user.id, pointsEarned, `Refill at ${node.name || p.uid}`, contrib.id]
    );

    res.status(201).json({
      pointsEarned,
      liters: Number(p.liters),
      node_id: p.uid,
      node_name: node.name,
      status: 'approved',
      message: `Refill confirmed! You earned ${pointsEarned} green points.`
    });
  } finally {
    client.release();
  }
}));

// ─── Rewards ─────────────────────────────────────────────────────────────────
app.get('/api/rewards', auth, asyncRoute(async (req, res) => {
  const uid = req.user.id;
  const { rows: [{ balance }] } = await db.query(
    'SELECT COALESCE(SUM(delta),0)::int AS balance FROM points_ledger WHERE user_id=$1', [uid]
  );
  const { rows } = await db.query('SELECT * FROM rewards WHERE active=true ORDER BY points_cost');
  res.json({
    points: balance,
    rewards: rows.map(r => ({ ...r, cost: r.points_cost }))
  });
}));

app.post('/api/rewards/:id/redeem', auth, asyncRoute(async (req, res) => {
  const client = await db.connect();
  try {
    const { rows } = await client.query('SELECT * FROM rewards WHERE id=$1 AND active=true', [req.params.id]);
    const reward = rows[0];
    if (!reward || reward.stock < 1) {
      return res.status(409).json({ error: 'Reward unavailable or out of stock' });
    }

    const b = await client.query(
      'SELECT COALESCE(SUM(delta),0)::int AS balance FROM points_ledger WHERE user_id=$1',
      [req.user.id]
    );
    const balance = b.rows[0].balance;
    const cost = reward.points_cost || reward.cost;

    if (balance < cost) {
      return res.status(400).json({ error: `Not enough green points. You need ${cost} pts but have ${balance} pts.` });
    }

    await client.query('UPDATE rewards SET stock=stock-1 WHERE id=$1', [reward.id]);

    const r = await client.query(
      'INSERT INTO redemptions(user_id,reward_id,points_spent) VALUES($1,$2,$3) RETURNING *',
      [req.user.id, reward.id, cost]
    );

    await client.query(
      'INSERT INTO points_ledger(user_id,delta,reason,redemption_id) VALUES($1,$2,$3,$4)',
      [req.user.id, -cost, 'Redeemed ' + reward.title, r.rows[0].id]
    );

    const code = 'ECO-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    res.status(201).json({
      code,
      reward_title: reward.title,
      points_spent: cost
    });
  } finally {
    client.release();
  }
}));

// ─── History ─────────────────────────────────────────────────────────────────
app.get('/api/history', auth, asyncRoute(async (req, res) => {
  const uid = req.user.id;
  const { rows: refills } = await db.query(
    'SELECT c.id, n.name AS node_name, c.node_id AS uid, c.liters, c.points_awarded AS points_earned, c.created_at FROM contributions c LEFT JOIN nodes n ON n.id = c.node_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 100',
    [uid]
  );
  const { rows: transactions } = await db.query(
    'SELECT id, delta, reason, created_at FROM points_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
    [uid]
  );
  const { rows: redemptions } = await db.query(
    'SELECT r.id, r.points_spent, r.created_at, r.status, w.title AS reward_title FROM redemptions r JOIN rewards w ON r.reward_id = w.id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 100',
    [uid]
  );

  res.json({ refills, transactions, redemptions });
}));

// ─── Profile ─────────────────────────────────────────────────────────────────
app.get('/api/profile', auth, asyncRoute(async (req, res) => {
  const uid = req.user.id;
  const { rows: [{ balance }] } = await db.query(
    'SELECT COALESCE(SUM(delta),0)::int AS balance FROM points_ledger WHERE user_id=$1', [uid]
  );
  const { rows: [{ refills, total_liters }] } = await db.query(
    "SELECT COUNT(*)::int AS refills, COALESCE(SUM(liters),0)::float AS total_liters FROM contributions WHERE user_id=$1 AND status='approved'",
    [uid]
  );
  const { rows: leaderboard } = await db.query(
    'SELECT user_id, SUM(delta) AS earned FROM points_ledger WHERE delta > 0 GROUP BY user_id ORDER BY earned DESC'
  );
  const rankIndex = leaderboard.findIndex(x => x.user_id === uid);
  const rank = rankIndex >= 0 ? rankIndex + 1 : 1;

  const numLiters = Number(total_liters || 0);
  res.json({
    stats: {
      points: balance,
      refills: refills || 0,
      liters: numLiters,
      plasticAvoided: numLiters * 40
    },
    rank
  });
}));

// ─── Admin ───────────────────────────────────────────────────────────────────
app.get('/api/admin/summary', auth, roles('admin', 'operator'), asyncRoute(async (req, res) => {
  const [users, nodes, refills] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS count FROM users'),
    db.query('SELECT COUNT(*)::int AS count FROM nodes WHERE active=true'),
    db.query('SELECT COUNT(*)::int AS count FROM contributions')
  ]);
  const { rows: nodeList } = await db.query('SELECT id AS uid, name, location, active, created_at FROM nodes ORDER BY created_at DESC');
  res.json({
    counts: { users: users.rows[0].count, nodes: nodes.rows[0].count, refills: refills.rows[0].count },
    nodes: nodeList
  });
}));

app.post('/api/admin/nodes', auth, roles('admin'), asyncRoute(async (req, res) => {
  const body = req.body;
  const idValue = body.id || body.uid;
  const p = parse(z.object({
    id: idSchema,
    name: z.string().min(2).max(100),
    location: z.string().min(2).max(200)
  }), { ...body, id: idValue });

  const { rows } = await db.query(
    'INSERT INTO nodes(id,name,location) VALUES($1,$2,$3) RETURNING *',
    [p.id, p.name, p.location]
  );
  res.status(201).json({ ...rows[0], uid: rows[0].id });
}));

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', details: err.issues });
  if (err.code === '23505') return res.status(409).json({ error: 'Duplicate record' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist' });
  console.error('[API Error]:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = '8b79ada5f64f30d4b313c1051ea1239fcc2d98087fcd054631b8a5e4672568e9';
}

const port = Number(process.env.PORT || 5001);
app.listen(port, () => console.log(`.env API running on http://localhost:${port}`));
