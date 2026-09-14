import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { ReportsController } from './reports.controller';
import { ReportsStoreService } from './store.service';

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [ReportsController],
  providers: [ReportsStoreService],
})
export class ReportsModule {}
