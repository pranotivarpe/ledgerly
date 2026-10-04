export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { fieldErrors?: Record<string, string[] | undefined> },
  ) {
    super(message);
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown };

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that hit a 401 concurrently. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request(path: string, { body, headers, ...init }: Options) {
  return fetch(`/api${path}`, {
    credentials: 'include',
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
}

/**
 * Thin fetch wrapper: JSON in/out, cookies included, typed errors.
 * When the 15-minute access token expires, it silently refreshes once and retries.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  let res = await request(path, options);

  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await request(path, options);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.message ?? res.statusText, err?.code, err?.details);
  }
  return data as T;
}
