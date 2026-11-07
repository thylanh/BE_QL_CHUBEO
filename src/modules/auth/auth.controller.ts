import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { username?: string; password?: string } = {}) {
    const username = body?.username ?? '';
    const password = body?.password ?? '';
    return this.authService.login(username, password);
  }

  @Post('logout')
  async logout(@Headers('authorization') authorization?: string) {
    await this.authService.logout(
      authorization?.replace(/^Bearer\s+/i, '') ?? '',
    );
    return { message: 'Đã đăng xuất' };
  }
}
