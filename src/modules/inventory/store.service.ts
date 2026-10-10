import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export interface InventoryInput {
  name: string;
  unit: string;
  quantity?: number;
  minQuantity?: number;
  costPrice?: number;
  image?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  costPrice: number;
  isLowStock?: boolean;
  updatedAt: string;
}

export interface InventorySummary {
  itemCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  inventoryValue: number;
}

@Injectable()
export class InventoryStoreService {
  constructor(private readonly database: DatabaseService) {}

  async summary(): Promise<InventorySummary> {
    const result = await this.database.query<InventorySummary>(
      'SELECT COUNT(*)::int AS "itemCount", COUNT(*) FILTER (WHERE quantity <= min_quantity)::int AS "lowStockCount", COUNT(*) FILTER (WHERE quantity <= 0)::int AS "outOfStockCount", COALESCE(SUM(quantity * cost_price), 0)::float8 AS "inventoryValue" FROM inventory',
    );
    return result.rows[0];
  }

  async listInventory() {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory ORDER BY name',
    );
    return result.rows.map(normalizeInventory);
  }

  async lowStockInventory() {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory WHERE quantity <= min_quantity OR quantity <= 0 ORDER BY name',
    );
    return result.rows.map(normalizeInventory);
  }

  async getInventoryItem(id: string) {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory WHERE id = $1',
      [id],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async createInventoryItem(input: InventoryInput) {
    const id = randomUUID();
    const result = await this.database.query<InventoryItem>(
      'INSERT INTO inventory (id, name, unit, quantity, min_quantity, cost_price, image, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id, name, unit, quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt"',
      [
        id,
        input.name,
        input.unit,
        Number(input.quantity ?? 0),
        Number(input.minQuantity ?? 0),
        Number(input.costPrice ?? 0),
        input.image ?? null,
      ],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async deleteInventoryItem(id: string) {
    const result = await this.database.query<InventoryItem>(
      'DELETE FROM inventory WHERE id = $1 RETURNING id, name, unit, quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt"',
      [id],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async adjustInventory(id: string, delta: number) {
    const result = await this.database.query<InventoryItem>(
      'UPDATE inventory SET quantity = quantity + $2, updated_at = NOW() WHERE id = $1 AND quantity + $2 >= 0 RETURNING id, name, unit, quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt"',
      [id, delta],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }
}

function normalizeInventory(item: InventoryItem) {
  const quantity = Number(item.quantity);
  const minQuantity = Number(item.minQuantity);
  return {
    ...item,
    quantity,
    minQuantity,
    costPrice: Number(item.costPrice),
    isLowStock: quantity <= minQuantity,
    updatedAt: new Date(item.updatedAt).toISOString(),
  };
}
