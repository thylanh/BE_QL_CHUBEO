import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/database.service';

export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

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

type OrderRow = Order & { line: OrderItem };

const orderQuery = `SELECT o.id, COALESCE(o.table_name, '') AS "table", COALESCE(o.order_type, 'Tại quán') AS "orderType", o.total::float8 - o.service_fee::float8 AS subtotal, o.service_fee::float8 AS "serviceFee", o.total::float8, o.status, o.note, o.inventory_deducted AS "inventoryDeducted", o.created_by AS "createdBy", o.created_at AS "createdAt", o.completed_at AS "completedAt", o.cancelled_at AS "cancelledAt", json_build_object('menuItemId', oi.menu_item_id, 'name', oi.name, 'quantity', oi.quantity, 'unitPrice', oi.unit_price::float8, 'total', oi.total::float8) AS line FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id`;

@Injectable()
export class OrdersStoreService {
  constructor(private readonly database: DatabaseService) {}

  async listOrders() {
    const result = await this.database.query<OrderRow>(orderQuery);
    return groupOrders(result.rows);
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
