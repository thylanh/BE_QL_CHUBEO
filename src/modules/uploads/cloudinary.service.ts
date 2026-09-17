import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly configured: boolean;

  constructor() {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      process.env;

    this.configured = Boolean(
      CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET,
    );

    if (!this.configured) return;

    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async uploadImage(file: Express.Multer.File) {
    if (!this.configured)
      throw new ServiceUnavailableException(
        'Cloudinary chưa được cấu hình trên server',
      );
    if (!file?.buffer?.length)
      throw new BadRequestException('Vui lòng chọn một file ảnh');

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'bun-dau-chu-beo',
            resource_type: 'image',
          },
          (error, uploadResult) => {
            if (error || !uploadResult) {
              reject(new Error('Cloudinary upload failed'));
              return;
            }
            resolve(uploadResult);
          },
        );
        stream.end(file.buffer);
      });

      return {
        publicId: result.public_id,
        url: result.url,
        secureUrl: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch {
      throw new InternalServerErrorException(
        'Không thể tải ảnh lên Cloudinary',
      );
    }
  }
}
