import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const rawApiBase = import.meta.env.VITE_API_URL?.trim();

function resolveApiBaseUrl(): string {
  if (!rawApiBase) return '/api/v1';
  let url = rawApiBase.replace(/\/+$/, '');
  if (!url.includes('/api/v1')) {
    if (url.endsWith('/api')) {
      url = `${url}/v1`;
    } else {
      url = `${url}/api/v1`;
    }
  }
  return url;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;
    // Proactively consider expired 30 seconds before actual exp timestamp
    return Date.now() >= payload.exp * 1000 - 30_000;
  } catch {
    return true;
  }
}

let refreshingPromise: Promise<string | null> | null = null;

export async function refreshSession(): Promise<string | null> {
  if (refreshingPromise) return refreshingPromise;

  refreshingPromise = (async () => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const data = res.data?.data;
      const token = data?.accessToken as string;
      if (token && data?.user) {
        useAuthStore.getState().setSession(token, data.user, data.permissions);
      }
      return token || null;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        useAuthStore.getState().clearSession();
      }
      return null;
    } finally {
      refreshingPromise = null;
    }
  })();

  return refreshingPromise;
}

api.interceptors.request.use(async (config) => {
  const isAuthEndpoint =
    config.url?.includes('/auth/login') ||
    config.url?.includes('/auth/refresh') ||
    config.url?.includes('/auth/google') ||
    config.url?.includes('/auth/mfa');

  let token = useAuthStore.getState().accessToken;

  // Proactive refresh: if token is expired, refresh it before sending request
  if (!isAuthEndpoint && token && isTokenExpired(token)) {
    const freshToken = await refreshSession();
    if (freshToken) {
      token = freshToken;
    }
  }

  if (token) {
    if (config.headers && typeof config.headers.set === 'function') {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint =
      original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/refresh') ||
      original?.url?.includes('/auth/google') ||
      original?.url?.includes('/auth/mfa');

    if (error.response?.status === 401 && !original?._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        const token = await refreshSession();
        if (token) {
          if (original.headers && typeof original.headers.set === 'function') {
            original.headers.set('Authorization', `Bearer ${token}`);
          } else {
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${token}`;
          }
          return api(original);
        }
      } catch {
        // Fallthrough
      }
      useAuthStore.getState().clearSession();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?expired=1&from=${encodeURIComponent(window.location.pathname)}`;
      }
    }
    return Promise.reject(error);
  }
);

export function getErrorMessage(err: unknown) {
  const e = err as {
    response?: {
      data?: {
        error?: {
          message?: string;
          details?: { fieldErrors?: Record<string, string[]> };
        };
        message?: string;
      };
    };
    message?: string;
  };
  const errObj = e?.response?.data?.error;
  if (errObj?.details?.fieldErrors) {
    const fields = Object.entries(errObj.details.fieldErrors)
      .map(([k, msgs]) => `${k}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
      .join('; ');
    if (fields && (!errObj.message || errObj.message === 'Validation failed')) {
      return `Validation failed (${fields})`;
    }
  }
  return errObj?.message || e?.response?.data?.message || e?.message || 'Something went wrong';
}

function resolveFullUrl(urlOrPath: string): string {
  if (!urlOrPath) return '';
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://') || urlOrPath.startsWith('data:')) {
    return urlOrPath;
  }
  if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
    // If API_BASE_URL ends with /api/v1 and urlOrPath starts with /api/v1, merge cleanly
    const baseOrigin = new URL(API_BASE_URL).origin;
    if (urlOrPath.startsWith('/')) {
      return `${baseOrigin}${urlOrPath}`;
    }
    return `${API_BASE_URL}/${urlOrPath}`;
  }
  return urlOrPath;
}

export function getAuthenticatedFileUrl(urlOrPath: string): string {
  if (!urlOrPath) return '';
  const resolved = resolveFullUrl(urlOrPath);
  const token = useAuthStore.getState().accessToken;
  const sep = resolved.includes('?') ? '&' : '?';
  return token ? `${resolved}${sep}token=${encodeURIComponent(token)}` : resolved;
}

export function getFileDownloadUrl(urlOrPath: string): string {
  if (!urlOrPath) return '';
  const resolved = resolveFullUrl(urlOrPath);
  const token = useAuthStore.getState().accessToken;
  const sep = resolved.includes('?') ? '&' : '?';
  return token ? `${resolved}${sep}download=1&token=${encodeURIComponent(token)}` : `${resolved}${sep}download=1`;
}

export function isImageFile(nameOrMime = ''): boolean {
  const lower = nameOrMime.toLowerCase();
  return (
    lower.startsWith('image/') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.svg')
  );
}

export function isPdfFile(nameOrMime = ''): boolean {
  const lower = nameOrMime.toLowerCase();
  return lower.includes('pdf') || lower.endsWith('.pdf');
}

export async function downloadFile(urlOrPath: string, filename?: string) {
  try {
    const directUrl = getFileDownloadUrl(urlOrPath);
    const res = await api.get(urlOrPath, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || urlOrPath.split('/').pop() || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: direct window open with authenticated download url
    const downloadUrl = getFileDownloadUrl(urlOrPath);
    window.open(downloadUrl, '_blank');
  }
}
