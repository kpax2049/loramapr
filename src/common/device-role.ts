import { Prisma } from '@prisma/client';

const HOME_ROLE_TOKENS = ['home', 'base'];

export function isHomeDeviceRole(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) {
    return false;
  }
  return HOME_ROLE_TOKENS.some((token) => normalized.includes(token));
}

export function buildNonHomeDeviceWhere(): Prisma.DeviceWhereInput {
  const homeRoleConditions: Prisma.DeviceWhereInput[] = HOME_ROLE_TOKENS.map((token) => ({
    role: {
      contains: token,
      mode: 'insensitive'
    }
  }));

  return {
    OR: [{ role: null }, { NOT: homeRoleConditions }]
  };
}

function normalizeRole(role: string | null | undefined): string {
  if (!role) {
    return '';
  }
  return role
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
