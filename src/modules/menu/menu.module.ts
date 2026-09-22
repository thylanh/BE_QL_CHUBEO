import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MenuController } from './menu.controller';
import { MenuStoreService } from './store.service';

@Module({
  imports: [AuthModule],
  controllers: [MenuController],
  providers: [MenuStoreService],
})
export class MenuModule {}
