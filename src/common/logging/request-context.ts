import { AsyncLocalStorage } from 'async_hooks';

type RequestContext = {
  requestId?: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext(context: RequestContext, callback: () => void): void {
  requestContextStorage.run(context, callback);
}

export function getRequestIdFromContext(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
