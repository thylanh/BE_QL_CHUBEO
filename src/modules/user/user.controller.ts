import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @UseGuards(AuthGuard)
  @Roles('ADMIN')
  async listUsers() {
    return this.userService.listUsers();
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
    return this.userService.register({ username, password, name, role });
  }

  @Patch(':id')
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
    return this.userService.updateUser(id, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @Roles('ADMIN')
  async deleteUser(@Param('id') id: string) {
    return this.userService.deleteUser(id);
  }
}
