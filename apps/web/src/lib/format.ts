import { Stage } from './types';

export const brl = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const brlExact = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "2026-10-15" -> "15/10/2026" (sem passar por Date: sem surpresas de fuso). */
export function dateBR(iso: string | null, short = false): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

export function dateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
}

function utc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86_400_000);

/** "hoje", "ontem", "há 5 dias", "em 3 dias", "amanhã". */
export function relativeDay(iso: string | null, today: string): string {
  if (!iso) return 'sem registro';
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'hoje';
  if (diff === -1) return 'ontem';
  if (diff === 1) return 'amanhã';
  return diff < 0 ? `há ${-diff} dias` : `em ${diff} dias`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

export const itemsSummary = (items: { name: string; quantity: number }[]) => {
  if (items.length === 0) return 'Nenhum brinde informado';
  const first = items[0]!;
  const base = `${first.name} · ${first.quantity.toLocaleString('pt-BR')} un.`;
  return items.length > 1 ? `${base} +${items.length - 1}` : base;
};

export const FIELD_LABELS: Record<string, string> = {
  estimatedValue: 'valor estimado',
  items: 'brindes',
  proposalValidUntil: 'validade da proposta',
  eventDate: 'data do evento',
  lossReason: 'motivo da perda',
};

export const stageIndex = (s: Stage) =>
  ['primeiro_contato', 'apresentacao_orcamento', 'follow_up', 'forecast', 'fechamento', 'perdida'].indexOf(s);
