import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { MenuInput, MenuStoreService } from './store.service';

@Controller('menu')
@UseGuards(AuthGuard)
export class MenuController {
  constructor(private readonly store: MenuStoreService) {}
  @Get() list(@Query('active') active?: string) {
    if (active !== undefined && active !== 'true' && active !== 'false')
      throw new BadRequestException('active phải là true hoặc false');
    return this.store.listMenuItems(
      active === undefined ? undefined : active === 'true',
    );
  }
  @Get(':id') async get(@Param('id') id: string) {
    const item = await this.store.getMenuItem(id);
    if (!item) throw new BadRequestException('Không tìm thấy món');
    return item;
  }
  @Post() @Roles('ADMIN', 'MANAGER') async create(
    @Body() body: Partial<MenuInput> = {},
  ) {
    return this.store.createMenuItem(validateMenuInput(body, false));
  }
  @Patch(':id') @Roles('ADMIN', 'MANAGER') async update(
    @Param('id') id: string,
    @Body() body: Partial<MenuInput> = {},
  ) {
    const item = await this.store.updateMenuItem(
      id,
      validateMenuInput(body, true),
    );
    if (!item) throw new BadRequestException('Không tìm thấy món');
    return item;
  }
  @Delete(':id') @Roles('ADMIN', 'MANAGER') async remove(
    @Param('id') id: string,
  ) {
    const item = await this.store.deleteMenuItem(id);
    if (!item)
      throw new BadRequestException('Không tìm thấy món đang hoạt động');
    return item;
  }
}
function validateMenuInput(
  body: Partial<MenuInput>,
  partial: boolean,
): MenuInput {
  const name = body.name?.trim();
  if (!partial && !name) throw new BadRequestException('Tên món là bắt buộc');
  if (name !== undefined && !name)
    throw new BadRequestException('Tên món không được để trống');
  const price = body.price === undefined ? undefined : Number(body.price);
  if (price !== undefined && (!Number.isFinite(price) || price < 0))
    throw new BadRequestException('Giá món phải là số không âm');
  if (!partial && price === undefined)
    throw new BadRequestException('Giá món là bắt buộc');
  if (body.active !== undefined && typeof body.active !== 'boolean')
    throw new BadRequestException('active phải là boolean');
  if (body.ingredients !== undefined) {
    if (!Array.isArray(body.ingredients))
      throw new BadRequestException('ingredients phải là một mảng');
    for (const ingredient of body.ingredients)
      if (
        !ingredient?.ingredient_id ||
        !Number.isFinite(Number(ingredient.amount)) ||
        Number(ingredient.amount) <= 0
      )
        throw new BadRequestException(
          'Nguyên liệu phải có ingredient_id và amount lớn hơn 0',
        );
  }
  return {
    ...body,
    ...(name === undefined ? {} : { name }),
    ...(price === undefined ? {} : { price }),
  } as MenuInput;
}
