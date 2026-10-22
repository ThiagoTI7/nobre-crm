

import { daysBetween, addDays } from './dates';
import { ACTIVE_STAGES, STAGE_LABELS, Stage } from './funnel';

export type Severity = 'high' | 'medium' | 'info';

export type AttentionCode =
  | 'NO_CONTACT_REGISTERED'
  | 'CONTACT_OVERDUE'
  | 'PROPOSAL_EXPIRED'
  | 'PROPOSAL_EXPIRING'
  | 'EVENT_PASSED'
  | 'EVENT_AT_RISK'
  | 'VALIDITY_AFTER_EVENT'
  | 'MISSING_EVENT_DATE'
  | 'MISSING_VALIDITY';

export interface AttentionReason {
  code: AttentionCode;
  severity: Severity;
  message: string;
}

export type AttentionLevel = 'high' | 'medium' | 'none';

export interface AttentionResult {
  level: AttentionLevel;

  score: number;
  reasons: AttentionReason[];
 
  nextContactDue: string | null;
}

export interface AttentionInput {
  stage: Stage;
  lastContactAt: string | null;
  proposalValidUntil: string | null;
  eventDate: string | null;
}

export interface AttentionConfig {

  staleAfterDays: Record<'primeiro_contato' | 'apresentacao_orcamento' | 'follow_up' | 'forecast', number>;

  expiringSoonDays: number;
 
  productionLeadDays: number;
}

export const DEFAULT_ATTENTION_CONFIG: AttentionConfig = {
  staleAfterDays: {
    primeiro_contato: 2, 
    apresentacao_orcamento: 3,
    follow_up: 4,
    forecast: 7,
  },
  expiringSoonDays: 3,
  productionLeadDays: 10,
};

const WEIGHT: Record<Severity, number> = { high: 100, medium: 40, info: 1 };

const PROPOSAL_STAGES: readonly Stage[] = ['apresentacao_orcamento', 'follow_up', 'forecast'];
const BEFORE_FORECAST: readonly Stage[] = ['primeiro_contato', 'apresentacao_orcamento', 'follow_up'];

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function evaluateAttention(
  opp: AttentionInput,
  today: string,
  config: AttentionConfig = DEFAULT_ATTENTION_CONFIG,
): AttentionResult {
  if (!ACTIVE_STAGES.includes(opp.stage)) {
    return { level: 'none', score: 0, reasons: [], nextContactDue: null };
  }
  const stage = opp.stage as keyof AttentionConfig['staleAfterDays'];
  const reasons: AttentionReason[] = [];
  const limit = config.staleAfterDays[stage];

  // 1) Retorno ao cliente
  let nextContactDue: string | null = null;
  if (!opp.lastContactAt) {
    reasons.push({
      code: 'NO_CONTACT_REGISTERED',
      severity: 'high',
      message: 'Nenhum contato registrado com este cliente.',
    });
  } else {
    nextContactDue = addDays(opp.lastContactAt, limit);
    const since = daysBetween(opp.lastContactAt, today);
    if (since > limit) {
      reasons.push({
        code: 'CONTACT_OVERDUE',
        severity: since >= limit * 2 ? 'high' : 'medium',
        message: `Sem contato há ${since} ${plural(since, 'dia', 'dias')} (limite em ${STAGE_LABELS[stage]}: ${limit}).`,
      });
    }
  }

  if (opp.proposalValidUntil && PROPOSAL_STAGES.includes(stage)) {
    const left = daysBetween(today, opp.proposalValidUntil);
    if (left < 0) {
      const late = -left;
      reasons.push({
        code: 'PROPOSAL_EXPIRED',
        severity: 'high',
        message: `Proposta venceu há ${late} ${plural(late, 'dia', 'dias')}.`,
      });
    } else if (left <= config.expiringSoonDays) {
      reasons.push({
        code: 'PROPOSAL_EXPIRING',
        severity: 'medium',
        message: left === 0 ? 'Proposta vence hoje.' : `Proposta vence em ${left} ${plural(left, 'dia', 'dias')}.`,
      });
    }
  } else if (!opp.proposalValidUntil && stage === 'apresentacao_orcamento') {
    reasons.push({
      code: 'MISSING_VALIDITY',
      severity: 'info',
      message: 'Defina a validade da proposta para acompanhar o prazo.',
    });
  }


  if (opp.eventDate) {
    const toEvent = daysBetween(today, opp.eventDate);
    if (toEvent < 0) {
      reasons.push({
        code: 'EVENT_PASSED',
        severity: 'high',
        message: `O evento do cliente já passou (${-toEvent} ${plural(-toEvent, 'dia', 'dias')}) e a negociação segue aberta.`,
      });
    } else if (toEvent <= config.productionLeadDays) {
      const when = toEvent === 0 ? 'hoje' : `em ${toEvent} ${plural(toEvent, 'dia', 'dias')}`;
      if (BEFORE_FORECAST.includes(stage)) {
        reasons.push({
          code: 'EVENT_AT_RISK',
          severity: 'high',
          message: `Evento ${when} e a negociação ainda está em ${STAGE_LABELS[stage]}: prazo de produção em risco.`,
        });
      } else {
        reasons.push({
          code: 'EVENT_AT_RISK',
          severity: 'medium',
          message: `Evento ${when}: formalize o fechamento para garantir a produção.`,
        });
      }
    }
    if (opp.proposalValidUntil && daysBetween(opp.eventDate, opp.proposalValidUntil) > 0) {
      reasons.push({
        code: 'VALIDITY_AFTER_EVENT',
        severity: 'info',
        message: 'A validade da proposta é posterior à data do evento. Confira as datas.',
      });
    }
  } else if (stage !== 'primeiro_contato') {
    reasons.push({
      code: 'MISSING_EVENT_DATE',
      severity: 'info',
      message: 'Data do evento do cliente não informada.',
    });
  }

  const level: AttentionLevel = reasons.some((r) => r.severity === 'high')
    ? 'high'
    : reasons.some((r) => r.severity === 'medium')
      ? 'medium'
      : 'none';
  const score = reasons.reduce((sum, r) => sum + WEIGHT[r.severity], 0);
  return { level, score, reasons, nextContactDue };
}


