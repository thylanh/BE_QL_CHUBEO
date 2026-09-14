import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { ReportsStoreService } from './store.service';

@Controller('reports')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class ReportsController {
  constructor(private readonly store: ReportsStoreService) {}

  @Get('revenue')
  revenue(@Query('from') from?: string, @Query('to') to?: string) {
    return this.store.revenue(from, to);
  }
}
