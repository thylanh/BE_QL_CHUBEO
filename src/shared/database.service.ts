import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const bootstrapSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'STAFF')),
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  email TEXT UNIQUE,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity INTEGER NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  image TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  category TEXT,
  description TEXT,
  image TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES inventory(id),
  amount NUMERIC(12, 3) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (menu_item_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  table_name TEXT,
  order_type TEXT,
  service_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  inventory_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE menu_item_ingredients ALTER COLUMN amount TYPE NUMERIC(12, 3);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'));`;

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private readonly databaseUrl =
    process.env.DATABASE_URL ?? process.env.DATABASE_URL_POOLED;

  private readonly pool = new Pool({
    connectionString: this.databaseUrl,
    max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 10,
    ssl: this.databaseUrl?.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : process.env.PGSSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
  });

  async onModuleInit() {
    if (!this.databaseUrl) {
      throw new Error(
        'Missing DATABASE_URL or DATABASE_URL_POOLED environment variable',
      );
    }

    const result = await this.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public'",
    );

    if (result.rowCount === 0) {
      await this.query(bootstrapSql);
    } else {
      await this.query(
        'ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image TEXT',
      );
      await this.query(
        'ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image TEXT',
      );
      await this.query(
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ',
      );
    }
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
