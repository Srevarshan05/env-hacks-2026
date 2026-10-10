-- .env migration: safe, additive-only changes
-- Run with: node src/runMigration.js

-- Add description to rewards (nullable so existing rows are unaffected)
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS description TEXT;

-- Seed a demo node compatible with both NODE-### and ECO-* formats
-- ECO-DEMO-001 for the hackathon scanner demo
INSERT INTO nodes(id, name, location)
VALUES ('ECO-DEMO-001', 'Campus Water Purifier', 'Main Campus · Block A')
ON CONFLICT (id) DO NOTHING;

-- Seed a standard NODE-001 for admin QR generation
INSERT INTO nodes(id, name, location)
VALUES ('NODE-001', 'Library Water Station', 'Library Building · Ground Floor')
ON CONFLICT (id) DO NOTHING;

-- Seed initial rewards catalogue
INSERT INTO rewards(title, description, points_cost, stock) VALUES
  ('Reusable Bamboo Bottle',   'Eco-friendly reusable bottle voucher.',         100, 20),
  ('Plant a Tree',             'Redeem a virtual tree planting certificate.',    150, 30),
  ('Green Store Gift Voucher', '₹100 eco-store voucher.',                       250, 10),
  ('Organic Cotton Tote',      'Plastic-free reusable shopping bag.',            200, 15),
  ('Eco Starter Kit',          'Digital voucher for sustainable essentials.',    500,  5)
ON CONFLICT DO NOTHING;
