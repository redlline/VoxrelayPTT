import { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'role-admin' | 'role-dispatcher' | 'role-user' | 'role-listener' | 'priority-emergency' | 'priority-high' | 'priority-normal' | 'connection-live' | 'connection-offline';
}

export function Badge({ children, className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide border',
        {
          neutral: 'bg-slate-800 text-slate-300 border-slate-700',
          info: 'bg-blue-500/15 text-blue-300 border-blue-700/50',
          success: 'bg-emerald-500/15 text-emerald-300 border-emerald-700/50',
          warn: 'bg-amber-500/15 text-amber-300 border-amber-700/50',
          danger: 'bg-rose-500/15 text-rose-300 border-rose-700/50',
          'role-admin': 'bg-purple-500/20 text-purple-300 border-purple-700/50',
          'role-dispatcher': 'bg-amber-500/20 text-amber-300 border-amber-700/50',
          'role-user': 'bg-blue-500/20 text-blue-300 border-blue-700/50',
          'role-listener': 'bg-slate-700 text-slate-300 border-slate-600',
          'priority-emergency': 'bg-amber-500/20 text-amber-200 border-amber-600/60',
          'priority-high': 'bg-orange-500/20 text-orange-200 border-orange-600/60',
          'priority-normal': 'bg-slate-700 text-slate-300 border-slate-600',
          'connection-live': 'bg-emerald-500/15 text-emerald-300 border-emerald-700/50',
          'connection-offline': 'bg-rose-500/15 text-rose-300 border-rose-700/50',
        }[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
