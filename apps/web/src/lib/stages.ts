import type { Stage } from './types';

/
export const STAGE_COLORS: Record<Stage, string> = {
  primeiro_contato: '#6b7b76',
  apresentacao_orcamento: '#2f6f8f',
  follow_up: '#8a5fb0',
  forecast: '#c27a12',
  fechamento: '#1b7a45',
  perdida: '#a0aaa6',
};


export const STAGE_HINTS: Record<Stage, string> = {
  primeiro_contato: 'Lead novo, ainda sem proposta',
  apresentacao_orcamento: 'Montando ou enviando o orçamento',
  follow_up: 'Aguardando resposta do cliente',
  forecast: 'Alta chance de fechar',
  fechamento: 'Venda ganha',
  perdida: 'Venda perdida',
};
