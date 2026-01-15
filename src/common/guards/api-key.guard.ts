import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScope } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { API_KEY_SCOPES_KEY } from '../decorators/api-key-scopes.decorator';

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const headerValue = request.headers['x-api-key'];
    const apiKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const keyHash = hashApiKey(apiKey);
    const apiKeyRecord = await this.prisma.apiKey.findFirst({
      where: {
        keyHash,
        revokedAt: null
      },
      select: {
        keyHash: true,
        scopes: true
      }
    });

    if (!apiKeyRecord || !safeEqual(apiKeyRecord.keyHash, keyHash)) {
      throw new UnauthorizedException('Invalid API key');
    }

    const requiredScopes =
      this.reflector.getAllAndOverride<ApiKeyScope[]>(API_KEY_SCOPES_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (requiredScopes.length > 0) {
      const hasAllScopes = requiredScopes.every((scope) => apiKeyRecord.scopes.includes(scope));
      if (!hasAllScopes) {
        throw new ForbiddenException('Missing required API key scope');
      }
    }

    return true;
  }
}

function hashApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}
