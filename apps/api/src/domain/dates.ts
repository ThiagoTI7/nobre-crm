
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

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const dt = new Date(toUtcMs(iso) + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}


export function todayInSaoPaulo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; 
}


export function currentDate(env: NodeJS.ProcessEnv = process.env): string {
  const ref = env.REFERENCE_DATE?.trim();
  if (ref) {
    if (!isIsoDate(ref)) throw new Error(`REFERENCE_DATE inválida: "${ref}" (use YYYY-MM-DD)`);
    return ref;
  }
  return todayInSaoPaulo();
}
