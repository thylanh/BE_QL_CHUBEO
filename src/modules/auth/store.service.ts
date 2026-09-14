import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';
import {
  Role,
  User,
  hashPassword as hashPasswordValue,
  verifyPasswordHash,
} from '../../shared/store.service';

@Injectable()
export class AuthStoreService {
  constructor(private readonly database: DatabaseService) {}

  async findUser(username: string) {
    const result = await this.database.query<User>(
      'SELECT id, username, name, role, password_hash AS "passwordHash", active FROM users WHERE username = $1',
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
    const result = await this.database.query<User>(
      'SELECT id, username, name, role, password_hash AS "passwordHash", active FROM users ORDER BY username ASC',
    );
    return result.rows;
  }

  async getUserById(id: string) {
    const result = await this.database.query<User>(
      'SELECT id, username, name, role, password_hash AS "passwordHash", active FROM users WHERE id = $1',
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
    const result = await this.database.query<User>(
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

  verifyPassword(user: User, password: string) {
    return verifyPasswordHash(user, password);
  }

  async createSession(userId: string) {
    const token = randomUUID();
    const createdAt = new Date();
    await this.database.query(
      'INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)',
      [token, userId, createdAt],
    );
    return { token, userId, createdAt: createdAt.toISOString() };
  }

  async getUserByToken(token: string) {
    const result = await this.database.query<User>(
      'SELECT u.id, u.username, u.name, u.role, u.password_hash AS "passwordHash", u.active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND u.active = TRUE',
      [token],
    );
    return result.rows[0];
  }

  async deleteSession(token: string) {
    await this.database.query('DELETE FROM sessions WHERE token = $1', [token]);
  }
}
