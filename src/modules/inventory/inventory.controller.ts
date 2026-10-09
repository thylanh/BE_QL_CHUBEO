import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { InventoryStoreService } from './store.service';

@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private readonly store: InventoryStoreService) {}

  @Get('summary')
  summary() {
    return this.store.summary();
  }

  @Get('low-stock')
  lowStock() {
    return this.store.lowStockInventory();
  }

  @Get()
  async list() {
    return (await this.store.listInventory()).map((item) => ({
      ...item,
      lowStock: item.quantity <= item.minQuantity,
    }));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const item = await this.store.getInventoryItem(id);
    if (!item) throw new BadRequestException('Không tìm thấy nguyên liệu');
    return { ...item, lowStock: item.quantity <= item.minQuantity };
  }

  @Post(':id/stock-in')
  @Roles('ADMIN', 'MANAGER')
  stockIn(@Param('id') id: string, @Body() body: { quantity?: number } = {}) {
    return this.moveStock(id, body, 1);
  }

  @Post(':id/stock-out')
  @Roles('ADMIN', 'MANAGER')
  stockOut(@Param('id') id: string, @Body() body: { quantity?: number } = {}) {
    return this.moveStock(id, body, -1);
  }

  @Patch(':id/adjust')
  @Roles('ADMIN', 'MANAGER')
  async adjust(@Param('id') id: string, @Body() body: { delta?: number } = {}) {
    const payload = body ?? {};
    const item = await this.store.getInventoryItem(id);
    const delta = Number(payload.delta);
    if (!item) throw new BadRequestException('Không tìm thấy nguyên liệu');
    if (!Number.isInteger(delta) || delta === 0)
      throw new BadRequestException('delta phải là số nguyên khác 0');
    const updated = await this.store.adjustInventory(id, delta);
    if (!updated) throw new BadRequestException('Số lượng tồn không thể âm');
    return { ...updated, lowStock: updated.quantity <= updated.minQuantity };
  }

  private async moveStock(
    id: string,
    body: { quantity?: number } | null,
    direction: 1 | -1,
  ) {
    const quantity = Number(body?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new BadRequestException('quantity phải là số lớn hơn 0');

    const item = await this.store.getInventoryItem(id);
    if (!item) throw new BadRequestException('Không tìm thấy nguyên liệu');

    const updated = await this.store.adjustInventory(id, quantity * direction);
    if (!updated) throw new BadRequestException('Số lượng tồn không thể âm');

    return {
      ...updated,
      movement: direction === 1 ? 'IN' : 'OUT',
      movedQuantity: quantity,
      lowStock: updated.quantity <= updated.minQuantity,
    };
  }
}
