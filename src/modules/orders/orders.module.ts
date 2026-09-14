import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersController } from './orders.controller';
import { OrdersStoreService } from './store.service';

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [OrdersStoreService],
  exports: [OrdersStoreService],
})
export class OrdersModule {}
