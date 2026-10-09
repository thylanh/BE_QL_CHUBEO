import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/database.service';

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

  async getInventoryItem(id: string) {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory WHERE id = $1',
      [id],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async lowStockInventory() {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, quantity, min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory WHERE quantity <= min_quantity ORDER BY quantity ASC, name',
    );
    return result.rows.map(normalizeInventory);
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
