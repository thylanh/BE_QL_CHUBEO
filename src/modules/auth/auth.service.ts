import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { User } from '../../shared/store.service';
import { AuthStoreService } from './store.service';

@Injectable()
export class AuthService {
  constructor(private readonly store: AuthStoreService) {}

  async listUsers() {
    const users = await this.store.listUsers();
    return users.map((user) => this.publicUser(user));
  }

  async register(input: {
    username: string;
    password: string;
    name: string;
    role?: 'ADMIN' | 'MANAGER' | 'STAFF';
  }) {
    const username = input.username.trim();
    const name = input.name.trim();
    const role = input.role ?? 'STAFF';

    if (!username || !name || !input.password) {
      throw new BadRequestException(
        'Tên đăng nhập, mật khẩu và tên hiển thị là bắt buộc',
      );
    }

    if (input.password.length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
    }

    const existing = await this.store.findUser(username);
    if (existing) {
      throw new BadRequestException('Tên đăng nhập đã tồn tại');
    }

    const id = randomUUID();
    const passwordHash = this.store.hashPassword(input.password);

    await this.store.createUser({
      id,
      username,
      name,
      role,
      passwordHash,
      active: true,
    });

    return {
      id,
      username,
      name,
      role,
    };
  }

  async updateUser(
    id: string,
    input: {
      username?: string;
      password?: string;
      name?: string;
      role?: 'ADMIN' | 'MANAGER' | 'STAFF';
      active?: boolean;
    },
  ) {
    const current = await this.store.getUserById(id);
    if (!current) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const username = input.username?.trim() ?? current.username;
    const name = input.name?.trim() ?? current.name;
    const role = input.role ?? current.role;
    const active = input.active ?? current.active;
    const password = input.password;

    if (!username || !name) {
      throw new BadRequestException(
        'Tên đăng nhập và tên hiển thị không được để trống',
      );
    }

    if (password && password.length < 6) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
    }

    if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
      throw new BadRequestException('Vai trò không hợp lệ');
    }

    if (username !== current.username) {
      const duplicate = await this.store.findUser(username);
      if (duplicate) {
        throw new BadRequestException('Tên đăng nhập đã tồn tại');
      }
    }

    const updated = await this.store.updateUser(id, {
      username,
      name,
      role,
      active,
      passwordHash: password
        ? this.store.hashPassword(password)
        : current.passwordHash,
    });

    return this.publicUser(updated);
  }

  async deleteUser(id: string) {
    const current = await this.store.getUserById(id);
    if (!current) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    await this.store.deleteUser(id);
    return { message: 'Đã xóa tài khoản', id };
  }

  async login(username: string, password: string) {
    const user = await this.store.findUser(username);
    if (!user || !user.active || !this.store.verifyPassword(user, password)) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }
    const session = await this.store.createSession(user.id);
    return { accessToken: session.token, user: this.publicUser(user) };
  }

  async logout(token: string) {
    await this.store.deleteSession(token);
  }

  publicUser(user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
