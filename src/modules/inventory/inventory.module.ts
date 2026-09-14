import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryStoreService } from './store.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryStoreService],
})
export class InventoryModule {}
