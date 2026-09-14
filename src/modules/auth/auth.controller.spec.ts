import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BadRequestException } from '@nestjs/common';
import { OrdersController } from '../orders/orders.controller';
import { OrdersStoreService } from '../orders/store.service';

describe('request-body guards', () => {
  it('login should reject empty bodies without crashing', async () => {
    const authService = {
      login: jest
        .fn()
        .mockRejectedValue(
          new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng'),
        ),
    } as unknown as AuthService;
    const controller = new AuthController(authService);

    await expect(controller.login(undefined as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('register should create a user account with valid payload', async () => {
    const authService = {
      register: jest.fn().mockResolvedValue({
        id: 'user-new',
        username: 'newuser',
        name: 'Người dùng mới',
        role: 'STAFF',
      }),
    } as unknown as AuthService;

    const controller = new AuthController(authService);

    await expect(
      controller.register({
        username: 'newuser',
        password: 'Abc@12345',
        name: 'Người dùng mới',
        role: 'STAFF',
      }),
    ).resolves.toMatchObject({
      username: 'newuser',
      role: 'STAFF',
    });
  });

  it('create order should reject undefined bodies without crashing', async () => {
    const store = {
      listMenuItems: jest.fn(),
      listOrders: jest.fn(),
      createOrder: jest.fn(),
    } as unknown as OrdersStoreService;
    const controller = new OrdersController(store);

    await expect(
      controller.create(undefined as never, { user: { id: 'u-1' } } as never),
    ).rejects.toThrow(BadRequestException);
  });
});
