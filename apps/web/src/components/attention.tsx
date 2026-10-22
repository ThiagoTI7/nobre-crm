import type { Attention } from '@/lib/types';

export const LEVEL_STYLES = {
  high: { bar: 'border-l-alert', badge: 'bg-alert-soft text-alert', dot: 'bg-alert', label: 'Urgente' },
  medium: { bar: 'border-l-warn', badge: 'bg-warn-soft text-warn', dot: 'bg-warn', label: 'Atenção' },
  none: { bar: 'border-l-transparent', badge: '', dot: 'bg-line', label: '' },
} as const;


export function AttentionBadge({ level }: { level: Attention['level'] }) {
  if (level === 'none') return null;
  const s = LEVEL_STYLES[level];
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${s.badge}`}>{s.label}</span>
  );
}


export const actionReasons = (a: Attention) => a.reasons.filter((r) => r.severity !== 'info');
