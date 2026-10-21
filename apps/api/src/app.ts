import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import type { Pool } from 'pg';
import { AppError } from './errors';
import { isIsoDate } from './domain/dates';
import {
  ALLOWED_TRANSITIONS,
  FINAL_STAGES,
  STAGES,
  STAGE_LABELS,
  STAGE_REQUIREMENTS,
  isFinalStage,
} from './domain/funnel';
import {
  DEFAULT_ATTENTION_CONFIG,
  buildDigest,
  evaluateAttention,
  renderDigestMarkdown,
  type AttentionResult,
} from './domain/attention';
import * as repo from './repo';

export interface AppDeps {
  pool: Pool;
  /** Data "de hoje" (YYYY-MM-DD). Injetável para testes e para fixar a data do case. */
  today: () => string;
  corsOrigins?: string[];
  logger?: boolean;
  /** Atrás de proxy (Render, etc.): usa o IP real do cliente no rate limit. */
  trustProxy?: boolean;
}

// ---------------------------------------------------------------- schemas ---

const isoDate = z.string().refine(isIsoDate, 'Data inválida (use YYYY-MM-DD).');
const stageSchema = z.enum(STAGES);
const itemSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do brinde.').max(120),
  quantity: z.number().int('Quantidade deve ser inteira.').positive('Quantidade deve ser maior que zero.').max(10_000_000),
});
const valueSchema = z.number().nonnegative().max(9_999_999_999);
const itemsSchema = z.array(itemSchema).max(50);

const createSchema = z.object({
  company: z.string().trim().min(1, 'Informe a empresa.').max(160),
  seller: z.string().trim().min(1, 'Informe o vendedor.').max(80),
  estimatedValue: valueSchema.nullish(),
  lastContactAt: isoDate.nullish(),
  proposalValidUntil: isoDate.nullish(),
  eventDate: isoDate.nullish(),
  items: itemsSchema.optional(),
});

const updateSchema = z.object({
  company: z.string().trim().min(1).max(160).optional(),
  seller: z.string().trim().min(1).max(80).optional(),
  estimatedValue: valueSchema.nullable().optional(),
  lastContactAt: isoDate.nullable().optional(),
  proposalValidUntil: isoDate.nullable().optional(),
  eventDate: isoDate.nullable().optional(),
  items: itemsSchema.optional(),
});

const transitionSchema = z.object({
  to: stageSchema,
  lossReason: z.string().max(500).nullish(),
  note: z.string().max(500).nullish(),
  expectedStage: stageSchema.optional(),
});

const contactSchema = z.object({ date: isoDate.optional() });

const listQuerySchema = z.object({
  q: z.string().max(100).optional(),
  stage: stageSchema.optional(),
  seller: z.string().max(80).optional(),
  attention: z.enum(['true', 'false']).optional(),
});

const digestQuerySchema = z.object({
  format: z.enum(['json', 'markdown']).default('json'),
  seller: z.string().max(80).optional(),
});

const codeParams = z.object({ code: z.string().regex(/^OPP-\d+$/, 'Código inválido.') });

// ---------------------------------------------------------------- helpers ---

type WithAttention = repo.Opportunity & { attention: AttentionResult };

const withAttention = (o: repo.Opportunity, today: string): WithAttention => ({
  ...o,
  attention: evaluateAttention(o, today),
});

/** Mais urgente primeiro; empate: evento mais próximo; depois código. */
function byPriority(a: WithAttention, b: WithAttention): number {
  return (
    b.attention.score - a.attention.score ||
    (a.eventDate ?? '9999-99-99').localeCompare(b.eventDate ?? '9999-99-99') ||
    a.code.localeCompare(b.code)
  );
}

