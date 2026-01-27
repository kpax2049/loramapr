import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScope } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { API_KEY_SCOPES_KEY } from '../decorators/api-key-scopes.decorator';
import { hashApiKey, timingSafeEqualHex } from '../security/apiKey';

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

    if (!apiKeyRecord || !timingSafeEqualHex(apiKeyRecord.keyHash, keyHash)) {
      throw new UnauthorizedException('Invalid API key');
    }

    const requiredScopes =
      this.reflector.getAllAndOverride<ApiKeyScope[]>(API_KEY_SCOPES_KEY, [
        context.getHandler(),
        context.getClass()
      ]);

    const effectiveScopes =
      requiredScopes && requiredScopes.length > 0 ? requiredScopes : [ApiKeyScope.INGEST];

    if (effectiveScopes.length > 0) {
      const hasAllScopes = effectiveScopes.every((scope) => apiKeyRecord.scopes.includes(scope));
      if (!hasAllScopes) {
        throw new ForbiddenException('Missing required API key scope');
      }
    }

    return true;
  }
}
