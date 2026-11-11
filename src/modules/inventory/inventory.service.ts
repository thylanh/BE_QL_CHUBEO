import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export interface InventoryInput {
  name: string;
  unit: string;
  purchaseUnit?: string;
  conversionRate?: number;
  quantity?: number;
  minQuantity?: number;
  costPrice?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  purchaseUnit: string;
  conversionRate: number;
  quantity: number;
  minQuantity: number;
  costPrice: number;
  isLowStock?: boolean;
  updatedAt: string;
}

export type InventoryTransactionType = 'IN' | 'OUT' | 'ADJUSTMENT';

export interface InventoryTransaction {
  id: string;
  inventoryItemId: string;
  type: InventoryTransactionType;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  inputUnit: string | null;
  conversionRate: number | null;
  referenceId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  inventoryItem?: Pick<InventoryItem, 'id' | 'name' | 'unit'>;
}

export interface InventoryTransactionFilters {
  inventoryItemId?: string;
  type?: InventoryTransactionType;
  from?: string;
  to?: string;
}

export interface InventoryMovementInput {
  quantity: number;
  inputUnit?: string;
  unitCost?: number;
  totalCost?: number;
  referenceId?: string;
  note?: string;
}

interface InventoryDatabaseRow {
  id: string;
  name: string;
  unit: string;
  purchaseUnit: string | null;
  conversionRate: number | string | null;
  quantity: number | string;
  minQuantity: number | string;
  costPrice: number | string;
  updatedAt: Date | string;
}

interface InventoryTransactionRow {
  id: string;
  inventoryItemId: string;
  type: InventoryTransactionType;
  quantity: number | string;
  unitCost: number | string | null;
  totalCost: number | string | null;
  inputUnit: string | null;
  conversionRate: number | string | null;
  referenceId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: Date | string;
  inventoryItem?: Pick<InventoryItem, 'id' | 'name' | 'unit'>;
}

interface InventoryTransactionSummaryRow {
  transactionCount: number | string;
  stockInCount: number | string;
  stockInQuantity: number | string;
  stockInCost: number | string;
  stockOutCount: number | string;
  stockOutQuantity: number | string;
}

interface InventoryTransactionItemSummaryRow {
  inventoryItemId: string;
  name: string;
  unit: string;
  transactionCount: number | string;
  quantity: number | string;
  totalCost: number | string;
}

@Injectable()
export class InventoryStoreService {
  constructor(private readonly database: DatabaseService) {}

