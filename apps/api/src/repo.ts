import type { Pool, PoolClient } from 'pg';
import { AppError, notFound } from './errors';
import {
  Stage,
  STAGE_LABELS,
  isFinalStage,
  missingRequirements,
  MISSING_FIELD_LABELS,
  normalizeLossReason,
  validateTransition,
  type OpportunitySnapshot,
} from './domain/funnel';

type Db = Pool | PoolClient;

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
}

export interface HistoryEntry {
  id: number;
  fromStage: Stage | null;
  toStage: Stage;
  note: string | null;
  changedAt: string;
}

interface Row {
  code: string;
  company: string;
  seller: string;
  estimated_value: number | null;
  stage: Stage;
  last_contact_at: string | null;
  proposal_valid_until: string | null;
  event_date: string | null;
  loss_reason: string | null;
  created_at: Date;
  updated_at: Date;
  items: Item[];
}

const SELECT = `
  SELECT o.*,
         COALESCE((SELECT json_agg(json_build_object('name', i.name, 'quantity', i.quantity) ORDER BY i.id)
                   FROM opportunity_items i WHERE i.opportunity_code = o.code), '[]'::json) AS items
  FROM opportunities o`;

const toOpportunity = (r: Row): Opportunity => ({
  code: r.code,
  company: r.company,
  seller: r.seller,
  estimatedValue: r.estimated_value,
  stage: r.stage,
  lastContactAt: r.last_contact_at,
  proposalValidUntil: r.proposal_valid_until,
  eventDate: r.event_date,
  lossReason: r.loss_reason,
  items: r.items,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface ListFilters {
  q?: string;
  stage?: Stage;
  seller?: string;
}

export async function listOpportunities(db: Db, filters: ListFilters = {}): Promise<Opportunity[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.q?.trim()) {
    params.push(`%${escapeLike(filters.q.trim())}%`);
    const p = `$${params.length}`;
    where.push(
      `(o.company ILIKE ${p} OR o.code ILIKE ${p} OR EXISTS (
         SELECT 1 FROM opportunity_items x WHERE x.opportunity_code = o.code AND x.name ILIKE ${p}))`,
    );
  }
  if (filters.stage) {
    params.push(filters.stage);
    where.push(`o.stage = $${params.length}`);
  }
  if (filters.seller) {
    params.push(filters.seller);
    where.push(`o.seller = $${params.length}`);
  }
  const sql = `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY o.code`;
  const { rows } = await db.query<Row>(sql, params);
  return rows.map(toOpportunity);
}

export async function listSellers(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ seller: string }>('SELECT DISTINCT seller FROM opportunities ORDER BY seller');
  return rows.map((r) => r.seller);
}

export async function getOpportunity(db: Db, code: string, opts: { lock?: boolean } = {}): Promise<Opportunity> {
  const { rows } = await db.query<Row>(`${SELECT} WHERE o.code = $1 ${opts.lock ? 'FOR UPDATE OF o' : ''}`, [code]);
  const row = rows[0];
  if (!row) throw notFound(code);
  return toOpportunity(row);
}

export async function getHistory(db: Db, code: string): Promise<HistoryEntry[]> {
  const { rows } = await db.query<{
    id: number; from_stage: Stage | null; to_stage: Stage; note: string | null; changed_at: Date;
  }>(
    `SELECT id, from_stage, to_stage, note, changed_at
       FROM stage_history WHERE opportunity_code = $1 ORDER BY changed_at, id`,
    [code],
  );
  return rows.map((r) => ({
    id: r.id,
    fromStage: r.from_stage,
    toStage: r.to_stage,
    note: r.note,
    changedAt: r.changed_at.toISOString(),
  }));
}

const snapshot = (o: Opportunity): OpportunitySnapshot => ({
  stage: o.stage,
  estimatedValue: o.estimatedValue,
  proposalValidUntil: o.proposalValidUntil,
  eventDate: o.eventDate,
  items: o.items,
});

async function replaceItems(client: PoolClient, code: string, items: Item[]) {
  await client.query('DELETE FROM opportunity_items WHERE opportunity_code = $1', [code]);
  for (const item of items) {
    await client.query(
      'INSERT INTO opportunity_items (opportunity_code, name, quantity) VALUES ($1, $2, $3)',
      [code, item.name.trim(), item.quantity],
    );
  }
}

export interface CreateInput {
  company: string;
  seller: string;
  estimatedValue?: number | null;
  lastContactAt?: string | null;
  proposalValidUntil?: string | null;
  eventDate?: string | null;
  items?: Item[];
}

/** Toda oportunidade nasce em Primeiro Contato. */
export async function createOpportunity(pool: Pool, input: CreateInput): Promise<Opportunity> {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ code: string }>(
      `INSERT INTO opportunities (company, seller, estimated_value, last_contact_at, proposal_valid_until, event_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING code`,
      [
        input.company.trim(),
        input.seller.trim(),
        input.estimatedValue ?? null,
        input.lastContactAt ?? null,
        input.proposalValidUntil ?? null,
        input.eventDate ?? null,
      ],
    );
    const code = rows[0]!.code;
    await replaceItems(client, code, input.items ?? []);
    await client.query(
      `INSERT INTO stage_history (opportunity_code, from_stage, to_stage, note) VALUES ($1, NULL, 'primeiro_contato', 'Oportunidade criada')`,
      [code],
    );
    return getOpportunity(client, code);
  });
}

