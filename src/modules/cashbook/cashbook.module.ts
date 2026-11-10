import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CashbookController } from './cashbook.controller';
import { CashbookService } from './cashbook.service';

@Module({
  imports: [AuthModule],
  controllers: [CashbookController],
  providers: [CashbookService],
})
export class CashbookModule {}
