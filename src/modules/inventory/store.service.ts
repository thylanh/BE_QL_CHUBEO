import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/database.service';

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  updatedAt: string;
}

@Injectable()
export class InventoryStoreService {
  constructor(private readonly database: DatabaseService) {}

  async listInventory() {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, quantity, min_quantity AS "minQuantity", updated_at AS "updatedAt" FROM inventory ORDER BY name',
    );
    return result.rows.map(normalizeInventory);
  }

  async getInventoryItem(id: string) {
    const result = await this.database.query<InventoryItem>(
      'SELECT id, name, unit, quantity, min_quantity AS "minQuantity", updated_at AS "updatedAt" FROM inventory WHERE id = $1',
      [id],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }

  async adjustInventory(id: string, delta: number) {
    const result = await this.database.query<InventoryItem>(
      'UPDATE inventory SET quantity = quantity + $2, updated_at = NOW() WHERE id = $1 AND quantity + $2 >= 0 RETURNING id, name, unit, quantity, min_quantity AS "minQuantity", updated_at AS "updatedAt"',
      [id, delta],
    );
    return result.rows[0] && normalizeInventory(result.rows[0]);
  }
}

function normalizeInventory(item: InventoryItem) {
  return { ...item, updatedAt: new Date(item.updatedAt).toISOString() };
}
