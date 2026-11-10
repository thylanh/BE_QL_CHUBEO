import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { User } from '../../shared/store.service';
import {
  InventoryInput,
  InventoryMovementInput,
  InventoryStoreService,
  InventoryTransactionFilters,
} from './inventory.service';

type AuthenticatedRequest = Request & { user: User };

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

  @Get('transactions/summary')
  @Roles('ADMIN', 'MANAGER')
  summarizeTransactions(
    @Query('inventoryItemId') inventoryItemId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.store.summarizeTransactions(
      validateTransactionFilters({ inventoryItemId, type, from, to }),
    );
  }

  @Get('transactions')
  @Roles('ADMIN', 'MANAGER')
  listTransactions(
    @Query('inventoryItemId') inventoryItemId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.store.listTransactions(
      validateTransactionFilters({ inventoryItemId, type, from, to }),
    );
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
  stockIn(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: Record<string, unknown> = {},
  ) {
    return this.moveStock(id, body, 'IN', request.user.id);
  }

  @Post(':id/stock-out')
  @Roles('ADMIN', 'MANAGER')
  stockOut(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: Record<string, unknown> = {},
  ) {
    return this.moveStock(id, body, 'OUT', request.user.id);
  }

  private async moveStock(
    id: string,
    body: Record<string, unknown> | null,
    type: 'IN' | 'OUT',
    createdBy: string,
  ) {
    const input = validateStockMovement(body ?? {}, type === 'IN');
    const result = await this.store.createStockTransaction(
      id,
      type,
      input,
      createdBy,
    );

    return {
      ...result.inventory,
      movement: type,
      movedQuantity: input.quantity,
      transaction: result.transaction,
      lowStock: result.inventory.quantity <= result.inventory.minQuantity,
    };
  }
}

function validateTransactionFilters(
  input: Record<string, string | undefined>,
): InventoryTransactionFilters {
  const type = input.type;
  if (
    type !== undefined &&
    type !== 'IN' &&
    type !== 'OUT' &&
    type !== 'ADJUSTMENT'
  ) {
    throw new BadRequestException('type phải là IN, OUT hoặc ADJUSTMENT');
  }
  const inventoryItemId = input.inventoryItemId?.trim();
  if (input.inventoryItemId !== undefined && !inventoryItemId) {
    throw new BadRequestException('inventoryItemId không được để trống');
  }
  return {
    ...(inventoryItemId ? { inventoryItemId } : {}),
    ...(type ? { type: type } : {}),
    ...(input.from === undefined ? {} : { from: input.from }),
    ...(input.to === undefined ? {} : { to: input.to }),
  };
}

function validateStockMovement(
  body: Record<string, unknown>,
  allowCost: boolean,
): InventoryMovementInput {
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new BadRequestException('quantity phải là số lớn hơn 0');
  }

  const inputUnit = optionalText(body, 'inputUnit');
  const note = optionalText(body, 'note');
  const referenceId = optionalText(body, 'referenceId');
  const unitCost = allowCost
    ? optionalNonNegativeNumber(body, 'unitCost')
    : undefined;
  const totalCost = allowCost
    ? optionalNonNegativeNumber(body, 'totalCost')
    : undefined;

  return {
    quantity,
    ...(inputUnit === undefined ? {} : { inputUnit }),
    ...(unitCost === undefined ? {} : { unitCost }),
    ...(totalCost === undefined ? {} : { totalCost }),
    ...(referenceId === undefined ? {} : { referenceId }),
    ...(note === undefined ? {} : { note }),
  };
}

function optionalText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${key} phải là chuỗi không được để trống`);
  }
  return value.trim();
}

function optionalNonNegativeNumber(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined) return undefined;
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())
  ) {
    throw new BadRequestException(`${key} phải là số không âm`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new BadRequestException(`${key} phải là số không âm`);
  }
  return number;
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

  const purchaseUnit = body.purchaseUnit?.trim();
  if (purchaseUnit !== undefined && !purchaseUnit)
    throw new BadRequestException('Đơn vị mua vào không được để trống');

  const conversionRate =
    body.conversionRate === undefined ? undefined : Number(body.conversionRate);
  if (
    conversionRate !== undefined &&
    (!Number.isFinite(conversionRate) || conversionRate <= 0)
  )
    throw new BadRequestException('Tỷ lệ quy đổi phải là số lớn hơn 0');

  if (
    (purchaseUnit === undefined && conversionRate !== undefined) ||
    (purchaseUnit !== undefined && conversionRate === undefined)
  ) {
    throw new BadRequestException(
      'purchaseUnit và conversionRate phải được nhập cùng nhau',
    );
  }

  return {
    ...body,
    ...(name === undefined ? {} : { name }),
    ...(unit === undefined ? {} : { unit }),
    ...(purchaseUnit === undefined ? {} : { purchaseUnit }),
    ...(conversionRate === undefined ? {} : { conversionRate }),
    ...(quantity === undefined ? {} : { quantity }),
    ...(minQuantity === undefined ? {} : { minQuantity }),
    ...(costPrice === undefined ? {} : { costPrice }),
  } as InventoryInput;
}
