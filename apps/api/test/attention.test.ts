import { describe, expect, it } from 'vitest';
import { SEED_OPPORTUNITIES } from '../src/db/seed-data';
import {
  buildDigest,
  evaluateAttention,
  renderDigestMarkdown,
  type AttentionInput,
} from '../src/domain/attention';
import { addDays, currentDate, daysBetween, isIsoDate, todayInSaoPaulo } from '../src/domain/dates';

const TODAY = '2026-10-15'; // data de referência do case

const opp = (over: Partial<AttentionInput> = {}): AttentionInput => ({
  stage: 'follow_up',
  lastContactAt: TODAY,
  proposalValidUntil: '2026-11-30',
  eventDate: '2026-12-30',
  ...over,
});

const codes = (i: AttentionInput, today = TODAY) => evaluateAttention(i, today).reasons.map((r) => r.code);

describe('dados do case (referência 15/10/2026)', () => {
  const byCode = Object.fromEntries(
    SEED_OPPORTUNITIES.map((o) => [o.code, evaluateAttention(o, TODAY)]),
  );

  it('OPP-2002: sem contato há 9 dias, proposta vencida e evento em 10 dias', () => {
    expect(byCode['OPP-2002']!.level).toBe('high');
    expect(byCode['OPP-2002']!.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['CONTACT_OVERDUE', 'PROPOSAL_EXPIRED', 'EVENT_AT_RISK']),
    );
  });

  it('OPP-2003: evento em 3 dias ainda em Follow-up; avisa validade posterior ao evento', () => {
    expect(byCode['OPP-2003']!.level).toBe('high');
    expect(byCode['OPP-2003']!.reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining(['EVENT_AT_RISK', 'VALIDITY_AFTER_EVENT']),
    );
  });

  it('OPP-2004: 13 dias sem contato e proposta vencida há 5 dias', () => {
    expect(byCode['OPP-2004']!.level).toBe('high');
    expect(byCode['OPP-2004']!.reasons.map((r) => r.message).join(' ')).toMatch(/13 dias/);
    expect(byCode['OPP-2004']!.reasons.map((r) => r.message).join(' ')).toMatch(/venceu há 5 dias/);
  });

  it('OPP-2001, OPP-2005 estão em dia; Fechamento e Perdida nunca geram alerta', () => {
    expect(byCode['OPP-2001']!.level).toBe('none');
    expect(byCode['OPP-2005']!.level).toBe('none');
    expect(byCode['OPP-2006']!.level).toBe('none');
    expect(byCode['OPP-2007']!.level).toBe('none');
  });

  it('ordena por urgência: 2004 e 2002 antes de 2003', () => {
    const ranked = Object.entries(byCode)
      .filter(([, r]) => r.level !== 'none')
      .sort((a, b) => b[1].score - a[1].score)
      .map(([code]) => code);
    expect(ranked).toHaveLength(3);
    expect(ranked[2]).toBe('OPP-2003');
  });
});

describe('contato com o cliente', () => {
  it('campo em branco é alerta, não "ok"', () => {
    const r = evaluateAttention(opp({ lastContactAt: null }), TODAY);
    expect(r.level).toBe('high');
    expect(r.reasons[0]!.code).toBe('NO_CONTACT_REGISTERED');
    expect(r.nextContactDue).toBeNull();
  });

  it('no limite da etapa (4 dias em Follow-up) ainda está ok; 5 dias vira atenção média', () => {
    expect(codes(opp({ lastContactAt: addDays(TODAY, -4) }))).not.toContain('CONTACT_OVERDUE');
    const r = evaluateAttention(opp({ lastContactAt: addDays(TODAY, -5) }), TODAY);
    expect(r.reasons.find((x) => x.code === 'CONTACT_OVERDUE')?.severity).toBe('medium');
  });

  it('com o dobro do limite a severidade sobe para alta', () => {
    const r = evaluateAttention(opp({ lastContactAt: addDays(TODAY, -8) }), TODAY);
    expect(r.reasons.find((x) => x.code === 'CONTACT_OVERDUE')?.severity).toBe('high');
    expect(r.level).toBe('high');
  });

  it('o limite varia por etapa (Primeiro Contato é mais rígido que Forecast)', () => {
    const threeDaysAgo = addDays(TODAY, -3);
    expect(codes(opp({ stage: 'primeiro_contato', lastContactAt: threeDaysAgo }))).toContain('CONTACT_OVERDUE');
    expect(codes(opp({ stage: 'forecast', lastContactAt: threeDaysAgo }))).not.toContain('CONTACT_OVERDUE');
  });

  it('sugere a data do próximo contato', () => {
    expect(evaluateAttention(opp({ lastContactAt: '2026-10-13' }), TODAY).nextContactDue).toBe('2026-10-17');
  });
});

