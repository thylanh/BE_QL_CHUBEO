import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  ingredients: Record<string, number>;
  created_at: string;
  category: string | null;
  description: string | null;
  color: string | null;
  menu_item_ingredients: { ingredient_id: string; amount: number }[];
  active: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  updatedAt: string;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type OrderLine = OrderItem;

export interface Order {
  id: string;
  table: string;
  orderType: 'Tại quán' | 'Mang đi' | 'Giao hàng';
  lines: OrderItem[];
  customerCount: number;
  note?: string;
  subtotal: number;
  serviceFee: number;
  total: number;
  status: OrderStatus;
  inventoryDeducted: boolean;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

type MenuRow = MenuItem & { ingredient_id?: string; amount?: number };
type OrderRow = Order & { line: OrderItem };

const orderQuery = `SELECT o.id, COALESCE(o.table_name, '') AS "table", COALESCE(o.order_type, 'Tại quán') AS "orderType", o.total::float8 - o.service_fee::float8 AS subtotal, o.service_fee::float8 AS "serviceFee", o.total::float8, o.status, o.note, o.inventory_deducted AS "inventoryDeducted", o.created_by AS "createdBy", o.created_at AS "createdAt", o.completed_at AS "completedAt", o.cancelled_at AS "cancelledAt", json_build_object('menuItemId', oi.menu_item_id, 'name', oi.name, 'quantity', oi.quantity, 'unitPrice', oi.unit_price::float8, 'total', oi.total::float8) AS line FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id`;

@Injectable()
export class OrdersStoreService {
  constructor(private readonly database: DatabaseService) {}

  async listMenuItems() {
    const result = await this.database.query<MenuRow>(
      `SELECT m.id, m.name, m.price::float8, m.category, m.description, m.color, m.created_at, m.active, mi.ingredient_id, mi.amount FROM menu_items m LEFT JOIN menu_item_ingredients mi ON mi.menu_item_id = m.id WHERE m.active = TRUE ORDER BY m.name`,
    );
    return groupMenuItems(result.rows);
  }

  async getMenuItem(id: string) {
    return (await this.listMenuItems()).find((item) => item.id === id);
  }

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

  async listOrders() {
    const result = await this.database.query<OrderRow>(orderQuery);
    return groupOrders(result.rows);
  }

