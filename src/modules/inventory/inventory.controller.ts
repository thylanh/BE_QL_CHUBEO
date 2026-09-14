import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { InventoryStoreService } from './store.service';

@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private readonly store: InventoryStoreService) {}

  @Get()
  async list() {
    return (await this.store.listInventory()).map((item) => ({
      ...item,
      lowStock: item.quantity <= item.minQuantity,
    }));
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
}
