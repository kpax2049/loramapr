export type OwnerContextRequest = {
  ownerId?: string;
  user?: {
    id?: string;
  };
};

export function getOwnerIdFromRequest(request: OwnerContextRequest): string | undefined {
  // TODO: populate ownerId from auth context instead of returning undefined.
  return request.ownerId ?? request.user?.id;
}
