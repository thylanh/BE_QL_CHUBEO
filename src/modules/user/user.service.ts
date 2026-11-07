import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';
import {
  Role,
  User as StoredUser,
  hashPassword as hashPasswordValue,
  verifyPasswordHash,
} from '../../shared/store.service';

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
export class UserStoreService {
  constructor(private readonly database: DatabaseService) {}

  async findUser(username: string) {
    const result = await this.database.query<StoredUser>(
      'SELECT id, username, name, role, password_hash AS "passwordHash", active, email, phone, created_at AS "createdAt" FROM users WHERE username = $1',
      [username],
    );
    return result.rows[0];
  }

  async createUser(user: {
    id: string;
    username: string;
    name: string;
    role: Role;
    passwordHash: string;
    active: boolean;
  }) {
    await this.database.query(
      'INSERT INTO users (id, username, name, role, password_hash, active, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [
        user.id,
        user.username,
        user.name,
        user.role,
        user.passwordHash,
        user.active,
      ],
    );
    return user;
  }

  async listUsers() {
    const result = await this.database.query<StoredUser>(
      'SELECT id, username, name, role, password_hash AS "passwordHash", active, email, phone, created_at AS "createdAt" FROM users ORDER BY username ASC',
    );
    return result.rows;
  }

  async getUserById(id: string) {
    const result = await this.database.query<StoredUser>(
      'SELECT id, username, name, role, password_hash AS "passwordHash", active, email, phone, created_at AS "createdAt" FROM users WHERE id = $1',
      [id],
    );
    return result.rows[0];
  }

  async updateUser(
    id: string,
    user: {
      username: string;
      name: string;
      role: Role;
      active: boolean;
      passwordHash: string;
    },
  ) {
    const result = await this.database.query<StoredUser>(
      'UPDATE users SET username = $2, name = $3, role = $4, active = $5, password_hash = $6 WHERE id = $1 RETURNING id, username, name, role, password_hash AS "passwordHash", active',
      [id, user.username, user.name, user.role, user.active, user.passwordHash],
    );
    return result.rows[0];
  }

  async deleteUser(id: string) {
    await this.database.query('DELETE FROM users WHERE id = $1', [id]);
  }

  hashPassword(password: string) {
    return hashPasswordValue(password);
  }

  verifyPassword(user: StoredUser, password: string) {
    return verifyPasswordHash(user, password);
  }
}

@Injectable()
export class UserService {
  constructor(private readonly store: UserStoreService) {}

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
