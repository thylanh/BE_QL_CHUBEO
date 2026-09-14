import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role, User } from '../../shared/store.service';
import { AuthStoreService } from './store.service';

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly store: AuthStoreService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: User }>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    const user = token && (await this.store.getUserByToken(token));
    if (!user)
      throw new UnauthorizedException(
        'Cần đăng nhập để thực hiện thao tác này',
      );
    request.user = user;
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length && !roles.includes(user.role))
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    return true;
  }
}