  async createOrder(
    userId: string,
    items: { menuItemId: string; quantity: number }[],
    note?: string,
  ) {
    return this.database.transaction(async (client) => {
      const menuResult = await client.query<MenuRow>(
        `SELECT m.id, m.name, m.price::float8, m.category, m.description, m.color, m.created_at, m.active, mi.ingredient_id, mi.amount FROM menu_items m LEFT JOIN menu_item_ingredients mi ON mi.menu_item_id = m.id WHERE m.id = ANY($1::text[]) AND m.active = TRUE`,
        [items.map((item) => item.menuItemId)],
      );
      const menuItems = groupMenuItems(menuResult.rows);
      const lines = items.map((input) => {
        const item = menuItems.find(
          (menuItem) => menuItem.id === input.menuItemId,
        );
        if (!item) throw new Error(`Không tìm thấy món ${input.menuItemId}`);
        return {
          menuItemId: item.id,
          name: item.name,
          quantity: input.quantity,
          unitPrice: item.price,
          total: item.price * input.quantity,
          ingredients: item.ingredients,
        };
      });
      const requirements: Record<string, number> = {};
      for (const line of lines)
        for (const [ingredientId, amount] of Object.entries(line.ingredients))
          requirements[ingredientId] =
            (requirements[ingredientId] ?? 0) + amount * line.quantity;
      for (const [ingredientId, amount] of Object.entries(requirements)) {
        const stock = await client.query<{ name: string; quantity: number }>(
          'SELECT name, quantity FROM inventory WHERE id = $1 FOR UPDATE',
          [ingredientId],
        );
        if (!stock.rows[0] || stock.rows[0].quantity < amount)
          throw new Error(
            `Tồn kho không đủ: ${stock.rows[0]?.name ?? ingredientId}`,
          );
        await client.query(
          'UPDATE inventory SET quantity = quantity - $2, updated_at = NOW() WHERE id = $1',
          [ingredientId, amount],
        );
      }
      const id = randomUUID();
      const code = `BD-${Date.now().toString().slice(-6)}`;
      const now = new Date();
      const total = lines.reduce((sum, line) => sum + line.total, 0);
      await client.query(
        'INSERT INTO orders (id, code, total, status, note, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)',
        [id, code, total, 'PENDING', note ?? null, userId, now],
      );
      for (const line of lines)
        await client.query(
          'INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, total) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            id,
            line.menuItemId,
            line.name,
            line.quantity,
            line.unitPrice,
            line.total,
          ],
        );
      return {
        id,
        table: '',
        orderType: 'Tại quán' as const,
        lines: lines.map(({ ...line }) => line),
        customerCount: 0,
        note,
        subtotal: total,
        serviceFee: 0,
        total,
        status: 'PENDING' as OrderStatus,
        inventoryDeducted: true,
        createdBy: userId,
        createdAt: now.toISOString(),
      };
    });
  }
  async updateOrderStatus(id: string, status: OrderStatus) {
    return this.database.transaction(async (client) => {
      const result = await client.query<Order>(
        'SELECT id, status FROM orders WHERE id = $1 FOR UPDATE',
        [id],
      );
      const order = result.rows[0];
      if (!order) return undefined;
      if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
        const lines = await client.query<{
          menu_item_id: string;
          quantity: number;
        }>(
          'SELECT menu_item_id, quantity FROM order_items WHERE order_id = $1',
          [id],
        );
        for (const line of lines.rows) {
          const ingredients = await client.query<{
            ingredient_id: string;
            amount: number;
          }>(
            'SELECT ingredient_id, amount FROM menu_item_ingredients WHERE menu_item_id = $1',
            [line.menu_item_id],
          );
          for (const ingredient of ingredients.rows) {
            await client.query(
              'UPDATE inventory SET quantity = quantity + $2, updated_at = NOW() WHERE id = $1',
              [ingredient.ingredient_id, ingredient.amount * line.quantity],
            );
          }
        }
      }
      await client.query(
        "UPDATE orders SET status = $2, updated_at = NOW(), completed_at = CASE WHEN $2 = 'COMPLETED' THEN NOW() ELSE completed_at END, cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN NOW() ELSE cancelled_at END WHERE id = $1",
        [id, status],
      );
      const updated = await client.query<OrderRow>(
        `${orderQuery} WHERE o.id = $1`,
        [id],
      );
      return groupOrders(updated.rows)[0];
    });
  }

  async revenue(from?: string, to?: string) {
    const result = await this.database.query<OrderRow>(
      `${orderQuery} WHERE o.status = 'COMPLETED' AND ($1::date IS NULL OR o.created_at >= $1::date) AND ($2::date IS NULL OR o.created_at < ($2::date + INTERVAL '1 day'))`,
      [from ?? null, to ?? null],
    );
    const orders = groupOrders(result.rows);
    return {
      from: from ?? null,
      to: to ?? null,
      orderCount: orders.length,
      revenue: orders.reduce((sum, order) => sum + order.total, 0),
      orders,
    };
  }
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
      color: row.color ?? null,
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

function normalizeInventory(item: InventoryItem) {
  return { ...item, updatedAt: new Date(item.updatedAt).toISOString() };
}

function groupOrders(rows: OrderRow[]) {
  const orders = new Map<string, Order>();
  for (const row of rows) {
    const order = orders.get(row.id) ?? {
      id: row.id,
      table: row.table,
      orderType: row.orderType,
      lines: [],
      customerCount: row.customerCount ?? 0,
      note: row.note ?? undefined,
      subtotal: Number(row.subtotal),
      serviceFee: Number(row.serviceFee),
      total: Number(row.total),
      status: row.status,
      inventoryDeducted: row.inventoryDeducted,
      createdBy: row.createdBy,
      createdAt: new Date(row.createdAt).toISOString(),
      completedAt: row.completedAt
        ? new Date(row.completedAt).toISOString()
        : undefined,
      cancelledAt: row.cancelledAt
        ? new Date(row.cancelledAt).toISOString()
        : undefined,
    };
    if (row.line?.menuItemId) order.lines.push(row.line);
    orders.set(row.id, order);
  }
  return [...orders.values()];
}
