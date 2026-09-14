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
import { OrderStatus, OrdersStoreService } from './store.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly store: OrdersStoreService) {}

  @Get('menu')
  menu() {
    return this.store.listMenuItems();
  }

  @Get()
  list() {
    return this.store.listOrders();
  }

  @Post()
  async create(
    @Body()
    body: {
      items?: { menuItemId?: string; quantity?: number }[];
      note?: string;
    } = {},
    @Req() request: AuthenticatedRequest,
  ) {
    const payload = body ?? {};
    if (!payload.items?.length)
      throw new BadRequestException('Đơn hàng phải có ít nhất một món');
    const items = payload.items.map((item) => ({
      menuItemId: item.menuItemId ?? '',
      quantity: Number(item.quantity),
    }));
    if (
      items.some(
        (item) => !Number.isInteger(item.quantity) || item.quantity < 1,
      )
    )
      throw new BadRequestException('Số lượng món phải là số nguyên dương');
    try {
      return await this.store.createOrder(request.user.id, items, payload.note);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể tạo đơn hàng';
      if (message.startsWith('Tồn kho')) throw new ConflictException(message);
      throw new BadRequestException(message);
    }
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
      !['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(status)
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
