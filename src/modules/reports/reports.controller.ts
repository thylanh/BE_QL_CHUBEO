import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { ReportsStoreService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class ReportsController {
  constructor(private readonly store: ReportsStoreService) {}

  @Get('revenue')
  revenue(@Query('from') from?: string, @Query('to') to?: string) {
    return this.store.revenue(from, to);
  }

  @Get('best-selling')
  bestSelling(@Query('from') from?: string, @Query('to') to?: string) {
    return this.store.bestSelling(from, to);
  }
}
