import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 60;

type RateLimitBucket = {
  windowStart: number;
  count: number;
};

const buckets = new Map<string, RateLimitBucket>();

function getClientIp(request: any): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

@Injectable()
export class LorawanRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = getClientIp(request);
    const now = Date.now();
    const bucket = buckets.get(ip);

    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      buckets.set(ip, { windowStart: now, count: 1 });
      return true;
    }

    bucket.count += 1;
    if (bucket.count > DEFAULT_LIMIT) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
