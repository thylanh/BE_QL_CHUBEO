import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './calendar.controller';
import { CalendarStoreService } from './store.service';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [CalendarStoreService],
})
export class CalendarModule {}
