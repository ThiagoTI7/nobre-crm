// Testes de integração: API + PostgreSQL reais.
// Rodam apenas com TEST_DATABASE_URL (o schema desse banco é APAGADO e recriado).
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { migrate } from '../src/db/migrate';
import { createPool } from '../src/db/pool';
import { seed } from '../src/db/seed';

const url = process.env.TEST_DATABASE_URL;
const TODAY = '2026-10-15';

describe.skipIf(!url)('API (integração com PostgreSQL)', () => {
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    if (!/test/i.test(new URL(url!).pathname)) {
      throw new Error('TEST_DATABASE_URL deve apontar para um banco com "test" no nome (o schema será apagado).');
    }
    pool = createPool(url);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
    app = await buildApp({ pool, today: () => TODAY });
  });

  beforeEach(async () => {
    await seed(pool, { reset: true });
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  const get = (u: string) => app.inject({ method: 'GET', url: u });
  const send = (method: 'POST' | 'PATCH', u: string, payload?: unknown) =>
    app.inject({ method, url: u, payload: payload as object });
  const move = (code: string, body: object) => send('POST', `/api/opportunities/${code}/transitions`, body);

  describe('listagem, busca e filtros', () => {
    it('lista as 7 oportunidades com atenção calculada, mais urgentes primeiro', async () => {
      const res = await get('/api/opportunities');
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(7);
      expect(body.asOf).toBe(TODAY);
      const top3 = body.data.slice(0, 3).map((o: { code: string }) => o.code).sort();
      expect(top3).toEqual(['OPP-2002', 'OPP-2003', 'OPP-2004']);
      expect(body.data[0].attention.level).toBe('high');
      expect(body.data.at(-1).attention.level).toBe('none');
    });

    it('preserva campos em branco como null', async () => {
      const { data } = (await get('/api/opportunities?q=Tech Alpha')).json();
      expect(data).toHaveLength(1);
      expect(data[0].proposalValidUntil).toBeNull();
      expect(data[0].estimatedValue).toBe(4500);
    });

    it('busca por empresa, brinde e código; sem distinção de maiúsculas', async () => {
      expect((await get('/api/opportunities?q=banco')).json().data.map((o: any) => o.code)).toEqual(['OPP-2005']);
      expect((await get('/api/opportunities?q=SQUEEZE')).json().data.map((o: any) => o.code)).toEqual(['OPP-2003']);
      expect((await get('/api/opportunities?q=opp-2006')).json().data.map((o: any) => o.code)).toEqual(['OPP-2006']);
    });

    it('trata % e _ da busca como texto literal (sem curinga)', async () => {
      expect((await get('/api/opportunities?q=%25')).json().total).toBe(0);
      expect((await get('/api/opportunities?q=_')).json().total).toBe(0);
    });

    it('filtra por etapa, vendedor e atenção', async () => {
      expect((await get('/api/opportunities?stage=follow_up')).json().total).toBe(2);
      expect((await get('/api/opportunities?seller=Ana')).json().total).toBe(3);
      expect((await get('/api/opportunities?attention=true')).json().total).toBe(3);
      expect((await get('/api/opportunities?seller=Ana&attention=true')).json().data.map((o: any) => o.code)).toEqual(['OPP-2003']);
    });

    it('SQL injection na busca não altera o resultado nem quebra', async () => {
      const res = await get(`/api/opportunities?q=${encodeURIComponent("'; DROP TABLE opportunities; --")}`);
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBe(0);
      expect((await get('/api/opportunities')).json().total).toBe(7);
    });

    it('rejeita filtros inválidos', async () => {
      const res = await get('/api/opportunities?stage=inexistente');
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('detalhe e metadados', () => {
    it('retorna itens, atenção e histórico', async () => {
      const res = await get('/api/opportunities/OPP-2002');
      const body = res.json();
      expect(res.statusCode).toBe(200);
      expect(body.items).toEqual([{ name: 'Kit escritório', quantity: 120 }]);
      expect(body.history).toHaveLength(1);
      expect(body.attention.level).toBe('high');
    });

    it('404 para código inexistente e 400 para código malformado', async () => {
      expect((await get('/api/opportunities/OPP-9999')).statusCode).toBe(404);
      expect((await get('/api/opportunities/abc')).statusCode).toBe(400);
    });

    it('expõe etapas, transições e vendedores para a tela', async () => {
      const meta = (await get('/api/meta')).json();
      expect(meta.today).toBe(TODAY);
      expect(meta.stages.map((s: any) => s.key)).toEqual([
        'primeiro_contato', 'apresentacao_orcamento', 'follow_up', 'forecast', 'fechamento', 'perdida',
      ]);
      expect(meta.transitions.fechamento).toEqual([]);
      expect(meta.sellers).toEqual(['Ana', 'Bruno', 'Carla']);
    });

    it('rota desconhecida devolve 404 no formato padrão', async () => {
      const res = await get('/api/nada');
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });
  });

  describe('mudança de etapa (regras no backend)', () => {
    it('avança e registra o histórico (de, para, quando)', async () => {
      const res = await move('OPP-2001', { to: 'apresentacao_orcamento' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.stage).toBe('apresentacao_orcamento');
      expect(body.history).toHaveLength(2);
      expect(body.history[1]).toMatchObject({ fromStage: 'primeiro_contato', toStage: 'apresentacao_orcamento' });
      expect(new Date(body.history[1].changedAt).getTime()).toBeGreaterThan(0);
    });

    it('recusa pular etapas sem alterar nada', async () => {
      const res = await move('OPP-2001', { to: 'follow_up' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('TRANSITION_NOT_ALLOWED');
      const after = (await get('/api/opportunities/OPP-2001')).json();
      expect(after.stage).toBe('primeiro_contato');
      expect(after.history).toHaveLength(1);
    });

    it('Fechamento só a partir de Forecast', async () => {
      const bad = await move('OPP-2003', { to: 'fechamento' }); // Follow-up
      expect(bad.statusCode).toBe(409);
      const ok = await move('OPP-2005', { to: 'fechamento' }); // Forecast
      expect(ok.statusCode).toBe(200);
      expect(ok.json().stage).toBe('fechamento');
    });

    it('exige valor e item para Apresentação de Orçamento; libera após completar os dados', async () => {
      const created = await send('POST', '/api/opportunities', { company: 'Nova Ltda', seller: 'Ana' });
      expect(created.statusCode).toBe(201);
      const code = created.json().code as string;
      expect(created.json().stage).toBe('primeiro_contato');

      const blocked = await move(code, { to: 'apresentacao_orcamento' });
      expect(blocked.statusCode).toBe(422);
      expect(blocked.json().error.code).toBe('REQUIREMENTS_NOT_MET');
      expect(blocked.json().error.details.missing).toEqual(['estimatedValue', 'items']);

      const patched = await send('PATCH', `/api/opportunities/${code}`, {
        estimatedValue: 1200,
        items: [{ name: 'Caderno', quantity: 40 }],
      });
      expect(patched.statusCode).toBe(200);
      expect((await move(code, { to: 'apresentacao_orcamento' })).statusCode).toBe(200);
    });

    it('Perdida exige motivo e fica registrada no histórico', async () => {
      expect((await move('OPP-2004', { to: 'perdida' })).json().error.code).toBe('LOSS_REASON_REQUIRED');
      expect((await move('OPP-2004', { to: 'perdida', lossReason: '   ' })).statusCode).toBe(422);

      const ok = await move('OPP-2004', { to: 'perdida', lossReason: 'Fechou com concorrente' });
      expect(ok.statusCode).toBe(200);
      const body = ok.json();
      expect(body.stage).toBe('perdida');
      expect(body.lossReason).toBe('Fechou com concorrente');
      expect(body.history.at(-1)).toMatchObject({ fromStage: 'follow_up', toStage: 'perdida', note: 'Fechou com concorrente' });
      expect(body.attention.level).toBe('none');
    });

    it('estados finais não saem do lugar e não são editáveis', async () => {
      for (const code of ['OPP-2006', 'OPP-2007']) {
        const res = await move(code, { to: 'follow_up' });
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('FINAL_STAGE');
        expect((await send('PATCH', `/api/opportunities/${code}`, { estimatedValue: 1 })).statusCode).toBe(409);
        expect((await send('POST', `/api/opportunities/${code}/contacts`, {})).statusCode).toBe(409);
      }
    });

    it('permite o retorno Follow-up -> Apresentação (revisão) com observação no histórico', async () => {
      const res = await move('OPP-2003', { to: 'apresentacao_orcamento', note: 'Cliente pediu nova cotação' });
      expect(res.statusCode).toBe(200);
      expect(res.json().history.at(-1)).toMatchObject({
        fromStage: 'follow_up', toStage: 'apresentacao_orcamento', note: 'Cliente pediu nova cotação',
      });
    });

    it('nunca volta para Primeiro Contato', async () => {
      const res = await move('OPP-2002', { to: 'primeiro_contato' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('TRANSITION_NOT_ALLOWED');
    });

    it('detecta tela desatualizada (expectedStage) com 409 STALE_STAGE', async () => {
      const res = await move('OPP-2003', { to: 'forecast', expectedStage: 'apresentacao_orcamento' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('STALE_STAGE');
      expect(res.json().error.details.currentStage).toBe('follow_up');
    });

    it('movimentos simultâneos na mesma oportunidade: só um vence, histórico sem duplicidade', async () => {
      const attempts = await Promise.all([
        move('OPP-2003', { to: 'forecast', expectedStage: 'follow_up' }),
        move('OPP-2003', { to: 'perdida', lossReason: 'Desistiu', expectedStage: 'follow_up' }),
        move('OPP-2003', { to: 'forecast', expectedStage: 'follow_up' }),
      ]);
      const statuses = attempts.map((r) => r.statusCode).sort();
      expect(statuses).toEqual([200, 409, 409]);
      const detail = (await get('/api/opportunities/OPP-2003')).json();
      expect(detail.history).toHaveLength(2); // criação + 1 movimento
    });

    it('valida o corpo da requisição', async () => {
      expect((await move('OPP-2001', { to: 'xyz' })).statusCode).toBe(400);
      expect((await move('OPP-2001', {})).statusCode).toBe(400);
      expect((await send('POST', '/api/opportunities/OPP-2001/transitions')).statusCode).toBe(400);
    });
  });

  describe('edição e contatos', () => {
    it('impede apagar dados exigidos pela etapa atual', async () => {
      const res = await send('PATCH', '/api/opportunities/OPP-2003', { estimatedValue: null });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.details.missing).toEqual(['estimatedValue']);
      const items = await send('PATCH', '/api/opportunities/OPP-2003', { items: [] });
      expect(items.statusCode).toBe(422);
      expect((await get('/api/opportunities/OPP-2003')).json().estimatedValue).toBe(7200);
    });

    it('rejeita dados inválidos (valor negativo, quantidade zero, data impossível, data futura)', async () => {
      expect((await send('PATCH', '/api/opportunities/OPP-2001', { estimatedValue: -1 })).statusCode).toBe(400);
      expect((await send('PATCH', '/api/opportunities/OPP-2001', { items: [{ name: 'x', quantity: 0 }] })).statusCode).toBe(400);
      expect((await send('PATCH', '/api/opportunities/OPP-2001', { eventDate: '2026-02-30' })).statusCode).toBe(400);
      expect((await send('PATCH', '/api/opportunities/OPP-2001', { lastContactAt: '2026-10-16' })).statusCode).toBe(400);
    });

    it('registrar contato zera o alerta de retorno atrasado', async () => {
      const before = (await get('/api/opportunities/OPP-2004')).json();
      expect(before.attention.reasons.map((r: any) => r.code)).toContain('CONTACT_OVERDUE');
      const res = await send('POST', '/api/opportunities/OPP-2004/contacts', {});
      expect(res.statusCode).toBe(200);
      const after = res.json();
      expect(after.lastContactAt).toBe(TODAY);
      expect(after.attention.reasons.map((r: any) => r.code)).not.toContain('CONTACT_OVERDUE');
      expect(after.attention.reasons.map((r: any) => r.code)).toContain('PROPOSAL_EXPIRED');
    });

    it('rejeita contato com data futura', async () => {
      expect((await send('POST', '/api/opportunities/OPP-2004/contacts', { date: '2026-12-01' })).statusCode).toBe(400);
    });

    it('lead novo sem contato nasce com alerta de SLA', async () => {
      const res = await send('POST', '/api/opportunities', { company: 'Lead Quente', seller: 'Bruno' });
      expect(res.json().attention.reasons[0].code).toBe('NO_CONTACT_REGISTERED');
    });
  });

  describe('automação de follow-up', () => {
    it('/api/attention resume e lista só o que precisa de atenção', async () => {
      const body = (await get('/api/attention')).json();
      expect(body.summary).toEqual({ high: 3, medium: 0 });
      expect(body.data).toHaveLength(3);
    });

    it('/api/digest em JSON e Markdown, com filtro por vendedor', async () => {
      const json = (await get('/api/digest')).json();
      expect(json.sellers.map((s: any) => s.seller)).toEqual(['Ana', 'Bruno', 'Carla']);
      const md = await get('/api/digest?format=markdown&seller=Carla');
      expect(md.headers['content-type']).toContain('text/markdown');
      expect(md.body).toContain('Agência Pulso');
      expect(md.body).not.toContain('Clínica Vida');
    });
  });

  describe('segunda linha de defesa: banco de dados', () => {
    it('o banco recusa estado inconsistente mesmo ignorando a API', async () => {
      await expect(
        pool.query(`UPDATE opportunities SET stage='perdida', loss_reason=NULL WHERE code='OPP-2001'`),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(`UPDATE opportunities SET stage='forecast', estimated_value=NULL WHERE code='OPP-2001'`),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(pool.query(`UPDATE opportunities SET stage='invalida' WHERE code='OPP-2001'`)).rejects.toMatchObject({ code: '23514' });
    });
  });
});
