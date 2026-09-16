import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('returns the public User contract when logging in', async () => {
    const store = {
      findUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        username: 'user@example.com',
        name: 'Người dùng',
        role: 'STAFF',
        passwordHash: 'hash',
        active: true,
        email: 'user@example.com',
        phone: '0900000000',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      verifyPassword: jest.fn().mockReturnValue(true),
      createSession: jest.fn().mockResolvedValue({ token: 'token-1' }),
    };
    const service = new AuthService(store as never);

    await expect(service.login('user@example.com', 'password')).resolves.toEqual(
      {
        accessToken: 'token-1',
        user: {
          id: 'user-1',
          name: 'Người dùng',
          email: 'user@example.com',
          role: 'STAFF',
          status: 'ACTIVE',
          phone: '0900000000',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
    );
  });
});