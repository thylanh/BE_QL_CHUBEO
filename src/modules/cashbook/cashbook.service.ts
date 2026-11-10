import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export type CashbookType = 'INCOME' | 'EXPENSE';
export type CashbookCategory = 'MISC_PURCHASE' | 'SCRAP_SALE' | 'OTHER';

export interface CashbookEntry {
  id: string;
  type: CashbookType;
  category: CashbookCategory;
  description: string;
  amount: number;
  occurredAt: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

interface CashbookRow {
  id: string;
  type: CashbookType;
  category: CashbookCategory;
  description: string;
  amount: number;
  occurredAt: Date | string;
  note: string | null;
  createdBy: string;
  createdAt: Date | string;
}

@Injectable()
export class CashbookService implements OnModuleInit {
  constructor(private readonly database: DatabaseService) {}

  async onModuleInit() {
    await this.database.query(`
      CREATE TABLE IF NOT EXISTS shop_cashbook_entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
        category TEXT NOT NULL CHECK (
          category IN ('MISC_PURCHASE', 'SCRAP_SALE', 'OTHER')
        ),
        description TEXT NOT NULL,
        amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
        occurred_at TIMESTAMPTZ NOT NULL,
        note TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.database.query(
      'CREATE INDEX IF NOT EXISTS shop_cashbook_entries_occurred_at_idx ON shop_cashbook_entries (occurred_at DESC)',
    );
  }

  async list(
    input: {
      type?: CashbookType;
      from?: string;
      to?: string;
    } = {},
  ) {
    validateDateRange(input.from, input.to);
    const result = await this.database.query<CashbookRow>(
      `
        SELECT id, type, category, description, amount::float8 AS amount,
               occurred_at AS "occurredAt", note, created_by AS "createdBy",
               created_at AS "createdAt"
        FROM shop_cashbook_entries
        WHERE ($1::text IS NULL OR type = $1)
          AND ($2::date IS NULL OR occurred_at >= $2::date)
          AND ($3::date IS NULL OR occurred_at < ($3::date + INTERVAL '1 day'))
        ORDER BY occurred_at DESC, created_at DESC
      `,
      [input.type ?? null, input.from ?? null, input.to ?? null],
    );

    const entries = result.rows.map(mapRow);
    const income = entries.reduce(
      (total, entry) => total + (entry.type === 'INCOME' ? entry.amount : 0),
      0,
    );
    const expense = entries.reduce(
      (total, entry) => total + (entry.type === 'EXPENSE' ? entry.amount : 0),
      0,
    );

    return {
      entries,
      summary: { income, expense, balance: income - expense },
    };
  }

  async create(
    input: {
      type: CashbookType;
      category: CashbookCategory;
      description: string;
      amount: number;
      occurredAt?: string;
      note?: string;
    },
    createdBy: string,
  ): Promise<CashbookEntry> {
    const occurredAt = input.occurredAt
      ? new Date(input.occurredAt)
      : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('occurredAt không hợp lệ');
    }

    const result = await this.database.query<CashbookRow>(
      `
        INSERT INTO shop_cashbook_entries (
          id, type, category, description, amount, occurred_at, note, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, type, category, description, amount::float8 AS amount,
                  occurred_at AS "occurredAt", note, created_by AS "createdBy",
                  created_at AS "createdAt"
      `,
      [
        randomUUID(),
        input.type,
        input.category,
        input.description,
        input.amount,
        occurredAt.toISOString(),
        input.note ?? null,
        createdBy,
      ],
    );

    return mapRow(result.rows[0]);
  }
}

function mapRow(row: CashbookRow): CashbookEntry {
  return {
    ...row,
    amount: Number(row.amount),
    occurredAt: new Date(row.occurredAt).toISOString(),
    note: row.note ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function validateDateRange(from?: string, to?: string) {
  const isValidDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) {
    throw new BadRequestException('from và to phải có định dạng YYYY-MM-DD');
  }
  if (from && to && from > to) {
    throw new BadRequestException('from phải nhỏ hơn hoặc bằng to');
  }
}
