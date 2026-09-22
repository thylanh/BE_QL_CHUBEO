import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database.service';

export interface MenuIngredient {
  ingredient_id: string;
  amount: number;
}
export interface MenuItem {
  id: string;
  name: string;
  price: number;
  ingredients: Record<string, number>;
  created_at: string;
  category: string | null;
  description: string | null;
  image: string | null;
  menu_item_ingredients: MenuIngredient[];
  active: boolean;
}
type MenuRow = Omit<MenuItem, 'ingredients' | 'menu_item_ingredients'> & {
  ingredient_id?: string;
  amount?: number;
};
export interface MenuInput {
  name: string;
  price: number;
  category?: string | null;
  description?: string | null;
  image?: string | null;
  active?: boolean;
  ingredients?: MenuIngredient[];
}
const menuQuery = `SELECT m.id, m.name, m.price::float8, m.category, m.description, m.image, m.created_at, m.active, mi.ingredient_id, mi.amount::float8 FROM menu_items m LEFT JOIN menu_item_ingredients mi ON mi.menu_item_id = m.id`;

@Injectable()
export class MenuStoreService {
  constructor(private readonly database: DatabaseService) {}
  async listMenuItems(active?: boolean) {
    const result = await this.database.query<MenuRow>(
      `${menuQuery}${active === undefined ? '' : ' WHERE m.active = $1'} ORDER BY m.name`,
      active === undefined ? undefined : [active],
    );
    return groupMenuItems(result.rows);
  }
  async getMenuItem(id: string) {
    const result = await this.database.query<MenuRow>(
      `${menuQuery} WHERE m.id = $1`,
      [id],
    );
    return groupMenuItems(result.rows)[0];
  }
  async createMenuItem(input: MenuInput) {
    const id = randomUUID();
    return this.database.transaction(async (client) => {
      await client.query(
        'INSERT INTO menu_items (id, name, price, category, description, image, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          id,
          input.name,
          input.price,
          input.category ?? null,
          input.description ?? null,
          input.image ?? null,
          input.active ?? true,
        ],
      );
      await replaceIngredients(client, id, input.ingredients ?? []);
      return getMenuItemWithClient(client, id);
    });
  }
  async updateMenuItem(id: string, input: Partial<MenuInput>) {
    return this.database.transaction(async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      const setField = (column: string, value: unknown) => {
        fields.push(`${column} = $${values.length + 1}`);
        values.push(value);
      };
      if (input.name !== undefined) setField('name', input.name);
      if (input.price !== undefined) setField('price', input.price);
      if (input.category !== undefined)
        setField('category', input.category ?? null);
      if (input.description !== undefined)
        setField('description', input.description ?? null);
      if (input.image !== undefined) setField('image', input.image ?? null);
      if (input.active !== undefined) setField('active', input.active);
      if (fields.length) {
        values.push(id);
        const result = await client.query(
          `UPDATE menu_items SET ${fields.join(', ')} WHERE id = $${values.length}`,
          values,
        );
        if (!result.rowCount) return undefined;
      } else {
        const result = await client.query(
          'SELECT id FROM menu_items WHERE id = $1',
          [id],
        );
        if (!result.rowCount) return undefined;
      }
      if (input.ingredients !== undefined)
        await replaceIngredients(client, id, input.ingredients);
      return getMenuItemWithClient(client, id);
    });
  }
  async deleteMenuItem(id: string) {
    const result = await this.database.query(
      'UPDATE menu_items SET active = FALSE WHERE id = $1 AND active = TRUE RETURNING id',
      [id],
    );
    return result.rowCount ? this.getMenuItem(id) : undefined;
  }
}
async function getMenuItemWithClient(client: PoolClient, id: string) {
  const result = await client.query<MenuRow>(`${menuQuery} WHERE m.id = $1`, [
    id,
  ]);
  return groupMenuItems(result.rows)[0];
}
async function replaceIngredients(
  client: PoolClient,
  menuItemId: string,
  ingredients: MenuIngredient[],
) {
  await client.query(
    'DELETE FROM menu_item_ingredients WHERE menu_item_id = $1',
    [menuItemId],
  );
  for (const ingredient of ingredients)
    await client.query(
      'INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, amount) VALUES ($1, $2, $3)',
      [menuItemId, ingredient.ingredient_id, ingredient.amount],
    );
}
function groupMenuItems(rows: MenuRow[]) {
  const items = new Map<string, MenuItem>();
  for (const row of rows) {
    const item = items.get(row.id) ?? {
      id: row.id,
      name: row.name,
      price: Number(row.price),
      ingredients: {},
      created_at: new Date(row.created_at).toISOString(),
      category: row.category ?? null,
      description: row.description ?? null,
      image: row.image ?? null,
      menu_item_ingredients: [],
      active: row.active,
    };
    if (row.ingredient_id) {
      item.ingredients[row.ingredient_id] = Number(row.amount);
      item.menu_item_ingredients.push({
        ingredient_id: row.ingredient_id,
        amount: Number(row.amount),
      });
    }
    items.set(row.id, item);
  }
  return [...items.values()];
}
