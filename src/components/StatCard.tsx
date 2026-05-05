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

// Light mode: gradientes sólidos. Dark mode: fundo escuro translúcido.
const CARD_STYLES: Record<string, string> = {
  default:  'bg-gray-100 border-gray-300 dark:bg-slate-900 dark:border-slate-800',
  critical: 'bg-gradient-to-br from-red-500 to-red-700     border-red-600     dark:from-red-950/40     dark:to-red-950/10     dark:border-red-900/40',
  warning:  'bg-gradient-to-br from-amber-400 to-amber-600  border-amber-500   dark:from-amber-950/40  dark:to-amber-950/10  dark:border-amber-900/40',
  success:  'bg-gradient-to-br from-emerald-500 to-emerald-700 border-emerald-600 dark:from-emerald-950/40 dark:to-emerald-950/10 dark:border-emerald-900/40',
  purple:   'bg-gradient-to-br from-purple-500 to-purple-700 border-purple-600  dark:from-purple-950/40 dark:to-purple-950/10 dark:border-purple-900/40',
  orange:   'bg-gradient-to-br from-orange-500 to-orange-700 border-orange-600  dark:from-orange-950/40 dark:to-orange-950/10 dark:border-orange-900/40',
  cyan:     'bg-gradient-to-br from-cyan-500   to-cyan-700   border-cyan-600    dark:from-cyan-950/40   dark:to-cyan-950/10   dark:border-cyan-900/40',
  emerald:  'bg-gradient-to-br from-emerald-500 to-emerald-700 border-emerald-600 dark:from-emerald-950/40 dark:to-emerald-950/10 dark:border-emerald-900/40',
};

const VALUE_STYLES: Record<string, string> = {
  default:  'text-gray-900 dark:text-slate-100',
  critical: 'text-white dark:text-red-300',
  warning:  'text-white dark:text-amber-300',
  success:  'text-white dark:text-emerald-300',
  purple:   'text-white dark:text-purple-300',
  orange:   'text-white dark:text-orange-300',
  cyan:     'text-white dark:text-cyan-300',
  emerald:  'text-white dark:text-emerald-300',
};

const LABEL_STYLES: Record<string, string> = {
  default:  'text-gray-500 dark:text-slate-400',
  critical: 'text-red-100   dark:text-red-400',
  warning:  'text-amber-100  dark:text-amber-400',
  success:  'text-emerald-100 dark:text-emerald-400',
  purple:   'text-purple-100 dark:text-purple-400',
  orange:   'text-orange-100 dark:text-orange-400',
  cyan:     'text-cyan-100   dark:text-cyan-400',
  emerald:  'text-emerald-100 dark:text-emerald-400',
};

const SUBTITLE_STYLES: Record<string, string> = {
  default:  'text-gray-400 dark:text-slate-500',
  critical: 'text-red-200   dark:text-red-600/80',
  warning:  'text-amber-200  dark:text-amber-600/80',
  success:  'text-emerald-200 dark:text-emerald-600/80',
  purple:   'text-purple-200 dark:text-purple-600/80',
  orange:   'text-orange-200 dark:text-orange-600/80',
  cyan:     'text-cyan-200   dark:text-cyan-600/80',
  emerald:  'text-emerald-200 dark:text-emerald-600/80',
};

const ICON_STYLES: Record<string, string> = {
  default:  'text-gray-400 dark:text-slate-500',
  critical: 'text-red-200   dark:text-red-600',
  warning:  'text-amber-200  dark:text-amber-600',
  success:  'text-emerald-200 dark:text-emerald-600',
  purple:   'text-purple-200 dark:text-purple-600',
  orange:   'text-orange-200 dark:text-orange-600',
  cyan:     'text-cyan-200   dark:text-cyan-600',
  emerald:  'text-emerald-200 dark:text-emerald-600',
};

// Barra de acento: branca translúcida sobre gradiente, cor específica no default/dark
const ACCENT_BAR: Record<string, string> = {
  default:  'bg-blue-500',
  critical: 'bg-white/30 dark:bg-red-500',
  warning:  'bg-white/30 dark:bg-amber-500',
  success:  'bg-white/30 dark:bg-emerald-500',
  purple:   'bg-white/30 dark:bg-purple-500',
  orange:   'bg-white/30 dark:bg-orange-500',
  cyan:     'bg-white/30 dark:bg-cyan-500',
  emerald:  'bg-white/30 dark:bg-emerald-500',
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
            <p className={clsx('text-xs mt-1 truncate', SUBTITLE_STYLES[variant])}>
              {subtitle}
            </p>
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
