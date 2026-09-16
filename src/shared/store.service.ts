import { scryptSync, timingSafeEqual } from 'node:crypto';

export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  passwordHash: string;
  active: boolean;
  email?: string;
  phone?: string;
  createdAt?: string;
}

export const hashPassword = (password: string) =>
  scryptSync(password, 'bun-dau-chu-beo', 64).toString('hex');

export const verifyPasswordHash = (user: User, password: string) => {
  const actual = Buffer.from(user.passwordHash, 'hex');
  const expected = Buffer.from(hashPassword(password), 'hex');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const sanitizeUser = (user: User) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safeUser } = user;
  return safeUser;
};
