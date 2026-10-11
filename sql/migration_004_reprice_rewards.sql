-- migration_004: re-price rewards for the 1 point per verified litre rule (applied to RDS ecoair on 2026-10-11)
--
-- Data-only change: points_cost of the five seeded rewards (stock, ids and history untouched).
-- Previous costs (100/150/200/250/500) were set when 1 litre earned 10-20 points.

BEGIN;

UPDATE rewards SET points_cost = 5  WHERE title = 'Reusable Bamboo Bottle';
UPDATE rewards SET points_cost = 10 WHERE title = 'Plant a Tree';
UPDATE rewards SET points_cost = 15 WHERE title = 'Organic Cotton Tote';
UPDATE rewards SET points_cost = 20 WHERE title = 'Green Store Gift Voucher';
UPDATE rewards SET points_cost = 50 WHERE title = 'Eco Starter Kit';

COMMIT;
