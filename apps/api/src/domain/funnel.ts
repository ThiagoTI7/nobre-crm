

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
      return false; 
  }
}


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


export function allowedTargets(stage: Stage): readonly Stage[] {
  return ALLOWED_TRANSITIONS[stage];
}
