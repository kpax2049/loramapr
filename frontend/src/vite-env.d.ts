/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_QUERY_API_KEY?: string;
  readonly VITE_ONLINE_MS?: string;
  readonly VITE_RECENT_MS?: string;
  readonly VITE_STALE_MS?: string;
}

declare const __APP_NAME__: string;
declare const __APP_VERSION__: string;
