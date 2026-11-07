import { Injectable, UnauthorizedException } from '@nestjs/common';
import { User as StoredUser } from '../../shared/store.service';
import { AuthStoreService } from './store.service';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  status: 'ACTIVE' | 'INACTIVE';
  phone?: string;
  createdAt: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly store: AuthStoreService) {}

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

  publicUser(user: StoredUser): User {
    return {
      id: user.id,
      name: user.name,
      email: user.email ?? user.username,
      role: user.role,
      status: user.active ? 'ACTIVE' : 'INACTIVE',
      ...(user.phone ? { phone: user.phone } : {}),
      createdAt: user.createdAt
        ? new Date(user.createdAt).toISOString()
        : new Date(0).toISOString(),
    };
  }
}
