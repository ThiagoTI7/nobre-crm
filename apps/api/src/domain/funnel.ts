// Regras do funil comercial. Módulo PURO (sem I/O): é a fonte da verdade usada
// pela API e pelos testes. A tela apenas consome o resultado.

export const STAGES = [
  'primeiro_contato',
  'apresentacao_orcamento',
  'follow_up',
  'forecast',
  'fechamento',
  'perdida',
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  primeiro_contato: 'Primeiro Contato',
  apresentacao_orcamento: 'Apresentação de Orçamento',
  follow_up: 'Follow-up',
  forecast: 'Forecast',
  fechamento: 'Fechamento',
  perdida: 'Perdida',
};

export const FINAL_STAGES: readonly Stage[] = ['fechamento', 'perdida'];
export const ACTIVE_STAGES = STAGES.filter((s) => !FINAL_STAGES.includes(s)) as Stage[];

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value);
}

export function isFinalStage(stage: Stage): boolean {
  return FINAL_STAGES.includes(stage);
}

/**
 * Mapa de transições permitidas (origem -> destinos).
 *
 * Avanço: sempre uma etapa por vez, sem pular (o funil precisa refletir o que
 * realmente aconteceu; pular etapas esconde proposta não enviada / sem follow-up).
 * Fechamento só sai de Forecast (regra do enunciado).
 *
 * Retornos permitidos (o cliente pede revisão ou o negócio esfria):
 *  - Follow-up -> Apresentação de Orçamento: cliente pediu revisão da proposta.
 *  - Forecast  -> Follow-up: a previsão caiu; voltou a ser negociação aberta.
 *  - Forecast  -> Apresentação de Orçamento: escopo/preço mudou e há nova proposta.
 *
 * Retornos NÃO permitidos:
 *  - Qualquer volta para Primeiro Contato: o lead já foi contatado; "descontatar"
 *    falsearia o SLA de atendimento. Se o lead sumiu, o caminho é Perdida.
 *  - Apresentação -> Primeiro Contato: mesmo motivo.
 *  - Sair de Fechamento/Perdida: estados finais. Reabrir um negócio = criar nova
 *    oportunidade (preserva o histórico e as métricas de conversão).
 */
export const ALLOWED_TRANSITIONS: Record<Stage, readonly Stage[]> = {
  primeiro_contato: ['apresentacao_orcamento', 'perdida'],
  apresentacao_orcamento: ['follow_up', 'perdida'],
  follow_up: ['apresentacao_orcamento', 'forecast', 'perdida'],
  forecast: ['follow_up', 'apresentacao_orcamento', 'fechamento', 'perdida'],
  fechamento: [],
  perdida: [],
};

export type MissingField =
  | 'estimatedValue'
  | 'items'
  | 'proposalValidUntil'
  | 'eventDate'
  | 'lossReason';

export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  estimatedValue: 'valor estimado',
  items: 'pelo menos um item de brinde',
  proposalValidUntil: 'validade da proposta',
  eventDate: 'data do evento do cliente',
  lossReason: 'motivo da perda',
};

/**
 * Requisitos para ESTAR em cada etapa (verificados ao entrar e ao editar).
 *  - Apresentação de Orçamento: valor + item (regra do enunciado).
 *  - Follow-up: + validade da proposta (não há follow-up sem proposta enviada).
 *  - Forecast/Fechamento: + data do evento (sem ela não há como prever entrega).
 */
export const STAGE_REQUIREMENTS: Partial<Record<Stage, readonly MissingField[]>> = {
  apresentacao_orcamento: ['estimatedValue', 'items'],
  follow_up: ['estimatedValue', 'items', 'proposalValidUntil'],
  forecast: ['estimatedValue', 'items', 'proposalValidUntil', 'eventDate'],
  fechamento: ['estimatedValue', 'items', 'proposalValidUntil', 'eventDate'],
};

export interface OpportunitySnapshot {
  stage: Stage;
  estimatedValue: number | null;
  proposalValidUntil: string | null;
  eventDate: string | null;
  items: { name: string; quantity: number }[];
}

function isPresent(field: MissingField, opp: OpportunitySnapshot): boolean {
  switch (field) {
    case 'estimatedValue':
      return opp.estimatedValue !== null && opp.estimatedValue > 0;
    case 'items':
      return opp.items.some((i) => i.name.trim().length > 0 && i.quantity > 0);
    case 'proposalValidUntil':
      return !!opp.proposalValidUntil;
    case 'eventDate':
      return !!opp.eventDate;
    case 'lossReason':
      return false; // tratado separadamente
  }
}

/** Campos que faltam para a oportunidade poder estar na etapa `stage`. */
export function missingRequirements(stage: Stage, opp: OpportunitySnapshot): MissingField[] {
  const required = STAGE_REQUIREMENTS[stage] ?? [];
  return required.filter((f) => !isPresent(f, opp));
}

export type TransitionErrorCode =
  | 'SAME_STAGE'
  | 'FINAL_STAGE'
  | 'TRANSITION_NOT_ALLOWED'
  | 'REQUIREMENTS_NOT_MET'
  | 'LOSS_REASON_REQUIRED';

export interface TransitionError {
  code: TransitionErrorCode;
  message: string;
  missing?: MissingField[];
}

export function normalizeLossReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}

/** Valida a mudança de etapa. Retorna `null` se válida, ou o motivo da recusa. */
export function validateTransition(
  opp: OpportunitySnapshot,
  to: Stage,
  lossReason?: string | null,
): TransitionError | null {
  const from = opp.stage;

  if (isFinalStage(from)) {
    return {
      code: 'FINAL_STAGE',
      message: `A oportunidade está em "${STAGE_LABELS[from]}", um estado final, e não pode mais ser movida.`,
    };
  }
  if (from === to) {
    return { code: 'SAME_STAGE', message: `A oportunidade já está em "${STAGE_LABELS[to]}".` };
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    const isForwardSkip = STAGES.indexOf(to) > STAGES.indexOf(from) && to !== 'perdida';
    const hint =
      to === 'fechamento'
        ? 'Fechamento só é possível a partir de Forecast.'
        : isForwardSkip
          ? 'Não é possível pular etapas do funil.'
          : 'Esse retorno de etapa não é permitido.';
    return {
      code: 'TRANSITION_NOT_ALLOWED',
      message: `Não é possível mover de "${STAGE_LABELS[from]}" para "${STAGE_LABELS[to]}". ${hint}`,
    };
  }

  if (to === 'perdida') {
    if (!normalizeLossReason(lossReason)) {
      return {
        code: 'LOSS_REASON_REQUIRED',
        message: 'Informe o motivo da perda para marcar a oportunidade como Perdida.',
        missing: ['lossReason'],
      };
    }
    return null;
  }

  const missing = missingRequirements(to, opp);
  if (missing.length > 0) {
    const list = missing.map((m) => MISSING_FIELD_LABELS[m]).join(', ');
    return {
      code: 'REQUIREMENTS_NOT_MET',
      message: `Para ir a "${STAGE_LABELS[to]}" é preciso informar: ${list}.`,
      missing,
    };
  }
  return null;
}

/** Etapas para as quais a oportunidade pode ir (apenas pelo mapa; requisitos à parte). */
export function allowedTargets(stage: Stage): readonly Stage[] {
  return ALLOWED_TRANSITIONS[stage];
}
