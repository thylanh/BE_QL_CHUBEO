import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthStoreService } from './store.service';

@Module({
  controllers: [AuthController],
  providers: [AuthStoreService, AuthService, AuthGuard],
  exports: [AuthGuard, AuthStoreService],
})
export class AuthModule {}
