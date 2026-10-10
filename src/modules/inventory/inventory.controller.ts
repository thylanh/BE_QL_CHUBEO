import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { InventoryInput, InventoryStoreService } from './store.service';

@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private readonly store: InventoryStoreService) {}

  @Get('summary')
  summary() {
    return this.store.summary();
  }

  @Get()
  async list() {
    return (await this.store.listInventory()).map((item) => ({
      ...item,
      lowStock: item.quantity <= item.minQuantity,
    }));
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  async create(@Body() body: Partial<InventoryInput> = {}) {
    const item = await this.store.createInventoryItem(
      validateInventoryInput(body, false),
    );
    return { ...item, lowStock: item.quantity <= item.minQuantity };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const item = await this.store.getInventoryItem(id);
    if (!item) throw new BadRequestException('Không tìm thấy nguyên liệu');
    return { ...item, lowStock: item.quantity <= item.minQuantity };
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  async remove(@Param('id') id: string) {
    const item = await this.store.deleteInventoryItem(id);
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

function validateInventoryInput(
  body: Partial<InventoryInput>,
  partial: boolean,
): InventoryInput {
  const name = body.name?.trim();
  if (!partial && !name)
    throw new BadRequestException('Tên nguyên liệu là bắt buộc');
  if (name !== undefined && !name)
    throw new BadRequestException('Tên nguyên liệu không được để trống');

  const unit = body.unit?.trim();
  if (!partial && !unit)
    throw new BadRequestException('Đơn vị tính là bắt buộc');
  if (unit !== undefined && !unit)
    throw new BadRequestException('Đơn vị tính không được để trống');

  const quantity =
    body.quantity === undefined ? undefined : Number(body.quantity);
  if (quantity !== undefined && (!Number.isFinite(quantity) || quantity < 0))
    throw new BadRequestException('Số lượng tồn phải là số không âm');

  const minQuantity =
    body.minQuantity === undefined ? undefined : Number(body.minQuantity);
  if (
    minQuantity !== undefined &&
    (!Number.isFinite(minQuantity) || minQuantity < 0)
  )
    throw new BadRequestException('Mức cảnh báo phải là số không âm');

  const costPrice =
    body.costPrice === undefined ? undefined : Number(body.costPrice);
  if (costPrice !== undefined && (!Number.isFinite(costPrice) || costPrice < 0))
    throw new BadRequestException('Giá vốn phải là số không âm');

  return {
    ...body,
    ...(name === undefined ? {} : { name }),
    ...(unit === undefined ? {} : { unit }),
    ...(quantity === undefined ? {} : { quantity }),
    ...(minQuantity === undefined ? {} : { minQuantity }),
    ...(costPrice === undefined ? {} : { costPrice }),
  } as InventoryInput;
}
