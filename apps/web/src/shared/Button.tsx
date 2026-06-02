import { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning' | 'success';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: Props) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100',
        {
          primary: 'bg-blue-600 text-white hover:bg-blue-500',
          secondary: 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700',
          danger: 'bg-rose-600 text-white hover:bg-rose-500',
          warning: 'bg-amber-600 text-white hover:bg-amber-500',
          success: 'bg-emerald-600 text-white hover:bg-emerald-500',
          ghost: 'text-slate-300 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700',
        }[variant],
        {
          sm: 'px-3 py-1.5 text-xs',
          md: 'px-4 py-2 text-sm',
          lg: 'px-6 py-3 text-base',
        }[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
