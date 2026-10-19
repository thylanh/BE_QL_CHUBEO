import {
  ConflictException,
  Logger,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
export type OrderPeriod = 'today' | 'week' | 'month';
export interface OrderIngredient {
  ingredientId: string;
  amount: number;
}
export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  ingredients: OrderIngredient[];
}
export interface Order {
  id: string;
  table: string;
  code: string;
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
    ingredients: OrderIngredient[];
  }>;
  customerCount: number;
  note?: string;
  serviceFee: number;
}

type OrderRow = Omit<Order, 'lines'> & { line: OrderItem | null };

const orderQuery = `SELECT o.id, COALESCE(o.table_name, '') AS "table", COALESCE(o.order_type, 'Tại quán') AS "orderType", o.customer_count AS "customerCount", o.total::float8 - o.service_fee::float8 AS subtotal, o.service_fee::float8 AS "serviceFee", o.total::float8, o.status, o.note, o.inventory_deducted AS "inventoryDeducted", o.created_by AS "createdBy", o.created_at AS "createdAt", o.completed_at AS "completedAt", o.cancelled_at AS "cancelledAt", CASE WHEN oi.menu_item_id IS NULL THEN NULL ELSE json_build_object('menuItemId', oi.menu_item_id, 'name', oi.name, 'quantity', oi.quantity, 'price', oi.price::float8, 'total', oi.total::float8, 'ingredients', COALESCE(oi.ingredients, '[]'::jsonb)) END AS line FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id`;