describe('validade da proposta', () => {
  it('vencida = alta; vence hoje/em até 3 dias = média; depois disso, ok', () => {
    expect(evaluateAttention(opp({ proposalValidUntil: '2026-10-14' }), TODAY).reasons.find((r) => r.code === 'PROPOSAL_EXPIRED')?.severity).toBe('high');
    expect(evaluateAttention(opp({ proposalValidUntil: TODAY }), TODAY).reasons.find((r) => r.code === 'PROPOSAL_EXPIRING')?.message).toMatch(/hoje/);
    expect(codes(opp({ proposalValidUntil: '2026-10-18' }))).toContain('PROPOSAL_EXPIRING');
    expect(codes(opp({ proposalValidUntil: '2026-10-19' }))).not.toContain('PROPOSAL_EXPIRING');
  });

  it('Primeiro Contato ainda não tem proposta, então validade vencida não se aplica', () => {
    expect(codes(opp({ stage: 'primeiro_contato', proposalValidUntil: '2026-01-01' }))).not.toContain('PROPOSAL_EXPIRED');
  });

  it('Apresentação sem validade gera dica informativa (não eleva o nível)', () => {
    const r = evaluateAttention(opp({ stage: 'apresentacao_orcamento', proposalValidUntil: null }), TODAY);
    expect(r.reasons.map((x) => x.code)).toContain('MISSING_VALIDITY');
    expect(r.level).toBe('none');
  });
});

describe('prazo do evento', () => {
  it('evento dentro do prazo de produção antes de Forecast = alta', () => {
    const r = evaluateAttention(opp({ stage: 'apresentacao_orcamento', eventDate: '2026-10-25' }), TODAY);
    expect(r.reasons.find((x) => x.code === 'EVENT_AT_RISK')?.severity).toBe('high');
  });

  it('em Forecast o mesmo prazo é apenas média', () => {
    const r = evaluateAttention(opp({ stage: 'forecast', eventDate: '2026-10-20' }), TODAY);
    expect(r.reasons.find((x) => x.code === 'EVENT_AT_RISK')?.severity).toBe('medium');
  });

  it('evento já passado com negociação aberta = alta', () => {
    expect(codes(opp({ eventDate: '2026-10-10' }))).toContain('EVENT_PASSED');
  });

  it('11 dias de antecedência ainda não dispara (limite padrão: 10)', () => {
    expect(codes(opp({ eventDate: addDays(TODAY, 11) }))).not.toContain('EVENT_AT_RISK');
    expect(codes(opp({ eventDate: addDays(TODAY, 10) }))).toContain('EVENT_AT_RISK');
  });

  it('sem data de evento: dica informativa depois do primeiro contato', () => {
    expect(codes(opp({ eventDate: null }))).toContain('MISSING_EVENT_DATE');
    expect(codes(opp({ stage: 'primeiro_contato', eventDate: null }))).not.toContain('MISSING_EVENT_DATE');
  });
});

describe('digest por vendedor', () => {
  const input = SEED_OPPORTUNITIES;

  it('agrupa por vendedor só o que precisa de atenção, mais urgente primeiro', () => {
    const digest = buildDigest(input, TODAY);
    expect(digest.map((d) => d.seller)).toEqual(['Ana', 'Bruno', 'Carla']);
    expect(digest.find((d) => d.seller === 'Ana')!.entries.map((e) => e.code)).toEqual(['OPP-2003']);
    expect(digest.find((d) => d.seller === 'Bruno')!.entries.map((e) => e.code)).toEqual(['OPP-2002']);
    expect(digest.find((d) => d.seller === 'Carla')!.entries.map((e) => e.code)).toEqual(['OPP-2004']);
  });

  it('não inclui dicas informativas nos motivos do digest', () => {
    const entries = buildDigest(input, TODAY).flatMap((d) => d.entries);
    for (const e of entries) for (const r of e.reasons) expect(r.severity).not.toBe('info');
  });

  it('renderiza Markdown e a mensagem de "tudo em dia"', () => {
    const md = renderDigestMarkdown(buildDigest(input, TODAY), TODAY);
    expect(md).toContain('15/10/2026');
    expect(md).toContain('Agência Pulso');
    expect(md).toContain('R$');
    expect(renderDigestMarkdown([], TODAY)).toMatch(/Nenhuma oportunidade/);
  });
});

describe('datas', () => {
  it('valida datas ISO reais', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('15/10/2026')).toBe(false);
  });

  it('calcula diferença de dias sem influência de fuso/horário de verão', () => {
    expect(daysBetween('2026-10-13', '2026-10-15')).toBe(2);
    expect(daysBetween('2026-10-15', '2026-10-13')).toBe(-2);
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('"hoje" em São Paulo respeita o fuso (UTC-3)', () => {
    expect(todayInSaoPaulo(new Date('2026-10-16T01:30:00Z'))).toBe('2026-10-15');
    expect(todayInSaoPaulo(new Date('2026-10-16T03:30:00Z'))).toBe('2026-10-16');
  });

  it('REFERENCE_DATE fixa a data e é validada', () => {
    expect(currentDate({ REFERENCE_DATE: '2026-10-15' } as NodeJS.ProcessEnv)).toBe('2026-10-15');
    expect(() => currentDate({ REFERENCE_DATE: 'ontem' } as NodeJS.ProcessEnv)).toThrow();
  });
});