function assertNotFuture(date: string | null | undefined, today: string, field: string) {
  if (date && date > today) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} não pode estar no futuro.`, { field });
  }
}

// -------------------------------------------------------------------- app ---

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { pool, today } = deps;
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 100_000, trustProxy: deps.trustProxy ?? false });

  await app.register(helmet);
  await app.register(cors, { origin: deps.corsOrigins?.length ? deps.corsOrigins : false });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof z.ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.issues[0]?.message ?? 'Dados inválidos.',
          details: { issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
        },
      });
    }
    // Violação de CHECK/FK no banco: a API deveria ter barrado antes; resposta genérica.
    if (typeof err.code === 'string' && err.code.startsWith('23')) {
      req.log.warn({ err }, 'violação de constraint');
      return reply.status(422).send({ error: { code: 'CONSTRAINT_VIOLATION', message: 'Os dados violam uma regra de integridade.' } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'BAD_REQUEST', message: err.message } });
    }
    req.log.error({ err }, 'erro interno');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }),
  );

  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok' };
  });

  // Metadados para a tela: etapas, transições válidas e requisitos vêm do backend,
  // então a UI nunca "adivinha" regras (e não diverge delas).
  app.get('/api/meta', async () => ({
    today: today(),
    stages: STAGES.map((key) => ({ key, label: STAGE_LABELS[key], final: isFinalStage(key) })),
    finalStages: FINAL_STAGES,
    transitions: ALLOWED_TRANSITIONS,
    requirements: STAGE_REQUIREMENTS,
    attentionConfig: DEFAULT_ATTENTION_CONFIG,
    sellers: await repo.listSellers(pool),
  }));

  app.get('/api/opportunities', async (req) => {
    const query = listQuerySchema.parse(req.query);
    const t = today();
    let list = (await repo.listOpportunities(pool, query)).map((o) => withAttention(o, t));
    if (query.attention === 'true') list = list.filter((o) => o.attention.level !== 'none');
    list.sort(byPriority);
    return { asOf: t, total: list.length, data: list };
  });

  app.post('/api/opportunities', async (req, reply) => {
    const body = createSchema.parse(req.body);
    assertNotFuture(body.lastContactAt, today(), 'A data do último contato');
    const created = await repo.createOpportunity(pool, body);
    return reply.status(201).send(withAttention(created, today()));
  });

  app.get('/api/opportunities/:code', async (req) => {
    const { code } = codeParams.parse(req.params);
    const opp = await repo.getOpportunity(pool, code);
    const history = await repo.getHistory(pool, code);
    return { ...withAttention(opp, today()), history };
  });

  app.patch('/api/opportunities/:code', async (req) => {
    const { code } = codeParams.parse(req.params);
    const body = updateSchema.parse(req.body);
    assertNotFuture(body.lastContactAt, today(), 'A data do último contato');
    return withAttention(await repo.updateOpportunity(pool, code, body), today());
  });

  app.post('/api/opportunities/:code/transitions', async (req) => {
    const { code } = codeParams.parse(req.params);
    const body = transitionSchema.parse(req.body);
    const updated = await repo.transitionOpportunity(pool, code, body);
    return { ...withAttention(updated, today()), history: await repo.getHistory(pool, code) };
  });

  app.post('/api/opportunities/:code/contacts', async (req) => {
    const { code } = codeParams.parse(req.params);
    const body = contactSchema.parse(req.body ?? {});
    const date = body.date ?? today();
    assertNotFuture(date, today(), 'A data do contato');
    return withAttention(await repo.registerContact(pool, code, date), today());
  });

  // ---- Automação: follow-up esquecido --------------------------------------

  app.get('/api/attention', async () => {
    const t = today();
    const list = (await repo.listOpportunities(pool)).map((o) => withAttention(o, t));
    const flagged = list.filter((o) => o.attention.level !== 'none').sort(byPriority);
    return {
      asOf: t,
      summary: {
        high: flagged.filter((o) => o.attention.level === 'high').length,
        medium: flagged.filter((o) => o.attention.level === 'medium').length,
      },
      data: flagged,
    };
  });

  app.get('/api/digest', async (req, reply) => {
    const query = digestQuerySchema.parse(req.query);
    const t = today();
    let digests = buildDigest(await repo.listOpportunities(pool), t);
    if (query.seller) digests = digests.filter((d) => d.seller === query.seller);
    if (query.format === 'markdown') {
      return reply.type('text/markdown; charset=utf-8').send(renderDigestMarkdown(digests, t));
    }
    return { asOf: t, sellers: digests };
  });

  return app;
}
