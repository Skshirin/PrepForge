// ============================================================================
// Typed API Client Utility
// ============================================================================
//
// Features:
//   - Typed request/response wrapper
//   - Always sends credentials ('include') for session cookie
//   - Intercepts 401 and redirects to /login on client side
//   - Formats error payloads cleanly

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: any;

  constructor(message: string, status: number, code?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export function buildUrl(endpoint: string): string {
  if (endpoint.startsWith('http')) return endpoint;
  const cleanBase = (API_BASE_URL || '').replace(/\/+$/, '');
  let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (cleanBase.endsWith('/api') && cleanEndpoint.startsWith('/api')) {
    cleanEndpoint = cleanEndpoint.substring(4);
  }

  return `${cleanBase}${cleanEndpoint}`;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = buildUrl(endpoint);

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers['Content-Type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Always send session cookie
  });

  // Handle 401 Unauthorized
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (pathname !== '/login' && pathname !== '/register') {
        window.location.href = `/login?redirect=${encodeURIComponent(pathname)}`;
      }
    }
    throw new ApiError('Authentication required. Please log in.', 401, 'UNAUTHORIZED');
  }

  // Check for other HTTP errors
  if (!response.ok) {
    let errorMsg = `Request failed with HTTP ${response.status}`;
    let errorCode: string | undefined;
    let errorDetails: any = null;

    try {
      const errorJson = await response.json();
      if (errorJson.error) {
        if (typeof errorJson.error === 'string') {
          errorMsg = errorJson.error;
        } else if (typeof errorJson.error === 'object') {
          errorMsg = errorJson.error.message || errorJson.error.code || errorMsg;
          errorCode = errorJson.error.code;
          errorDetails = errorJson.error.details || errorJson.details;
        }
      } else if (errorJson.message) {
        errorMsg = errorJson.message;
      }
    } catch {
      // Body was not JSON
    }

    throw new ApiError(errorMsg, response.status, errorCode, errorDetails);
  }

  // Handle empty responses (204 No Content, etc.)
  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T = any>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    }),

  put: <T = any>(endpoint: string, body?: any, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};
