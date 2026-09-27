import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ReportsModule } from './modules/reports/reports.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { MenuModule } from './modules/menu/menu.module';
import { DatabaseModule } from './shared/database.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    OrdersModule,
    InventoryModule,
    ReportsModule,
    UploadsModule,
    MenuModule,
  ],
})
export class AppModule {}
