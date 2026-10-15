import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary:
    'bg-[var(--purple)] text-white hover:bg-[var(--brand-deep)] shadow-sm shadow-purple-500/25 active:scale-[0.98]',
  secondary:
    'bg-[var(--teal)] text-white hover:opacity-95 shadow-sm shadow-teal-500/20 active:scale-[0.98]',
  teal:
    'bg-[var(--teal)] text-white hover:bg-[#0f766e] shadow-sm shadow-teal-500/20 active:scale-[0.98]',
  orange:
    'bg-[var(--orange)] text-white hover:bg-[#ea580c] shadow-sm shadow-orange-500/25 active:scale-[0.98]',
  gradient:
    'bg-gradient-to-r from-[var(--teal)] via-[var(--purple)] to-[var(--orange)] text-white hover:opacity-95 shadow-md shadow-purple-500/20 active:scale-[0.98]',
  ghost:
    'hover:bg-[var(--purple-soft)] text-[var(--fg-secondary)] hover:text-[var(--purple-text)] active:scale-[0.98]',
  danger:
    'bg-[var(--danger)] text-white hover:opacity-90 shadow-sm active:scale-[0.98]',
  outline:
    'border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg)] hover:bg-[var(--purple-soft)] hover:border-[var(--purple-border)] hover:text-[var(--purple-text)] active:scale-[0.98]',
};

const sizes = {
  sm: 'h-8 px-3 text-xs rounded-lg font-medium',
  md: 'h-9 px-4 text-sm rounded-xl font-medium',
  lg: 'h-11 px-6 text-sm rounded-xl font-semibold',
  icon: 'h-9 w-9 p-0 rounded-lg',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 focus-ring disabled:pointer-events-none disabled:opacity-50 select-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
