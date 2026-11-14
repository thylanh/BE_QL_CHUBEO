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

  private async resolveDefaultScope() {
    const tenantResult = await this.database.query<{ id: string }>(
      'SELECT id FROM tenants WHERE code = $1 LIMIT 1',
      ['default'],
    );
    const tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) return { tenantId: null, branchId: null };

    const branchResult = await this.database.query<{ id: string }>(
      'SELECT id FROM branches WHERE tenant_id = $1 AND name = $2 LIMIT 1',
      [tenantId, 'Default branch'],
    );

    return {
      tenantId,
      branchId: branchResult.rows[0]?.id ?? null,
    };
  }

  async findUser(username: string) {
    const result = await this.database.query<User>(
      'SELECT id, username, name, role, password_hash AS "passwordHash", active, email, phone, tenant_id AS "tenantId", branch_id AS "branchId", created_at AS "createdAt" FROM users WHERE username = $1',
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
    tenantId?: string;
    branchId?: string;
  }) {
    const scope = user.tenantId && user.branchId
      ? { tenantId: user.tenantId, branchId: user.branchId }
      : await this.resolveDefaultScope();
    const tenantId = user.tenantId ?? scope.tenantId;
    const branchId = user.branchId ?? scope.branchId;

    await this.database.query(
      'INSERT INTO users (id, username, name, role, password_hash, active, tenant_id, branch_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())',
      [
        user.id,
        user.username,
        user.name,
        user.role,
        user.passwordHash,
        user.active,
        tenantId,
        branchId,
      ],
    );
    return { ...user, tenantId, branchId };
  }

  async listUsers() {
    const result = await this.database.query<User>(
      'SELECT id, username, name, role, password_hash AS "passwordHash", active, email, phone, tenant_id AS "tenantId", branch_id AS "branchId", created_at AS "createdAt" FROM users ORDER BY username ASC',
    );
    return result.rows;
  }

  async getUserById(id: string) {
    const result = await this.database.query<User>(
      'SELECT id, username, name, role, password_hash AS "passwordHash", active, email, phone, tenant_id AS "tenantId", branch_id AS "branchId", created_at AS "createdAt" FROM users WHERE id = $1',
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
      tenantId?: string;
      branchId?: string;
    },
  ) {
    const result = await this.database.query<User>(
      'UPDATE users SET username = $2, name = $3, role = $4, active = $5, password_hash = $6, tenant_id = COALESCE($7, tenant_id), branch_id = COALESCE($8, branch_id) WHERE id = $1 RETURNING id, username, name, role, password_hash AS "passwordHash", active, tenant_id AS "tenantId", branch_id AS "branchId"',
      [
        id,
        user.username,
        user.name,
        user.role,
        user.active,
        user.passwordHash,
        user.tenantId,
        user.branchId,
      ],
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

  async createSession(userId: string, tenantId?: string, branchId?: string) {
    const token = randomUUID();
    const createdAt = new Date();
    const scope = tenantId && branchId
      ? { tenantId, branchId }
      : await this.resolveDefaultScope();
    await this.database.query(
      'INSERT INTO sessions (token, user_id, tenant_id, branch_id, created_at) VALUES ($1, $2, $3, $4, $5)',
      [token, userId, scope.tenantId, scope.branchId, createdAt],
    );
    return {
      token,
      userId,
      tenantId,
      branchId,
      createdAt: createdAt.toISOString(),
    };
  }

  async getUserByToken(token: string) {
    const result = await this.database.query<User>(
      'SELECT u.id, u.username, u.name, u.role, u.password_hash AS "passwordHash", u.active, u.email, u.phone, u.tenant_id AS "tenantId", COALESCE(s.branch_id, u.branch_id) AS "branchId", u.created_at AS "createdAt" FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND u.active = TRUE',
      [token],
    );
    return result.rows[0];
  }

  async deleteSession(token: string) {
    await this.database.query('DELETE FROM sessions WHERE token = $1', [token]);
  }
}
