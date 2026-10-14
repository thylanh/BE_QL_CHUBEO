import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export interface InventoryInput {
  name: string;
  unit: string;
  conversionUnit?: number;
  quantity?: number;
  minQuantity?: number;
  costPrice?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  conversionUnit?: number | null;
  quantity: number;
  minQuantity: number;
  costPrice: number;
  baseUnitTotal?: number;
  isLowStock?: boolean;
  updatedAt: string;
}

@Injectable()
export class InventoryStoreService {
  constructor(private readonly database: DatabaseService) {}

  async listInventory() {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, conversion_unit AS "conversionUnit", quantity, quantity * COALESCE(conversion_unit, 1) AS "baseUnitTotal", min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory ORDER BY name',
    );
    return result.rows.map(normalizeInventory);
  }

  async lowStockInventory() {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, conversion_unit AS "conversionUnit", quantity, quantity * COALESCE(conversion_unit, 1) AS "baseUnitTotal", min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory WHERE quantity <= min_quantity OR quantity <= 0 ORDER BY name',
    );
    return result.rows.map(normalizeInventory);
  }

  async getInventoryItem(id: string) {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, conversion_unit AS "conversionUnit", quantity, quantity * COALESCE(conversion_unit, 1) AS "baseUnitTotal", min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt" FROM inventory WHERE id = $1',
      [id],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async createInventoryItem(input: InventoryInput) {
    const id = randomUUID();
    const result = await this.database.query<InventoryItem>(
      'INSERT INTO inventory (id, name, unit, conversion_unit, quantity, min_quantity, cost_price, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id, name, unit, conversion_unit AS "conversionUnit", quantity, quantity * COALESCE(conversion_unit, 1) AS "baseUnitTotal", min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt"',
      [
        id,
        input.name,
        input.unit,
        Number(input.conversionUnit ?? 1),
        Number(input.quantity ?? 0),
        Number(input.minQuantity ?? 0),
        Number(input.costPrice ?? 0),
      ],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async deleteInventoryItem(id: string) {
    const result = await this.database.query<InventoryItem>(
      'DELETE FROM inventory WHERE id = $1 RETURNING id, name, unit, conversion_unit AS "conversionUnit", quantity, quantity * COALESCE(conversion_unit, 1) AS "baseUnitTotal", min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt"',
      [id],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async adjustInventory(id: string, delta: number) {
    const result = await this.database.query<InventoryItem>(
      'UPDATE inventory SET quantity = quantity + $2, updated_at = NOW() WHERE id = $1 AND quantity + $2 >= 0 RETURNING id, name, unit, conversion_unit AS "conversionUnit", quantity, quantity * COALESCE(conversion_unit, 1) AS "baseUnitTotal", min_quantity AS "minQuantity", cost_price AS "costPrice", updated_at AS "updatedAt"',
      [id, delta],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }
}

function normalizeInventory(item: InventoryItem) {
  const quantity = Number(item.quantity);
  const minQuantity = Number(item.minQuantity);
  const conversionUnit = Number(item.conversionUnit ?? 1);
  const baseUnitTotal = Number(item.baseUnitTotal ?? quantity * conversionUnit);
  return {
    ...item,
    quantity,
    minQuantity,
    conversionUnit,
    baseUnitTotal,
    costPrice: Number(item.costPrice),
    isLowStock: quantity <= minQuantity,
    updatedAt: new Date(item.updatedAt).toISOString(),
  };
}
