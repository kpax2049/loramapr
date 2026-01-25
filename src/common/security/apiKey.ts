import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const HEX_REGEX = /^[0-9a-f]+$/i;

export function generateApiKey(): string {
  return randomBytes(32).toString('base64url');
}

export function hashApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  if (left.length % 2 !== 0) {
    return false;
  }
  if (!HEX_REGEX.test(left) || !HEX_REGEX.test(right)) {
    return false;
  }
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
