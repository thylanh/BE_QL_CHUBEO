import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

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
export class DatabaseService implements OnModuleDestroy {
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
