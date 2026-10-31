import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database.module';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './calendar.controller';
import { CalendarStoreService } from './store.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CalendarController],
  providers: [CalendarStoreService],
})
export class CalendarModule {}
