// Datas de negócio trabalham sempre como string ISO "YYYY-MM-DD" (sem fuso),
// o mesmo formato da coluna `date` do PostgreSQL. Isso evita o bug clássico de
// "um dia a menos" ao converter Date <-> string em fusos diferentes.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Dias inteiros de `from` até `to` (positivo se `to` é depois de `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const dt = new Date(toUtcMs(iso) + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/** Data de hoje em America/Sao_Paulo, no formato YYYY-MM-DD. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA => YYYY-MM-DD
}

/**
 * "Hoje" do sistema. REFERENCE_DATE permite fixar a data (usada para reproduzir
 * o cenário do case, cuja data de referência é 2026-10-15).
 */
export function currentDate(env: NodeJS.ProcessEnv = process.env): string {
  const ref = env.REFERENCE_DATE?.trim();
  if (ref) {
    if (!isIsoDate(ref)) throw new Error(`REFERENCE_DATE inválida: "${ref}" (use YYYY-MM-DD)`);
    return ref;
  }
  return todayInSaoPaulo();
}
