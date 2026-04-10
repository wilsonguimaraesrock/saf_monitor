import { clsx } from 'clsx';
import { LucideIcon, Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  variant?: 'default' | 'critical' | 'warning' | 'success' | 'purple' | 'orange' | 'cyan' | 'emerald';
  subtitle?: string;
  compact?: boolean;
  tooltip?: string;
}

const CARD_STYLES: Record<string, string> = {
  default:  'bg-white border-gray-200 dark:bg-slate-900 dark:border-slate-800',
  critical: 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/40',
  warning:  'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40',
  success:  'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/40',
  purple:   'bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-900/40',
  orange:   'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/40',
  cyan:     'bg-cyan-50 border-cyan-200 dark:bg-cyan-950/20 dark:border-cyan-900/40',
  emerald:  'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/40',
};

const VALUE_STYLES: Record<string, string> = {
  default:  'text-gray-900 dark:text-slate-100',
  critical: 'text-red-700 dark:text-red-300',
  warning:  'text-amber-700 dark:text-amber-300',
  success:  'text-emerald-700 dark:text-emerald-300',
  purple:   'text-purple-700 dark:text-purple-300',
  orange:   'text-orange-700 dark:text-orange-300',
  cyan:     'text-cyan-700 dark:text-cyan-300',
  emerald:  'text-emerald-700 dark:text-emerald-300',
};

const LABEL_STYLES: Record<string, string> = {
  default:  'text-gray-500 dark:text-slate-400',
  critical: 'text-red-600 dark:text-red-400',
  warning:  'text-amber-600 dark:text-amber-400',
  success:  'text-emerald-600 dark:text-emerald-400',
  purple:   'text-purple-600 dark:text-purple-400',
  orange:   'text-orange-600 dark:text-orange-400',
  cyan:     'text-cyan-600 dark:text-cyan-400',
  emerald:  'text-emerald-600 dark:text-emerald-400',
};

const ICON_STYLES: Record<string, string> = {
  default:  'text-gray-400 dark:text-slate-500',
  critical: 'text-red-400 dark:text-red-500',
  warning:  'text-amber-400 dark:text-amber-500',
  success:  'text-emerald-400 dark:text-emerald-500',
  purple:   'text-purple-400 dark:text-purple-500',
  orange:   'text-orange-400 dark:text-orange-500',
  cyan:     'text-cyan-400 dark:text-cyan-500',
  emerald:  'text-emerald-400 dark:text-emerald-500',
};

const ACCENT_BAR: Record<string, string> = {
  default:  'bg-blue-500',
  critical: 'bg-red-500',
  warning:  'bg-amber-500',
  success:  'bg-emerald-500',
  purple:   'bg-purple-500',
  orange:   'bg-orange-500',
  cyan:     'bg-cyan-500',
  emerald:  'bg-emerald-500',
};

export function StatCard({ label, value, icon: Icon, variant = 'default', subtitle, compact, tooltip }: StatCardProps) {
  const inner = (
    <div className={clsx(
      'relative rounded-2xl border shadow-sm overflow-hidden',
      compact ? 'p-3' : 'p-5',
      CARD_STYLES[variant]
    )}>
      <div className={clsx('absolute top-0 left-0 right-0 h-0.5', ACCENT_BAR[variant])} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className={clsx(
              'font-semibold uppercase tracking-wide truncate',
              compact ? 'text-xs' : 'text-sm',
              LABEL_STYLES[variant]
            )}>
              {label}
            </p>
            {tooltip && !compact && (
              <Info size={11} className="shrink-0 text-gray-300 dark:text-slate-600" />
            )}
          </div>
          <p className={clsx(
            'font-bold tabular-nums',
            compact ? 'text-xl mt-1' : 'text-4xl mt-2',
            VALUE_STYLES[variant]
          )}>
            {value}
          </p>
          {subtitle && !compact && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 truncate">{subtitle}</p>
          )}
        </div>
        <div className={clsx('shrink-0 mt-0.5', ICON_STYLES[variant])}>
          <Icon size={compact ? 16 : 22} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );

  if (tooltip) {
    return <Tooltip text={tooltip}>{inner}</Tooltip>;
  }
  return inner;
}
