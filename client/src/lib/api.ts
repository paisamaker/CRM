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

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint =
      original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/refresh') ||
      original?.url?.includes('/auth/google');

    if (error.response?.status === 401 && !original?._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        if (!refreshing) {
          // Use raw axios to avoid interceptor adding expired token header
          refreshing = axios
            .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
            .then((r) => {
              const token = r.data.data.accessToken as string;
              if (token && r.data.data.user) {
                useAuthStore.getState().setSession(token, r.data.data.user);
              }
              return token;
            })
            .catch(() => {
              useAuthStore.getState().clearSession();
              if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
                window.location.href = `/login?expired=1&from=${encodeURIComponent(window.location.pathname)}`;
              }
              return null;
            })
            .finally(() => {
              refreshing = null;
            });
        }
        const token = await refreshing;
        if (token) {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        }
      } catch {
        useAuthStore.getState().clearSession();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = `/login?expired=1&from=${encodeURIComponent(window.location.pathname)}`;
        }
      }
    }
    return Promise.reject(error);
  }
);

export function getErrorMessage(err: unknown) {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e?.response?.data?.error?.message || e?.message || 'Something went wrong';
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