export interface UpdateInput {
  company?: string;
  seller?: string;
  estimatedValue?: number | null;
  lastContactAt?: string | null;
  proposalValidUntil?: string | null;
  eventDate?: string | null;
  items?: Item[];
}

/**
 * Edição de dados. Não muda a etapa (isso é só via `transition`), mas impede
 * deixar a oportunidade num estado incompatível com a etapa atual
 * (ex.: apagar o valor de algo que está em Follow-up).
 */
export async function updateOpportunity(pool: Pool, code: string, patch: UpdateInput): Promise<Opportunity> {
  return withTransaction(pool, async (client) => {
    const current = await getOpportunity(client, code, { lock: true });
    if (isFinalStage(current.stage)) {
      throw new AppError(409, 'OPPORTUNITY_CLOSED', `Oportunidades em "${STAGE_LABELS[current.stage]}" não podem ser editadas.`);
    }
    const next: Opportunity = {
      ...current,
      ...(patch.company !== undefined && { company: patch.company.trim() }),
      ...(patch.seller !== undefined && { seller: patch.seller.trim() }),
      ...(patch.estimatedValue !== undefined && { estimatedValue: patch.estimatedValue }),
      ...(patch.lastContactAt !== undefined && { lastContactAt: patch.lastContactAt }),
      ...(patch.proposalValidUntil !== undefined && { proposalValidUntil: patch.proposalValidUntil }),
      ...(patch.eventDate !== undefined && { eventDate: patch.eventDate }),
      ...(patch.items !== undefined && { items: patch.items.map((i) => ({ name: i.name.trim(), quantity: i.quantity })) }),
    };
    const missing = missingRequirements(next.stage, snapshot(next));
    if (missing.length > 0) {
      throw new AppError(
        422,
        'REQUIREMENTS_NOT_MET',
        `Em "${STAGE_LABELS[next.stage]}" é obrigatório manter: ${missing.map((m) => MISSING_FIELD_LABELS[m]).join(', ')}.`,
        { missing },
      );
    }
    await client.query(
      `UPDATE opportunities
          SET company=$2, seller=$3, estimated_value=$4, last_contact_at=$5,
              proposal_valid_until=$6, event_date=$7, updated_at=now()
        WHERE code=$1`,
      [code, next.company, next.seller, next.estimatedValue, next.lastContactAt, next.proposalValidUntil, next.eventDate],
    );
    if (patch.items !== undefined) await replaceItems(client, code, next.items);
    return getOpportunity(client, code);
  });
}

export interface TransitionInput {
  to: Stage;
  lossReason?: string | null;
  note?: string | null;
  /** Etapa que o cliente (tela) acredita ser a atual; detecta quadro desatualizado. */
  expectedStage?: Stage;
}

/**
 * Mudança de etapa: lock da linha + validação + atualização + histórico, tudo
 * na mesma transação. Dois movimentos simultâneos na mesma oportunidade são
 * serializados; o segundo é validado contra o estado já alterado pelo primeiro.
 */
export async function transitionOpportunity(pool: Pool, code: string, input: TransitionInput): Promise<Opportunity> {
  return withTransaction(pool, async (client) => {
    const current = await getOpportunity(client, code, { lock: true });

    if (input.expectedStage && input.expectedStage !== current.stage) {
      throw new AppError(
        409,
        'STALE_STAGE',
        `A oportunidade já está em "${STAGE_LABELS[current.stage]}" (a tela estava desatualizada). Atualize e tente novamente.`,
        { currentStage: current.stage },
      );
    }

    const error = validateTransition(snapshot(current), input.to, input.lossReason);
    if (error) {
      const status = error.code === 'REQUIREMENTS_NOT_MET' || error.code === 'LOSS_REASON_REQUIRED' ? 422 : 409;
      throw new AppError(status, error.code, error.message, {
        ...(error.missing && { missing: error.missing }),
        from: current.stage,
        to: input.to,
      });
    }

    const lossReason = input.to === 'perdida' ? normalizeLossReason(input.lossReason) : null;
    await client.query(
      `UPDATE opportunities SET stage=$2, loss_reason=$3, updated_at=now() WHERE code=$1`,
      [code, input.to, lossReason],
    );
    await client.query(
      `INSERT INTO stage_history (opportunity_code, from_stage, to_stage, note) VALUES ($1,$2,$3,$4)`,
      [code, current.stage, input.to, normalizeLossReason(input.to === 'perdida' ? lossReason : input.note)],
    );
    return getOpportunity(client, code);
  });
}

/** Registra um contato com o cliente (zera o "tempo sem contato"). */
export async function registerContact(pool: Pool, code: string, date: string): Promise<Opportunity> {
  return withTransaction(pool, async (client) => {
    const current = await getOpportunity(client, code, { lock: true });
    if (isFinalStage(current.stage)) {
      throw new AppError(409, 'OPPORTUNITY_CLOSED', `Oportunidades em "${STAGE_LABELS[current.stage]}" não aceitam novos contatos.`);
    }
    await client.query('UPDATE opportunities SET last_contact_at=$2, updated_at=now() WHERE code=$1', [code, date]);
    return getOpportunity(client, code);
  });
}
