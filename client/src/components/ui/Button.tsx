import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary:
    'bg-[var(--brand)] text-white hover:bg-[var(--brand-deep)] shadow-sm active:bg-[var(--brand-deep)]',
  secondary:
    'bg-[var(--fg)] text-white hover:bg-[#0b1220] shadow-sm',
  teal:
    'bg-[var(--teal)] text-white hover:bg-[var(--brand-deep)] shadow-sm',
  orange:
    'bg-[var(--orange)] text-white hover:bg-[#b45309] shadow-sm',
  gradient:
    'bg-[var(--brand)] text-white hover:bg-[var(--brand-deep)] shadow-sm',
  ghost:
    'hover:bg-[var(--bg-subtle)] text-[var(--fg-secondary)] hover:text-[var(--fg)]',
  danger:
    'bg-[var(--danger)] text-white hover:bg-[#b91c1c] shadow-sm',
  outline:
    'border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg)] hover:bg-[var(--bg-subtle)] hover:border-[var(--fg-muted)]/40',
};

const sizes = {
  sm: 'h-8 px-3 text-xs rounded-md font-medium',
  md: 'h-9 px-3.5 text-sm rounded-lg font-medium',
  lg: 'h-10 px-5 text-sm rounded-lg font-semibold',
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
        'inline-flex items-center justify-center gap-2 cursor-pointer transition-colors duration-150 focus-ring disabled:pointer-events-none disabled:opacity-50 select-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