  async listInventory() {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, purchase_unit AS "purchaseUnit", conversion_rate AS "conversionRate", quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory ORDER BY name',
    );
    return result.rows.map(normalizeInventory);
  }

  async lowStockInventory() {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, purchase_unit AS "purchaseUnit", conversion_rate AS "conversionRate", quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory WHERE quantity <= min_quantity OR quantity <= 0 ORDER BY name',
    );
    return result.rows.map(normalizeInventory);
  }

  async getInventoryItem(id: string) {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, purchase_unit AS "purchaseUnit", conversion_rate AS "conversionRate", quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory WHERE id = $1',
      [id],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async createInventoryItem(input: InventoryInput) {
    const id = randomUUID();
    const purchaseUnit = input.purchaseUnit?.trim() || input.unit.trim();
    const conversionRate = Number(input.conversionRate ?? 1);
    const result = await this.database.query<InventoryItem>(
      'INSERT INTO inventory (id, name, unit, purchase_unit, conversion_rate, quantity, min_quantity, cost_price, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id, name, unit, purchase_unit AS "purchaseUnit", conversion_rate AS "conversionRate", quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt"',
      [
        id,
        input.name,
        input.unit,
        purchaseUnit,
        conversionRate,
        Number(input.quantity ?? 0),
        Number(input.minQuantity ?? 0),
        Number(input.costPrice ?? 0),
      ],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async deleteInventoryItem(id: string) {
    const result = await this.database.query<InventoryItem>(
      'DELETE FROM inventory WHERE id = $1 RETURNING id, name, unit, purchase_unit AS "purchaseUnit", conversion_rate AS "conversionRate", quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt"',
      [id],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async createStockTransaction(
    id: string,
    type: 'IN' | 'OUT',
    input: InventoryMovementInput,
    createdBy: string,
  ) {
    return this.database.transaction(async (client) => {
      const itemResult = await client.query<InventoryDatabaseRow>(
        `SELECT id, name, unit, purchase_unit AS "purchaseUnit",
                conversion_rate AS "conversionRate", quantity, min_quantity AS "minQuantity",
                cost_price AS "costPrice", updated_at AS "updatedAt"
         FROM inventory WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const item = itemResult.rows[0];
      if (!item) throw new NotFoundException('Không tìm thấy nguyên liệu');

      const purchaseUnit = item.purchaseUnit ?? item.unit;
      const inputUnit = input.inputUnit ?? purchaseUnit;
      let conversionRate: number;
      if (inputUnit === item.unit) {
        conversionRate = 1;
      } else if (inputUnit === purchaseUnit) {
        conversionRate = Number(item.conversionRate ?? 1);
      } else {
        throw new BadRequestException(
          'inputUnit phải là đơn vị tồn kho hoặc đơn vị mua vào',
        );
      }

      const stockQuantity = input.quantity * conversionRate;
      const currentQuantity = Number(item.quantity);
      if (type === 'OUT' && currentQuantity < stockQuantity) {
        throw new BadRequestException('Số lượng tồn không thể âm');
      }

      const normalizedInput = {
        ...input,
        ...(input.unitCost === undefined
          ? {}
          : { unitCost: roundMoney(input.unitCost) }),
      };
      const totalCost = resolveTotalCost(normalizedInput);
      const unitCost =
        totalCost === null
          ? null
          : (normalizedInput.unitCost ??
            roundMoney(totalCost / input.quantity));
      const delta = type === 'IN' ? stockQuantity : -stockQuantity;
      const updatedResult = await client.query<InventoryDatabaseRow>(
        `UPDATE inventory
         SET quantity = quantity + $2::numeric,
             cost_price = CASE
               WHEN $3::numeric IS NOT NULL AND $2::numeric > 0
                    AND quantity + $2::numeric > 0
               THEN ((quantity * cost_price) + $3::numeric)
                    / (quantity + $2::numeric)
               ELSE cost_price
             END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, unit, purchase_unit AS "purchaseUnit",
                   conversion_rate AS "conversionRate", quantity, min_quantity AS "minQuantity",
                   cost_price AS "costPrice", updated_at AS "updatedAt"`,
        [id, delta, type === 'IN' ? totalCost : null],
      );
      const updatedItem = updatedResult.rows[0];
      const transactionResult = await client.query<InventoryTransactionRow>(
        `INSERT INTO inventory_transactions (
           id, inventory_item_id, type, quantity, unit_cost, total_cost,
           input_unit, conversion_rate, reference_id, note, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, inventory_item_id AS "inventoryItemId", type,
                   quantity::float8 AS quantity, unit_cost::float8 AS "unitCost",
                   total_cost::float8 AS "totalCost", input_unit AS "inputUnit",
                   conversion_rate::float8 AS "conversionRate",
                   reference_id AS "referenceId", note, created_by AS "createdBy",
                   created_at AS "createdAt"`,
        [
          randomUUID(),
          id,
          type,
          input.quantity,
          unitCost,
          type === 'IN' ? totalCost : null,
          inputUnit,
          conversionRate,
          input.referenceId ?? null,
          input.note ?? null,
          createdBy,
        ],
      );

      return {
        inventory: normalizeInventory(updatedItem),
        transaction: mapTransaction({
          ...transactionResult.rows[0],
          inventoryItem: {
            id: updatedItem.id,
            name: updatedItem.name,
            unit: updatedItem.unit,
          },
        }),
      };
    });
  }

  async listTransactions(filters: InventoryTransactionFilters = {}) {
    validateDateRange(filters.from, filters.to);
    const result = await this.database.query<InventoryTransactionRow>(
      `${transactionSelect}
       WHERE ($1::text IS NULL OR t.inventory_item_id = $1)
         AND ($2::text IS NULL OR t.type = $2)
         AND ($3::date IS NULL OR t.created_at >= $3::date)
         AND ($4::date IS NULL OR t.created_at < ($4::date + INTERVAL '1 day'))
       ORDER BY t.created_at DESC, t.id DESC`,
      [
        filters.inventoryItemId ?? null,
        filters.type ?? null,
        filters.from ?? null,
        filters.to ?? null,
      ],
    );
    const summary = await this.getTransactionSummary(filters);
    return {
      transactions: result.rows.map(mapTransaction),
      summary,
    };
  }

  async summarizeTransactions(filters: InventoryTransactionFilters = {}) {
    validateDateRange(filters.from, filters.to);
    const summary = await this.getTransactionSummary(filters);
    const items = await this.database.query<InventoryTransactionItemSummaryRow>(
      `SELECT t.inventory_item_id AS "inventoryItemId", i.name, i.unit,
              COUNT(*) FILTER (WHERE t.type = 'IN')::int AS "transactionCount",
              COALESCE(SUM(t.quantity * t.conversion_rate)
                FILTER (WHERE t.type = 'IN'), 0)::float8 AS quantity,
              COALESCE(SUM(t.total_cost)
                FILTER (WHERE t.type = 'IN'), 0)::float8 AS "totalCost"
       FROM inventory_transactions t
       JOIN inventory i ON i.id = t.inventory_item_id
       WHERE ($1::text IS NULL OR t.inventory_item_id = $1)
         AND ($2::text IS NULL OR t.type = $2)
         AND ($3::date IS NULL OR t.created_at >= $3::date)
         AND ($4::date IS NULL OR t.created_at < ($4::date + INTERVAL '1 day'))
       GROUP BY t.inventory_item_id, i.name, i.unit
       HAVING COUNT(*) FILTER (WHERE t.type = 'IN') > 0
       ORDER BY quantity DESC, i.name`,
      [
        filters.inventoryItemId ?? null,
        filters.type ?? null,
        filters.from ?? null,
        filters.to ?? null,
      ],
    );
    return {
      summary,
      byItem: items.rows.map((row) => ({
        inventoryItemId: row.inventoryItemId,
        name: row.name,
        unit: row.unit,
        transactionCount: Number(row.transactionCount),
        quantity: Number(row.quantity),
        totalCost: Number(row.totalCost),
      })),
    };
  }

  private async getTransactionSummary(filters: InventoryTransactionFilters) {
    const result = await this.database.query<InventoryTransactionSummaryRow>(
      `SELECT COUNT(*)::int AS "transactionCount",
              COUNT(*) FILTER (WHERE type = 'IN')::int AS "stockInCount",
              COALESCE(SUM(quantity * conversion_rate)
                FILTER (WHERE type = 'IN'), 0)::float8 AS "stockInQuantity",
              COALESCE(SUM(total_cost)
                FILTER (WHERE type = 'IN'), 0)::float8 AS "stockInCost",
              COUNT(*) FILTER (WHERE type = 'OUT')::int AS "stockOutCount",
              COALESCE(SUM(quantity * conversion_rate)
                FILTER (WHERE type = 'OUT'), 0)::float8 AS "stockOutQuantity"
       FROM inventory_transactions
       WHERE ($1::text IS NULL OR inventory_item_id = $1)
         AND ($2::text IS NULL OR type = $2)
         AND ($3::date IS NULL OR created_at >= $3::date)
         AND ($4::date IS NULL OR created_at < ($4::date + INTERVAL '1 day'))`,
      [
        filters.inventoryItemId ?? null,
        filters.type ?? null,
        filters.from ?? null,
        filters.to ?? null,
      ],
    );
    const row = result.rows[0];
    return {
      transactionCount: Number(row.transactionCount),
      stockInCount: Number(row.stockInCount),
      stockInQuantity: Number(row.stockInQuantity),
      stockInCost: Number(row.stockInCost),
      stockOutCount: Number(row.stockOutCount),
      stockOutQuantity: Number(row.stockOutQuantity),
    };
  }
}

const transactionSelect = `
  SELECT t.id, t.inventory_item_id AS "inventoryItemId", t.type,
         t.quantity::float8 AS quantity, t.unit_cost::float8 AS "unitCost",
         t.total_cost::float8 AS "totalCost", t.input_unit AS "inputUnit",
         t.conversion_rate::float8 AS "conversionRate",
         t.reference_id AS "referenceId", t.note, t.created_by AS "createdBy",
         t.created_at AS "createdAt",
         json_build_object('id', i.id, 'name', i.name, 'unit', i.unit) AS "inventoryItem"
  FROM inventory_transactions t
  JOIN inventory i ON i.id = t.inventory_item_id`;

function mapTransaction(row: InventoryTransactionRow): InventoryTransaction {
  return {
    ...row,
    quantity: Number(row.quantity),
    unitCost: row.unitCost === null ? null : Number(row.unitCost),
    totalCost: row.totalCost === null ? null : Number(row.totalCost),
    conversionRate:
      row.conversionRate === null ? null : Number(row.conversionRate),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function normalizeInventory(item: InventoryItem | InventoryDatabaseRow) {
  const quantity = Number(item.quantity);
  const minQuantity = Number(item.minQuantity);
  const conversionRate = Number(item.conversionRate ?? 1);
  return {
    ...item,
    purchaseUnit: item.purchaseUnit ?? item.unit,
    conversionRate,
    quantity,
    minQuantity,
    costPrice: Number(item.costPrice),
    isLowStock: quantity <= minQuantity,
    updatedAt: new Date(item.updatedAt).toISOString(),
  };
}

function resolveTotalCost(input: InventoryMovementInput) {
  if (input.totalCost !== undefined) {
    if (
      input.unitCost !== undefined &&
      Math.abs(roundMoney(input.quantity * input.unitCost) - input.totalCost) >
        0.01
    ) {
      throw new BadRequestException(
        'totalCost không khớp với quantity và unitCost',
      );
    }
    return roundMoney(input.totalCost);
  }
  return input.unitCost === undefined
    ? null
    : roundMoney(input.quantity * input.unitCost);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
