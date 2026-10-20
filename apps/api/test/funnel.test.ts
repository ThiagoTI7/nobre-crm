import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  STAGES,
  missingRequirements,
  validateTransition,
  type OpportunitySnapshot,
  type Stage,
} from '../src/domain/funnel';

const complete = (stage: Stage, over: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot => ({
  stage,
  estimatedValue: 5000,
  proposalValidUntil: '2026-11-01',
  eventDate: '2026-12-01',
  items: [{ name: 'Caneca', quantity: 100 }],
  ...over,
});

describe('regras dadas pelo enunciado', () => {
  it('só avança para Apresentação de Orçamento com valor estimado E item de brinde', () => {
    const base = complete('primeiro_contato');
    expect(validateTransition(base, 'apresentacao_orcamento')).toBeNull();

    const noValue = validateTransition({ ...base, estimatedValue: null }, 'apresentacao_orcamento');
    expect(noValue?.code).toBe('REQUIREMENTS_NOT_MET');
    expect(noValue?.missing).toEqual(['estimatedValue']);

    const zeroValue = validateTransition({ ...base, estimatedValue: 0 }, 'apresentacao_orcamento');
    expect(zeroValue?.missing).toEqual(['estimatedValue']);

    const noItems = validateTransition({ ...base, items: [] }, 'apresentacao_orcamento');
    expect(noItems?.missing).toEqual(['items']);

    const both = validateTransition({ ...base, estimatedValue: null, items: [] }, 'apresentacao_orcamento');
    expect(both?.missing).toEqual(['estimatedValue', 'items']);
  });

  it('item com nome em branco ou quantidade zero não conta como item informado', () => {
    const base = complete('primeiro_contato');
    expect(validateTransition({ ...base, items: [{ name: '  ', quantity: 10 }] }, 'apresentacao_orcamento')?.missing).toEqual(['items']);
    expect(validateTransition({ ...base, items: [{ name: 'Caneca', quantity: 0 }] }, 'apresentacao_orcamento')?.missing).toEqual(['items']);
  });

  it('Fechamento só é possível a partir de Forecast', () => {
    for (const from of STAGES.filter((s) => s !== 'forecast')) {
      const err = validateTransition(complete(from), 'fechamento');
      expect(err, `de ${from}`).not.toBeNull();
    }
    expect(validateTransition(complete('forecast'), 'fechamento')).toBeNull();
    expect(validateTransition(complete('follow_up'), 'fechamento')?.message).toMatch(/somente|só|Forecast/i);
  });

  it('Perdida vale a partir de qualquer etapa não final e exige motivo', () => {
    for (const from of ['primeiro_contato', 'apresentacao_orcamento', 'follow_up', 'forecast'] as Stage[]) {
      expect(validateTransition(complete(from), 'perdida', 'Cliente desistiu')).toBeNull();
      expect(validateTransition(complete(from), 'perdida')?.code).toBe('LOSS_REASON_REQUIRED');
      expect(validateTransition(complete(from), 'perdida', '   ')?.code).toBe('LOSS_REASON_REQUIRED');
      expect(validateTransition(complete(from), 'perdida', null)?.code).toBe('LOSS_REASON_REQUIRED');
    }
  });

  it('Perdida não exige valor/itens (lead pode morrer antes do orçamento)', () => {
    const bare = complete('primeiro_contato', { estimatedValue: null, items: [] });
    expect(validateTransition(bare, 'perdida', 'Sem retorno do lead')).toBeNull();
  });

  it('Fechamento e Perdida são estados finais', () => {
    for (const final of ['fechamento', 'perdida'] as Stage[]) {
      expect(ALLOWED_TRANSITIONS[final]).toEqual([]);
      for (const to of STAGES) {
        const err = validateTransition(complete(final), to, 'x');
        expect(err?.code, `${final} -> ${to}`).toBe(to === final ? 'FINAL_STAGE' : 'FINAL_STAGE');
      }
    }
  });
});

describe('decisões próprias: avanços e retornos', () => {
  it('não permite pular etapas', () => {
    expect(validateTransition(complete('primeiro_contato'), 'follow_up')?.code).toBe('TRANSITION_NOT_ALLOWED');
    expect(validateTransition(complete('primeiro_contato'), 'forecast')?.code).toBe('TRANSITION_NOT_ALLOWED');
    expect(validateTransition(complete('apresentacao_orcamento'), 'forecast')?.code).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('permite os retornos de revisão comercial', () => {
    expect(validateTransition(complete('follow_up'), 'apresentacao_orcamento')).toBeNull();
    expect(validateTransition(complete('forecast'), 'follow_up')).toBeNull();
    expect(validateTransition(complete('forecast'), 'apresentacao_orcamento')).toBeNull();
  });

  it('nunca volta para Primeiro Contato', () => {
    for (const from of ['apresentacao_orcamento', 'follow_up', 'forecast'] as Stage[]) {
      expect(validateTransition(complete(from), 'primeiro_contato')?.code, from).toBe('TRANSITION_NOT_ALLOWED');
    }
  });

  it('mover para a mesma etapa é recusado', () => {
    expect(validateTransition(complete('follow_up'), 'follow_up')?.code).toBe('SAME_STAGE');
  });

  it('Follow-up exige validade da proposta; Forecast exige também data do evento', () => {
    const ap = complete('apresentacao_orcamento', { proposalValidUntil: null });
    expect(validateTransition(ap, 'follow_up')?.missing).toEqual(['proposalValidUntil']);

    const fu = complete('follow_up', { eventDate: null });
    expect(validateTransition(fu, 'forecast')?.missing).toEqual(['eventDate']);
  });

  it('os requisitos valem também em retornos (ex.: Forecast -> Follow-up)', () => {
    const fc = complete('forecast', { proposalValidUntil: null });
    expect(validateTransition(fc, 'follow_up')?.missing).toEqual(['proposalValidUntil']);
  });

  it('todo destino do mapa é uma etapa conhecida e nenhuma etapa aponta para si mesma', () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const t of targets) {
        expect(STAGES).toContain(t);
        expect(t).not.toBe(from);
      }
    }
  });
});

describe('missingRequirements', () => {
  it('Primeiro Contato e Perdida não têm requisitos', () => {
    const bare = complete('primeiro_contato', { estimatedValue: null, items: [], proposalValidUntil: null, eventDate: null });
    expect(missingRequirements('primeiro_contato', bare)).toEqual([]);
    expect(missingRequirements('perdida', bare)).toEqual([]);
  });
});
