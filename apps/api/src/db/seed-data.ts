import type { Stage } from '../domain/funnel';



export const LEGACY_LOSS_REASON = 'Não informado (registro legado)';

export interface SeedOpportunity {
  code: string;
  company: string;
  seller: string;
  estimatedValue: number;
  stage: Stage;
  lastContactAt: string | null;
  proposalValidUntil: string | null;
  eventDate: string | null;
  lossReason: string | null;
  items: { name: string; quantity: number }[];
}

export const SEED_OPPORTUNITIES: SeedOpportunity[] = [
  {
    code: 'OPP-2001', company: 'Tech Alpha Ltda', seller: 'Ana', estimatedValue: 4500,
    stage: 'primeiro_contato', lastContactAt: '2026-10-14', proposalValidUntil: null, eventDate: '2026-11-30',
    lossReason: null, items: [{ name: 'Caneca personalizada', quantity: 300 }],
  },
  {
    code: 'OPP-2002', company: 'Construtora Horizonte', seller: 'Bruno', estimatedValue: 9800,
    stage: 'apresentacao_orcamento', lastContactAt: '2026-10-06', proposalValidUntil: '2026-10-13', eventDate: '2026-10-25',
    lossReason: null, items: [{ name: 'Kit escritório', quantity: 120 }],
  },
  {
    code: 'OPP-2003', company: 'Clínica Vida', seller: 'Ana', estimatedValue: 7200,
    stage: 'follow_up', lastContactAt: '2026-10-13', proposalValidUntil: '2026-10-20', eventDate: '2026-10-18',
    lossReason: null, items: [{ name: 'Squeeze personalizado', quantity: 500 }],
  },
  {
    code: 'OPP-2004', company: 'Agência Pulso', seller: 'Carla', estimatedValue: 3900,
    stage: 'follow_up', lastContactAt: '2026-10-02', proposalValidUntil: '2026-10-10', eventDate: '2026-11-05',
    lossReason: null, items: [{ name: 'Camiseta estampada', quantity: 80 }],
  },
  {
    code: 'OPP-2005', company: 'Banco Norte', seller: 'Bruno', estimatedValue: 38000,
    stage: 'forecast', lastContactAt: '2026-10-15', proposalValidUntil: '2026-10-22', eventDate: '2026-12-12',
    lossReason: null, items: [{ name: 'Agenda executiva', quantity: 1000 }],
  },
  {
    code: 'OPP-2006', company: 'Escola Saber', seller: 'Carla', estimatedValue: 11500,
    stage: 'fechamento', lastContactAt: '2026-10-09', proposalValidUntil: '2026-10-16', eventDate: '2026-10-17',
    lossReason: null, items: [{ name: 'Mochila infantil', quantity: 250 }],
  },
  {
    code: 'OPP-2007', company: 'Padaria do Bairro', seller: 'Ana', estimatedValue: 350,
    stage: 'perdida', lastContactAt: '2026-10-01', proposalValidUntil: '2026-10-08', eventDate: '2026-10-20',
    lossReason: LEGACY_LOSS_REASON, items: [{ name: 'Caneta promocional', quantity: 50 }],
  },
];
