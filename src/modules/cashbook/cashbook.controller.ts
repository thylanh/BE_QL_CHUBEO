import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { User } from '../../shared/store.service';
import {
  CashbookCategory,
  CashbookService,
  CashbookType,
} from './cashbook.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('cashbook')
@UseGuards(AuthGuard)
export class CashbookController {
  constructor(private readonly cashbook: CashbookService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  list(
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (type !== undefined && type !== 'INCOME' && type !== 'EXPENSE') {
      throw new BadRequestException('type phải là INCOME hoặc EXPENSE');
    }
    return this.cashbook.list({
      type: type as CashbookType | undefined,
      from,
      to,
    });
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(
    @Body() body: Record<string, unknown> = {},
    @Req() request: AuthenticatedRequest,
  ) {
    const type = body.type;
    if (type !== 'INCOME' && type !== 'EXPENSE') {
      throw new BadRequestException('type phải là INCOME hoặc EXPENSE');
    }

    const category = body.category;
    if (
      category !== 'MISC_PURCHASE' &&
      category !== 'SCRAP_SALE' &&
      category !== 'OTHER'
    ) {
      throw new BadRequestException(
        'category phải là MISC_PURCHASE, SCRAP_SALE hoặc OTHER',
      );
    }
    if (
      (category === 'MISC_PURCHASE' && type !== 'EXPENSE') ||
      (category === 'SCRAP_SALE' && type !== 'INCOME')
    ) {
      throw new BadRequestException(
        'category không phù hợp với loại thu hoặc chi',
      );
    }

    const description =
      typeof body.description === 'string' ? body.description.trim() : '';
    if (!description) {
      throw new BadRequestException('description là bắt buộc');
    }

    const amount = body.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount phải là số lớn hơn 0');
    }

    if (body.occurredAt !== undefined && typeof body.occurredAt !== 'string') {
      throw new BadRequestException('occurredAt phải là chuỗi ngày giờ');
    }
    if (body.note !== undefined && typeof body.note !== 'string') {
      throw new BadRequestException('note phải là chuỗi');
    }

    return this.cashbook.create(
      {
        type,
        category: category as CashbookCategory,
        description,
        amount,
        ...(typeof body.occurredAt === 'string'
          ? { occurredAt: body.occurredAt }
          : {}),
        ...(typeof body.note === 'string' && body.note.trim()
          ? { note: body.note.trim() }
          : {}),
      },
      request.user.id,
    );
  }
}
