import { API_URL, INSIGHTS_URL, isNative, nativeTokenStore, sessionHint } from '@/lib/platform';
import { useSession } from '@/stores/session';
import type { AuthResponse, Problem } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors?: Record<string, string>;

  constructor(problem: Problem) {
    super(problem.detail);
    this.status = problem.status;
    this.code = problem.code;
    this.errors = problem.errors;
  }
}

type Service = 'core' | 'insights';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

const SLOW_REQUEST_MS = 4000;
let slowRequests = 0;

function baseUrl(service: Service) {
  return service === 'core' ? API_URL : INSIGHTS_URL;
}

function headers(auth: boolean, hasBody: boolean): HeadersInit {
  const h: Record<string, string> = {};
  if (hasBody) h['Content-Type'] = 'application/json';
  if (isNative) h['X-Client'] = 'native';
  const token = useSession.getState().accessToken;
  if (auth && token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return new ApiError({
      status: res.status,
      code: body.code ?? 'ERROR',
      detail: body.detail ?? res.statusText,
      errors: body.errors,
    });
  } catch {
    return new ApiError({ status: res.status, code: 'ERROR', detail: res.statusText || 'Request failed' });
  }
}

/**
 * Free-tier servers sleep when idle and take ~1 minute to wake. Rather than a frozen spinner,
 * the app shows a "waking up" banner whenever any request is unusually slow.
 */
async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  let wasSlow = false;
  const timer = setTimeout(() => {
    wasSlow = true;
    slowRequests++;
    useSession.getState().setWaking(true);
  }, SLOW_REQUEST_MS);
  try {
    return await fetch(url, { ...init, credentials: 'include' });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'NETWORK', detail: "Can't reach Trackly. Check your connection." });
  } finally {
    clearTimeout(timer);
    if (wasSlow) {
      slowRequests = Math.max(0, slowRequests - 1);
      if (slowRequests === 0) useSession.getState().setWaking(false);
    }
  }
}

export async function request<T>(service: Service, path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = opts;
  const res = await timedFetch(`${baseUrl(service)}${path}`, {
    method,
    headers: headers(auth, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (res.status === 401 && auth && !retried) {
    if (await refreshSession()) return request<T>(service, path, opts, true);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const core = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('core', path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>('core', path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>('core', path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>('core', path, { method: 'PATCH', body }),
  del: <T = void>(path: string) => request<T>('core', path, { method: 'DELETE' }),
};

export const insights = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('insights', `/api/v1/insights${path}`, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>('insights', `/api/v1/insights${path}`, { method: 'POST', body }),
  del: <T = void>(path: string, body?: unknown) =>
    request<T>('insights', `/api/v1/insights${path}`, { method: 'DELETE', body }),
};

// ---------------------------------------------------------------------------------------------
// Session handling
// ---------------------------------------------------------------------------------------------

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing: Promise<boolean> | null = null;

export async function applySession(data: AuthResponse) {
  useSession.getState().setSession(data.user, data.accessToken, data.expiresIn);
  await nativeTokenStore.set(data.refreshToken);
  sessionHint.set(true);
  // Refresh a minute before expiry so a user mid-task never hits a 401.
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshSession(), Math.max(10, data.expiresIn - 60) * 1000);
}

/** Single-flight refresh: many parallel 401s trigger exactly one refresh call. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = withCrossTabLock(doRefresh).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * Every tab shares one refresh cookie, and each refresh rotates it. The Web Locks API makes tabs
 * take turns, so two tabs never present the same token at once. Native apps have a single
 * WebView, and browsers without the API fall back to the in-tab single flight above.
 */
function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks && !isNative ? locks.request('trackly-refresh', fn) : fn();
}

async function doRefresh(): Promise<boolean> {
  try {
    const nativeToken = await nativeTokenStore.get();
    if (isNative ? !nativeToken : !sessionHint.get()) {
      useSession.getState().clear();
      return false;
    }
    const res = await timedFetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: headers(false, isNative),
      body: isNative ? JSON.stringify({ refreshToken: nativeToken }) : undefined,
    });
    if (!res.ok) {
      if (res.status === 401) {
        await nativeTokenStore.set(null);
        sessionHint.set(false);
      }
      useSession.getState().clear();
      return false;
    }
    await applySession((await res.json()) as AuthResponse);
    return true;
  } catch {
    useSession.getState().clear();
    return false;
  }
}

export async function logout() {
  const nativeToken = await nativeTokenStore.get();
  try {
    await timedFetch(`${API_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: headers(false, isNative),
      body: isNative ? JSON.stringify({ refreshToken: nativeToken }) : undefined,
    });
  } catch {
    // Signing out locally is what matters.
  }
  if (refreshTimer) clearTimeout(refreshTimer);
  await nativeTokenStore.set(null);
  sessionHint.set(false);
  useSession.getState().clear();
}
