import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadsController } from './uploads.controller';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [CloudinaryService],
})
export class UploadsModule {}
