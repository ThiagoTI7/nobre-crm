'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Item, Meta, Opportunity, OpportunityDetail, Stage } from '@/lib/types';
import { brlExact, dateBR, dateTimeBR, relativeDay } from '@/lib/format';
import { LEVEL_STYLES, AttentionBadge } from './attention';

interface Props {
  code: string;
  meta: Meta;
  today: string;
  /** Muda a cada alteração feita fora do painel (ex.: arrastar o card) para recarregar o detalhe. */
  version: number;
  startEditing: boolean;
  onClose: () => void;
  onMove: (opp: Opportunity, to: Stage) => void;
  onChanged: (opp: Opportunity, message: string) => void;
}

export function Drawer({ code, meta, today, version, startEditing, onClose, onMove, onChanged }: Props) {
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(startEditing);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    setError('');
    api.detail(code).then(
      (d) => alive && setDetail(d),
      (e) => alive && setError(e instanceof ApiError ? e.message : 'Não foi possível carregar o detalhe.'),
    );
    return () => {
      alive = false;
    };
  }, [code, version]);

  useEffect(() => setEditing(startEditing), [startEditing, code]);
  useEffect(() => closeRef.current?.focus(), [code]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stageLabel = (k: Stage | null) => (k ? (meta.stages.find((s) => s.key === k)?.label ?? k) : '—');

  async function registerContact() {
    setBusy(true);
    try {
      const updated = await api.registerContact(code);
      onChanged(updated, `Contato com ${updated.company} registrado em ${dateBR(updated.lastContactAt)}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível registrar o contato.');
    } finally {
      setBusy(false);
    }
  }

  const targets = detail ? meta.transitions[detail.stage] : [];
  const reasons = detail?.attention.reasons ?? [];
  const actionable = reasons.filter((r) => r.severity !== 'info');
  const hints = reasons.filter((r) => r.severity === 'info');

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={detail ? `Detalhes de ${detail.company}` : 'Detalhes da oportunidade'}
        onMouseDown={(e) => e.stopPropagation()}
        className="drawer-enter flex h-full w-full max-w-[30rem] flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-white p-4">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{detail?.company ?? 'Carregando…'}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {code}
              {detail && <> · {stageLabel(detail.stage)}</>}
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-paper"
          >
            Fechar
          </button>
        </header>

        {error && (
          <p role="alert" className="m-4 rounded-md border border-alert/30 bg-alert-soft p-3 text-sm text-alert">{error}</p>
        )}

        {!detail && !error && (
          <div className="space-y-3 p-4" role="status" aria-label="Carregando detalhes">
            <div className="skeleton h-5 w-2/3" />
            <div className="skeleton h-20 w-full" />
            <div className="skeleton h-32 w-full" />
          </div>
        )}

        {detail && (
          <div className="space-y-5 p-4">
            {actionable.length > 0 && (
              <section
                aria-label="Alertas"
                className={`rounded-lg border-l-4 p-3 ${LEVEL_STYLES[detail.attention.level].bar} ${
                  detail.attention.level === 'high' ? 'bg-alert-soft' : 'bg-warn-soft'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-semibold">O que precisa de ação</h3>
                  <AttentionBadge level={detail.attention.level} />
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {actionable.map((r) => (
                    <li key={r.code}>{r.message}</li>
                  ))}
                </ul>
                {detail.attention.nextContactDue && (
                  <p className="mt-2 text-xs text-muted">Contato recomendado até {dateBR(detail.attention.nextContactDue)}.</p>
                )}
              </section>
            )}

            {hints.length > 0 && (
              <ul className="space-y-1 text-xs text-muted">
                {hints.map((r) => (
                  <li key={r.code}>Dica: {r.message}</li>
                ))}
              </ul>
            )}

            {!editing ? (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Info label="Valor estimado" value={brlExact(detail.estimatedValue)} />
                  <Info label="Vendedor" value={detail.seller} />
                  <Info
                    label="Último contato"
                    value={detail.lastContactAt ? `${dateBR(detail.lastContactAt)} (${relativeDay(detail.lastContactAt, today)})` : 'Nenhum registrado'}
                  />
                  <Info label="Validade da proposta" value={dateBR(detail.proposalValidUntil)} />
                  <Info
                    label="Evento do cliente"
                    value={detail.eventDate ? `${dateBR(detail.eventDate)} (${relativeDay(detail.eventDate, today)})` : '—'}
                  />
                  {detail.lossReason && <Info label="Motivo da perda" value={detail.lossReason} />}
                </dl>

                <section>
                  <h3 className="mb-1 text-sm font-semibold">Brindes</h3>
                  {detail.items.length === 0 ? (
                    <p className="text-sm text-muted">Nenhum brinde informado. É necessário para gerar o orçamento.</p>
                  ) : (
                    <ul className="divide-y divide-line rounded-md border border-line text-sm">
                      {detail.items.map((i, idx) => (
                        <li key={idx} className="flex justify-between px-3 py-2">
                          <span>{i.name}</span>
                          <span className="tabular-nums text-muted">{i.quantity.toLocaleString('pt-BR')} un.</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : (
              <EditForm
                detail={detail}
                onCancel={() => setEditing(false)}
                onSaved={(opp) => {
                  setEditing(false);
                  onChanged(opp, `Dados de ${opp.company} atualizados.`);
                }}
              />
            )}

            {targets.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Ações</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={registerContact}
                    disabled={busy}
                    className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60"
                  >
                    Registrar contato hoje
                  </button>
                  {!editing && (
                    <button onClick={() => setEditing(true)} className="rounded-md border border-line px-3 py-2 text-sm hover:bg-paper">
                      Editar dados
                    </button>
                  )}
                </div>
                <p className="mb-1 mt-4 text-xs text-muted">Mover para</p>
                <div className="flex flex-wrap gap-2">
                  {targets.map((t) => (
                    <button
                      key={t}
                      onClick={() => onMove(detail, t)}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        t === 'perdida' ? 'border-alert/40 text-alert hover:bg-alert-soft' : 'border-line hover:bg-paper'
                      }`}
                    >
                      {stageLabel(t)}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <p className="rounded-md bg-paper p-3 text-sm text-muted">
                Estado final: esta oportunidade não pode mais ser editada nem movida.
              </p>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold">Histórico de etapas</h3>
              <ol className="space-y-3 border-l border-line pl-4">
                {[...detail.history].reverse().map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <span aria-hidden className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand" />
                    <p className="font-medium">
                      {h.fromStage ? `${stageLabel(h.fromStage)} → ${stageLabel(h.toStage)}` : `Entrou em ${stageLabel(h.toStage)}`}
                    </p>
                    <p className="text-xs text-muted">{dateTimeBR(h.changedAt)}</p>
                    {h.note && <p className="mt-0.5 text-xs text-muted">“{h.note}”</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function EditForm({
  detail,
  onCancel,
  onSaved,
}: {
  detail: OpportunityDetail;
  onCancel: () => void;
  onSaved: (opp: Opportunity) => void;
}) {
  const [value, setValue] = useState(detail.estimatedValue?.toString() ?? '');
  const [validUntil, setValidUntil] = useState(detail.proposalValidUntil ?? '');
  const [eventDate, setEventDate] = useState(detail.eventDate ?? '');
  const [items, setItems] = useState<{ name: string; quantity: string }[]>(
    detail.items.length ? detail.items.map((i) => ({ name: i.name, quantity: String(i.quantity) })) : [{ name: '', quantity: '' }],
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const cleaned: Item[] = [];
    for (const row of items) {
      if (!row.name.trim() && !row.quantity.trim()) continue;
      const q = Number(row.quantity);
      if (!row.name.trim() || !Number.isInteger(q) || q <= 0) {
        setError('Cada brinde precisa de nome e de uma quantidade inteira maior que zero.');
        return;
      }
      cleaned.push({ name: row.name.trim(), quantity: q });
    }
    const num = value.trim() === '' ? null : Number(value.replace(',', '.'));
    if (num !== null && (Number.isNaN(num) || num < 0)) {
      setError('Informe o valor estimado como um número positivo (ex.: 4500).');
      return;
    }
    setSaving(true);
    try {
      const opp = await api.update(detail.code, {
        estimatedValue: num,
        proposalValidUntil: validUntil || null,
        eventDate: eventDate || null,
        items: cleaned,
      });
      onSaved(opp);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const input = 'mt-1 h-9 w-full rounded-md border border-line px-2 text-sm focus:border-brand';
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-paper/60 p-3">
      <h3 className="text-sm font-semibold">Editar dados</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm">
          Valor estimado (R$)
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
        </label>
        <label className="text-sm">
          Validade da proposta
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={input} />
        </label>
        <label className="text-sm">
          Evento do cliente
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={input} />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm">Brindes</legend>
        <div className="mt-1 space-y-2">
          {items.map((row, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                aria-label={`Nome do brinde ${idx + 1}`}
                placeholder="Ex.: Caneca personalizada"
                value={row.name}
                onChange={(e) => setItems(items.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))}
                className="h-9 flex-1 rounded-md border border-line px-2 text-sm focus:border-brand"
              />
              <input
                aria-label={`Quantidade do brinde ${idx + 1}`}
                placeholder="Qtd."
                inputMode="numeric"
                value={row.quantity}
                onChange={(e) => setItems(items.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))}
                className="h-9 w-20 rounded-md border border-line px-2 text-sm focus:border-brand"
              />
              <button
                type="button"
                aria-label={`Remover brinde ${idx + 1}`}
                onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : [{ name: '', quantity: '' }])}
                className="rounded-md border border-line px-2 text-sm hover:bg-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems([...items, { name: '', quantity: '' }])} className="mt-2 text-sm font-medium text-brand underline underline-offset-2">
          Adicionar brinde
        </button>
      </fieldset>

      {error && <p role="alert" className="rounded-md bg-alert-soft p-2 text-sm text-alert">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-paper">
          Cancelar
        </button>
        <button disabled={saving} className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}
