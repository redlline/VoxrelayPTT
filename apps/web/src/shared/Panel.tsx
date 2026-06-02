import { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: 'default' | 'subtle';
}

export function Panel({ children, className, tone = 'default', ...props }: PanelProps) {
  return (
    <div
      className={clsx(
        'rounded-lg border',
        tone === 'default' ? 'border-slate-800 bg-slate-900' : 'border-slate-800/80 bg-slate-900/70',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

