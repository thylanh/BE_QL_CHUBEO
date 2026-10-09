import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Param,
  Patch,
  // Post,
  Body,
  // Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, Roles } from '../auth/auth.guard';
// import { User } from '../../shared/store.service';
import { OrderStatus, OrdersStoreService } from './store.service';

// type AuthenticatedRequest = Request & { user: User };

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly store: OrdersStoreService) {}

  @Get()
  list() {
    return this.store.listOrders();
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
