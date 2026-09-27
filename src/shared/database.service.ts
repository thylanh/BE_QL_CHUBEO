import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const bootstrapSql = ``;

function normalizeDatabaseUrl(connectionString?: string) {
  if (!connectionString) return connectionString;

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
    if (['prefer', 'require', 'verify-ca'].includes(sslMode ?? '')) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private readonly databaseUrl = normalizeDatabaseUrl(
    process.env.DATABASE_URL ?? process.env.DATABASE_URL_POOLED,
  );

  private readonly pool = new Pool({
    connectionString: this.databaseUrl,
    max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 10,
    ssl: this.databaseUrl?.includes('sslmode=verify-full')
      ? undefined
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
