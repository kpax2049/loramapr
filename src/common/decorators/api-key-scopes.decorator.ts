import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';

export const API_KEY_SCOPES_KEY = 'apiKeyScopes';

export const RequireApiKeyScope = (
  ...scopes: ApiKeyScope[]
): ReturnType<typeof SetMetadata> => {
  const required = scopes.length > 0 ? scopes : [ApiKeyScope.INGEST];
  return SetMetadata(API_KEY_SCOPES_KEY, required);
};

export const ApiKeyScopes = RequireApiKeyScope;
