import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Props = {
  name?: string | null;
  avatar?: string | null;
  className?: string;
  textClassName?: string;
  indicator?: boolean;
};

const gradientThemes = [
  'bg-gradient-to-tr from-teal-500 to-emerald-400 text-white shadow-xs',
  'bg-gradient-to-tr from-purple-500 to-indigo-500 text-white shadow-xs',
  'bg-gradient-to-tr from-orange-400 to-amber-500 text-white shadow-xs',
  'bg-gradient-to-tr from-teal-600 via-purple-600 to-orange-400 text-white shadow-xs',
];

/** Renders avatar URL (authenticated file) or rich gradient initials fallback. */
export function UserAvatar({ name, avatar, className, textClassName, indicator }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      if (!avatar) {
        setSrc(null);
        return;
      }
      if (avatar.startsWith('data:') || avatar.startsWith('http://') || avatar.startsWith('https://')) {
        setSrc(avatar);
        return;
      }
      try {
        const path = avatar.startsWith('/api/v1') ? avatar.replace('/api/v1', '') : avatar;
        const res = await api.get(path, { responseType: 'blob' });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [avatar]);

  const initial = (name?.trim()?.[0] || 'U').toUpperCase();
  const themeIndex = ((name || 'U').charCodeAt(0) + (name || 'U').length) % gradientThemes.length;
  const gradientClass = gradientThemes[themeIndex];

  return (
    <div className="relative inline-block shrink-0">
      {src ? (
        <img
          src={src}
          alt={name || 'Profile'}
          className={cn('rounded-xl object-cover ring-2 ring-white/80 shadow-xs', className)}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-xl font-bold ring-2 ring-white/80 select-none',
            gradientClass,
            className,
            textClassName
          )}
        >
          {initial}
        </div>
      )}
      {indicator ? (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
      ) : null}
    </div>
  );
}
