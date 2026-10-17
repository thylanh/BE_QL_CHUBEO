import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { User } from '../../shared/store.service';
import {
  CreateOrderInput,
  OrderStatus,
  OrdersStoreService,
} from './store.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly store: OrdersStoreService) {}

  @Get()
  list() {
    return this.store.listOrders();
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  create(
    @Body() body: Partial<CreateOrderInput> = {},
    @Req() request: AuthenticatedRequest,
  ) {
    return this.store.createOrder(
      validateCreateOrderInput(body),
      request.user.id,
    );
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: OrderStatus } = {},
  ) {
    const payload = body ?? {};
    const status = payload.status;
    if (
      !status ||
      ![
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'COMPLETED',
        'CANCELLED',
      ].includes(status)
    )
      throw new BadRequestException('Trạng thái đơn hàng không hợp lệ');
    const current = (await this.store.listOrders()).find(
      (order) => order.id === id,
    );
    if (!current) throw new BadRequestException('Không tìm thấy đơn hàng');
    if (current.status === 'CANCELLED' || current.status === 'COMPLETED')
      throw new ConflictException('Không thể thay đổi đơn đã kết thúc');
    return this.store.updateOrderStatus(id, status);
  }
}

function validateCreateOrderInput(
  body: Partial<CreateOrderInput>,
): CreateOrderInput {
  const payload = body ?? {};
  const table = payload.table ?? '';
  if (typeof table !== 'string')
    throw new BadRequestException('table phải là chuỗi');

  const orderTypes = ['Tại quán', 'Mang đi', 'Giao hàng'] as const;
  const orderType = payload.orderType ?? 'Tại quán';
  if (!orderTypes.includes(orderType))
    throw new BadRequestException('Loại đơn hàng không hợp lệ');

  if (!Array.isArray(payload.lines) || payload.lines.length === 0)
    throw new BadRequestException('Đơn hàng phải có ít nhất một món');
  const lines = payload.lines.map((line) => {
    const menuItemId =
      typeof line?.menuItemId === 'string' ? line.menuItemId.trim() : '';
    const quantity = line?.quantity;
    if (!menuItemId || !Number.isInteger(quantity) || quantity <= 0)
      throw new BadRequestException(
        'Mỗi món phải có menuItemId và quantity là số nguyên dương',
      );
    return { menuItemId, quantity };
  });

  const customerCount = payload.customerCount;
  if (
    typeof customerCount !== 'number' ||
    !Number.isInteger(customerCount) ||
    customerCount < 0
  ) {
    throw new BadRequestException();
  }
  const serviceFee = payload.serviceFee;
  if (
    typeof serviceFee !== 'number' ||
    !Number.isFinite(serviceFee) ||
    serviceFee < 0
  )
    throw new BadRequestException('serviceFee phải là số không âm');
  if (payload.note !== undefined && typeof payload.note !== 'string')
    throw new BadRequestException('note phải là chuỗi');

  return {
    table: table.trim(),
    orderType,
    lines,
    customerCount,
    serviceFee,
    ...(payload.note?.trim() ? { note: payload.note.trim() } : {}),
  };
}