@Injectable()
export class OrdersStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersStoreService.name);
  private cleanupInterval?: NodeJS.Timeout;
  private cleanupInProgress?: Promise<void>;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit() {
    void this.cleanupExpiredOrders().catch((error: unknown) => {
      this.logCleanupError(error);
    });
    this.cleanupInterval = setInterval(
      () => {
        void this.cleanupExpiredOrders().catch((error: unknown) => {
          this.logCleanupError(error);
        });
      },
      24 * 60 * 60 * 1000,
    );
    this.cleanupInterval.unref();
  }
  onModuleDestroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  //danh sách đơn hàng
  async listOrders(period: OrderPeriod = 'month') {
    await this.cleanupExpiredOrders();
    const periodFilter: Record<OrderPeriod, string> = {
      today:
        "o.created_at >= CURRENT_DATE AND o.created_at < CURRENT_DATE + INTERVAL '1 day'",
      week: "o.created_at >= NOW() - INTERVAL '7 days'",
      month: "o.created_at >= date_trunc('month', CURRENT_DATE)",
    };
    const result = await this.database.query<OrderRow>(
      `${orderQuery} WHERE ${periodFilter[period]}`,
    );
    return groupOrders(result.rows);
  }

  private cleanupExpiredOrders(): Promise<void> {
    if (this.cleanupInProgress) return this.cleanupInProgress;

    this.cleanupInProgress = this.database
      .transaction(async (client) => {
        await client.query(
          `DELETE FROM order_items
           WHERE order_id IN (
             SELECT id FROM orders
             WHERE created_at < date_trunc('month', CURRENT_DATE)
           )`,
        );
        await client.query(
          "DELETE FROM orders WHERE created_at < date_trunc('month', CURRENT_DATE)",
        );
      })
      .then(() => undefined)
      .finally(() => {
        this.cleanupInProgress = undefined;
      });
    return this.cleanupInProgress;
  }

  private logCleanupError(error: unknown) {
    this.logger.error(
      'Không thể xóa đơn hàng của tháng trước',
      error instanceof Error ? error.stack : String(error),
    );
  }

  //tạo đơn hàng mới
  async createOrder(input: CreateOrderInput, createdBy: string) {
    const id = randomUUID();
    const serviceFee = input.serviceFee;
    const menuItemIds = [
      ...new Set(input.lines.map((line) => line.menuItemId)),
    ];
    return this.database.transaction(async (client) => {
      const menuResult = await client.query<{
        id: string;
        name: string;
        price: number;
        active: boolean;
      }>(
        'SELECT id, name, price::float8 AS price, active FROM menu_items WHERE id = ANY($1) ORDER BY id FOR UPDATE',
        [menuItemIds],
      );
      const menuItems = new Map(menuResult.rows.map((item) => [item.id, item]));
      if (menuItems.size !== menuItemIds.length)
        throw new NotFoundException('Không tìm thấy món trong đơn hàng');
      for (const item of menuItems.values())
        if (!item.active)
          throw new ConflictException(`Món "${item.name}" hiện không khả dụng`);
      const ingredientIds = [
        ...new Set(
          input.lines.flatMap((line) =>
            line.ingredients.map((ingredient) => ingredient.ingredientId),
          ),
        ),
      ];
      const ingredientResult = await client.query<{
        id: string;
        quantity: number;
      }>(
        'SELECT id, quantity::float8 AS quantity FROM inventory WHERE id = ANY($1) ORDER BY id FOR UPDATE',
        [ingredientIds],
      );
      const ingredientStock = new Map(
        ingredientResult.rows.map((ingredient) => [
          ingredient.id,
          Number(ingredient.quantity),
        ]),
      );
      if (ingredientStock.size !== ingredientIds.length)
        throw new NotFoundException(
          'Không tìm thấy nguyên liệu trong đơn hàng',
        );

      const ingredientDemand = new Map<string, number>();
      for (const line of input.lines)
        for (const ingredient of line.ingredients)
          ingredientDemand.set(
            ingredient.ingredientId,
            (ingredientDemand.get(ingredient.ingredientId) ?? 0) +
              ingredient.amount * line.quantity,
          );
      for (const [ingredientId, amount] of ingredientDemand) {
        if ((ingredientStock.get(ingredientId) ?? 0) < amount)
          throw new ConflictException(
            `Không đủ tồn kho nguyên liệu "${ingredientId}"`,
          );
      }
      const lines: OrderItem[] = input.lines.map((line) => {
        const menuItem = menuItems.get(line.menuItemId)!;
        return {
          menuItemId: line.menuItemId,
          name: menuItem.name,
          price: Number(menuItem.price),
          quantity: line.quantity,
          total: Number(menuItem.price) * line.quantity,
          ingredients: line.ingredients,
        };
      });
      const subtotal = lines.reduce(
        (sum, line) => sum + line.price * line.quantity,
        0,
      );
      for (const [ingredientId, amount] of ingredientDemand)
        await client.query(
          'UPDATE inventory SET quantity = quantity - $2, updated_at = NOW() WHERE id = $1',
          [ingredientId, amount],
        );

      const code = 'HD' + '-' + id.split('-')[3];
      await client.query(
        'INSERT INTO orders (id, code, table_name, order_type, customer_count, total, service_fee, status, note, inventory_deducted, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())',
        [
          id,
          code,
          input.table,
          input.orderType,
          input.customerCount,
          subtotal + serviceFee,
          serviceFee,
          'PENDING',
          input.note ?? null,
          true,
          createdBy,
        ],
      );
      for (const line of lines)
        await client.query(
          'INSERT INTO order_items (order_id, menu_item_id, name, quantity, price, total, ingredients) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)',
          [
            id,
            line.menuItemId,
            line.name,
            line.quantity,
            line.price,
            line.total,
            JSON.stringify(line.ingredients),
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
          ingredients: OrderIngredient[];
        }>(
          'SELECT menu_item_id, quantity, ingredients FROM order_items WHERE order_id = $1',
          [id],
        );
        for (const line of lines.rows) {
          for (const ingredient of line.ingredients) {
            await client.query(
              'UPDATE inventory SET quantity = quantity + $2, updated_at = NOW() WHERE id = $1',
              [ingredient.ingredientId, ingredient.amount * line.quantity],
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
      code: 'HD' + '-' + row.id.split('-')[3],
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
