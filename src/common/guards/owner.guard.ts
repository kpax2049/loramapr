import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // TODO: enforce ownerId once auth is implemented and attach owner context to the request.
    return true;
  }
}
