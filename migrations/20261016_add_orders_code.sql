ALTER TABLE orders
ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE orders
SET code = split_part(id, '-', 4)
WHERE code IS NULL;

ALTER TABLE orders
ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_code_unique_idx
ON orders (code);
