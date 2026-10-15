import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
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

export interface CreateOrderInput {
  table: string;
  orderType: Order['orderType'];
  lines: Array<{
    menuItemId: string;
    quantity: number;
  }>;
  customerCount: number;
  note?: string;
  serviceFee: number;
}

type OrderRow = Order & { line: OrderItem };

const orderQuery = `SELECT o.id, COALESCE(o.table_name, '') AS "table", COALESCE(o.order_type, 'Tại quán') AS "orderType", o.customer_count AS "customerCount", o.total::float8 - o.service_fee::float8 AS subtotal, o.service_fee::float8 AS "serviceFee", o.total::float8, o.status, o.note, o.inventory_deducted AS "inventoryDeducted", o.created_by AS "createdBy", o.created_at AS "createdAt", o.completed_at AS "completedAt", o.cancelled_at AS "cancelledAt", json_build_object('menuItemId', oi.menu_item_id, 'name', oi.name, 'quantity', oi.quantity, 'price', oi.price::float8, 'total', oi.total::float8) AS line FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id`;

@Injectable()
export class OrdersStoreService {
  constructor(private readonly database: DatabaseService) {}
  //danh sách đơn hàng
  async listOrders() {
    const result = await this.database.query<OrderRow>(orderQuery);
    return groupOrders(result.rows);
  }
  //tạo đơn hàng mới
  async createOrder(input: CreateOrderInput, createdBy: string) {
    const id = randomUUID();
    const serviceFee = input.serviceFee;
    const orderLines = new Map<string, number>();
    for (const line of input.lines)
      orderLines.set(
        line.menuItemId,
        (orderLines.get(line.menuItemId) ?? 0) + line.quantity,
      );
    return this.database.transaction(async (client) => {
      const menuResult = await client.query<{
        id: string;
        name: string;
        price: number;
        active: boolean;
      }>(
        'SELECT id, name, price::float8 AS price, active FROM menu_items WHERE id = ANY($1) ORDER BY id FOR UPDATE',
        [[...orderLines.keys()]],
      );
      const menuItems = new Map(menuResult.rows.map((item) => [item.id, item]));
      if (menuItems.size !== orderLines.size)
        throw new NotFoundException('Không tìm thấy món trong đơn hàng');
      for (const item of menuItems.values())
        if (!item.active)
          throw new ConflictException(`Món "${item.name}" hiện không khả dụng`);
      const recipeResult = await client.query<{
        menu_item_id: string;
        ingredient_id: string;
        amount: number;
        quantity: number;
      }>(
        'SELECT mi.menu_item_id, i.id AS ingredient_id, mi.amount::float8 AS amount, i.quantity::float8 AS quantity FROM menu_item_ingredients mi JOIN inventory i ON i.id = mi.ingredient_id WHERE mi.menu_item_id = ANY($1) ORDER BY i.id FOR UPDATE OF i',
        [[...orderLines.keys()]],
      );
      const ingredientDemand = new Map<string, number>();
      const ingredientStock = new Map<string, number>();
      for (const recipe of recipeResult.rows) {
        const amount =
          Number(recipe.amount) * (orderLines.get(recipe.menu_item_id) ?? 0);
        ingredientDemand.set(
          recipe.ingredient_id,
          (ingredientDemand.get(recipe.ingredient_id) ?? 0) + amount,
        );
        ingredientStock.set(recipe.ingredient_id, Number(recipe.quantity));
      }
      for (const [ingredientId, amount] of ingredientDemand) {
        if ((ingredientStock.get(ingredientId) ?? 0) < amount)
          throw new ConflictException(
            `Không đủ tồn kho nguyên liệu "${ingredientId}"`,
          );
      }
      const lines: OrderItem[] = [...orderLines].map(
        ([menuItemId, quantity]) => {
          const menuItem = menuItems.get(menuItemId)!;
          return {
            menuItemId,
            name: menuItem.name,
            price: Number(menuItem.price),
            quantity,
          };
        },
      );
      const subtotal = lines.reduce(
        (sum, line) => sum + line.price * line.quantity,
        0,
      );
      for (const [ingredientId, amount] of ingredientDemand)
        await client.query(
          'UPDATE inventory SET quantity = quantity - $2, updated_at = NOW() WHERE id = $1',
          [ingredientId, amount],
        );

      await client.query(
        'INSERT INTO orders (id, table_name, order_type, customer_count, total, service_fee, status, note, inventory_deducted, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, NOW(), NOW())',
        [
          id,
          input.table,
          input.orderType,
          input.customerCount,
          subtotal + serviceFee,
          serviceFee,
          'PENDING',
          input.note ?? null,
          createdBy,
        ],
      );
      for (const line of lines)
        await client.query(
          'INSERT INTO order_items (order_id, menu_item_id, name, quantity, price, total) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            id,
            line.menuItemId,
            line.name,
            line.quantity,
            line.price,
            line.price * line.quantity,
          ],
        );

      const created = await client.query<OrderRow>(
        `${orderQuery} WHERE o.id = $1`,
        [id],
      );
      return groupOrders(created.rows)[0];
    });
  }
  //cập nhật trạng thái đơn hàng
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
  //cập nhật thống kê doanh thu
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
