export type Stage =
  | 'primeiro_contato'
  | 'apresentacao_orcamento'
  | 'follow_up'
  | 'forecast'
  | 'fechamento'
  | 'perdida';

export type Severity = 'high' | 'medium' | 'info';

export interface Reason {
  code: string;
  severity: Severity;
  message: string;
}

export interface Attention {
  level: 'high' | 'medium' | 'none';
  score: number;
  reasons: Reason[];
  nextContactDue: string | null;
}

export interface Item {
  name: string;
  quantity: number;
}

export interface Opportunity {
  code: string;
  company: string;
  seller: string;
  estimatedValue: number | null;
  stage: Stage;
  lastContactAt: string | null;
  proposalValidUntil: string | null;
  eventDate: string | null;
  lossReason: string | null;
  items: Item[];
  createdAt: string;
  updatedAt: string;
  attention: Attention;
}

export interface HistoryEntry {
  id: number;
  fromStage: Stage | null;
  toStage: Stage;
  note: string | null;
  changedAt: string;
}

export interface OpportunityDetail extends Opportunity {
  history: HistoryEntry[];
}

export interface StageMeta {
  key: Stage;
  label: string;
  final: boolean;
}

export interface Meta {
  today: string;
  stages: StageMeta[];
  transitions: Record<Stage, Stage[]>;
  sellers: string[];
}

export interface Filters {
  q: string;
  seller: string;
  attentionOnly: boolean;
  stage: Stage | '';
}
