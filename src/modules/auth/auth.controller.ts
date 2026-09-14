import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles } from './auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('users')
  @UseGuards(AuthGuard)
  @Roles('ADMIN')
  async listUsers() {
    return this.authService.listUsers();
  }

  @Post('register')
  @UseGuards(AuthGuard)
  @Roles('ADMIN')
  async register(
    @Body()
    body: {
      username?: string;
      password?: string;
      name?: string;
      role?: 'ADMIN' | 'MANAGER' | 'STAFF';
    } = {},
  ) {
    const username = body?.username?.trim() ?? '';
    const password = body?.password ?? '';
    const name = body?.name?.trim() ?? '';
    const role = body?.role ?? 'STAFF';
    if (!username || !password || !name) {
      throw new BadRequestException(
        'Tên đăng nhập, mật khẩu và tên hiển thị là bắt buộc',
      );
    }
    if (password.length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
    }
    if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
      throw new BadRequestException('Vai trò không hợp lệ');
    }
    return this.authService.register({ username, password, name, role });
  }

  @Patch('users/:id')
  @UseGuards(AuthGuard)
  @Roles('ADMIN')
  async updateUser(
    @Param('id') id: string,
    @Body()
    body: {
      username?: string;
      password?: string;
      name?: string;
      role?: 'ADMIN' | 'MANAGER' | 'STAFF';
      active?: boolean;
    } = {},
  ) {
    return this.authService.updateUser(id, body);
  }

  @Delete('users/:id')
  @UseGuards(AuthGuard)
  @Roles('ADMIN')
  async deleteUser(@Param('id') id: string) {
    return this.authService.deleteUser(id);
  }

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
