import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class LorawanWebhookGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const apiKeyHeader = getHeader(request, 'x-downlink-apikey');

    if (apiKeyHeader) {
      const envKey = process.env.TTS_WEBHOOK_API_KEY;
      if (!envKey) {
        throw new UnauthorizedException('Webhook API key not configured');
      }
      if (safeEqual(envKey, apiKeyHeader)) {
        return true;
      }

      throw new UnauthorizedException('Invalid webhook API key');
    }

    const authorization = getHeader(request, 'authorization');
    if (authorization) {
      const credentials = parseBasicAuth(authorization);
      if (!credentials) {
        throw new UnauthorizedException('Invalid authorization header');
      }

      const expectedUser = process.env.TTS_WEBHOOK_BASIC_USER;
      const expectedPass = process.env.TTS_WEBHOOK_BASIC_PASS;

      if (!expectedUser || !expectedPass) {
        throw new UnauthorizedException('Webhook credentials not configured');
      }

      if (safeEqual(credentials.username, expectedUser) && safeEqual(credentials.password, expectedPass)) {
        return true;
      }

      throw new UnauthorizedException('Invalid webhook credentials');
    }

    throw new UnauthorizedException('Missing webhook credentials');
  }
}

function getHeader(request: RequestWithHeaders, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseBasicAuth(header: string): { username: string; password: string } | null {
  const prefix = 'Basic ';
  if (!header.startsWith(prefix)) {
    return null;
  }
  const encoded = header.slice(prefix.length).trim();
  if (!encoded) {
    return null;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex < 0) {
    return null;
  }
  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}
