import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserController } from './user.controller';
import { UserService, UserStoreService } from './user.service';

@Module({
  imports: [AuthModule],
  controllers: [UserController],
  providers: [UserStoreService, UserService],
  exports: [UserStoreService, UserService],
})
export class UserModule {}