export interface DigestInput extends AttentionInput {
  code: string;
  company: string;
  seller: string;
  estimatedValue: number | null;
}

export interface DigestEntry {
  code: string;
  company: string;
  stage: Stage;
  estimatedValue: number | null;
  level: Exclude<AttentionLevel, 'none'>;
  score: number;
  reasons: AttentionReason[];
}

export interface SellerDigest {
  seller: string;
  entries: DigestEntry[];
}


export function buildDigest(
  opps: DigestInput[],
  today: string,
  config: AttentionConfig = DEFAULT_ATTENTION_CONFIG,
): SellerDigest[] {
  const bySeller = new Map<string, DigestEntry[]>();
  for (const opp of opps) {
    const result = evaluateAttention(opp, today, config);
    if (result.level === 'none') continue;
    const entry: DigestEntry = {
      code: opp.code,
      company: opp.company,
      stage: opp.stage,
      estimatedValue: opp.estimatedValue,
      level: result.level,
      score: result.score,
      reasons: result.reasons.filter((r) => r.severity !== 'info'),
    };
    const list = bySeller.get(opp.seller) ?? [];
    list.push(entry);
    bySeller.set(opp.seller, list);
  }
  return [...bySeller.entries()]
    .map(([seller, entries]) => ({
      seller,
      entries: entries.sort((a, b) => b.score - a.score || (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0)),
    }))
    .sort((a, b) => a.seller.localeCompare(b.seller, 'pt-BR'));
}

const brl = (v: number | null) =>
  v === null ? 'valor não informado' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });


export function renderDigestMarkdown(digests: SellerDigest[], today: string): string {
  const [y, m, d] = today.split('-');
  const header = `# Follow-ups que precisam de atenção — ${d}/${m}/${y}`;
  if (digests.length === 0) return `${header}\n\nNenhuma oportunidade precisa de atenção hoje. 🎉\n`;
  const blocks = digests.map((digest) => {
    const lines = digest.entries.map((e) => {
      const flag = e.level === 'high' ? '🔴' : '🟠';
      const why = e.reasons.map((r) => `   - ${r.message}`).join('\n');
      return `${flag} **${e.company}** (${e.code}) — ${STAGE_LABELS[e.stage]} · ${brl(e.estimatedValue)}\n${why}`;
    });
    return `## ${digest.seller} (${digest.entries.length})\n\n${lines.join('\n\n')}`;
  });
  return `${header}\n\n${blocks.join('\n\n')}\n`;
}
