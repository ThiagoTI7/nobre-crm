'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Filters, Opportunity, Stage } from '@/lib/types';
import { useBoard } from '@/lib/use-board';
import { dateBR } from '@/lib/format';
import { KanbanBoard } from './board';
import { Drawer } from './drawer';
import { ListView } from './list-view';
import { LossDialog } from './loss-dialog';
import { BoardSkeleton, EmptyState, ErrorState } from './states';
import { TodayStrip } from './today-strip';
import { ToastRegion, useToasts } from './toasts';
import { Toolbar, type View } from './toolbar';

const NO_FILTERS: Filters = { q: '', seller: '', attentionOnly: false, stage: '' };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function App() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [view, setView] = useState<View>('kanban');
  const q = useDebounced(filters.q, 300);
  const board = useBoard({ q, seller: filters.seller });
  const { toasts, push, dismiss } = useToasts();

  const [selected, setSelected] = useState<string | null>(null);
  const [editOnOpen, setEditOnOpen] = useState(false);
  const [drawerVersion, setDrawerVersion] = useState(0);
  const [lossFor, setLossFor] = useState<Opportunity | null>(null);

  const { meta, data, status, asOf } = board;

  const flagged = useMemo(() => data.filter((o) => o.attention.level !== 'none'), [data]);
  const visible = useMemo(
    () =>
      data.filter(
        (o) => (!filters.attentionOnly || o.attention.level !== 'none') && (!filters.stage || o.stage === filters.stage),
      ),
    [data, filters.attentionOnly, filters.stage],
  );
  const filtersActive = !!(filters.q || filters.seller || filters.attentionOnly || filters.stage);

  const openDrawer = useCallback((code: string, edit = false) => {
    setEditOnOpen(edit);
    setSelected(code);
  }, []);

  async function moveTo(opp: Opportunity, to: Stage, lossReason?: string) {
    if (!meta) return;
    if (to === 'perdida' && !lossReason) {
      setLossFor(opp);
      return;
    }
    const label = meta.stages.find((s) => s.key === to)?.label ?? to;
    const allowed = meta.transitions[opp.stage].includes(to);
    if (allowed) board.replace({ ...opp, stage: to }); // atualização otimista; o servidor decide
    try {
      const updated = await api.transition(opp.code, { to, expectedStage: opp.stage, ...(lossReason && { lossReason }) });
      board.replace(updated);
      setDrawerVersion((v) => v + 1);
      push({ kind: 'success', message: `${opp.company} foi para ${label}.` });
    } catch (e) {
      board.replace(opp); // desfaz a atualização otimista
      if (!(e instanceof ApiError)) {
        push({ kind: 'error', message: 'Não foi possível mover a oportunidade. Tente de novo.' });
        return;
      }
      if (e.code === 'REQUIREMENTS_NOT_MET') {
        push({
          kind: 'error',
          message: e.message,
          action: { label: 'Completar dados', run: () => openDrawer(opp.code, true) },
        });
      } else if (e.code === 'STALE_STAGE') {
        push({ kind: 'error', message: e.message });
        void board.reload();
      } else {
        push({ kind: 'error', message: e.message });
      }
    }
  }

  const onChanged = (opp: Opportunity, message: string) => {
    board.replace(opp);
    setDrawerVersion((v) => v + 1);
    push({ kind: 'success', message });
  };

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-5 sm:px-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Funil da Nobre Brindes</h1>
          <p className="text-sm text-muted">Oportunidades B2B do time comercial</p>
        </div>
        {asOf && <p className="text-sm text-muted">Situação em {dateBR(asOf)}</p>}
      </header>

      <div className="space-y-4">
        {status === 'ready' && (
          <TodayStrip
            flagged={flagged}
            attentionOnly={filters.attentionOnly}
            onOpen={openDrawer}
            onToggleOnly={() => setFilters({ ...filters, attentionOnly: !filters.attentionOnly })}
          />
        )}

        <Toolbar
          filters={filters}
          setFilters={setFilters}
          meta={meta}
          view={view}
          setView={setView}
          attentionCount={flagged.length}
          refreshing={board.refreshing}
          onRefresh={board.reload}
        />

        {status === 'loading' && <BoardSkeleton />}
        {status === 'error' && <ErrorState message={board.error} onRetry={board.retry} />}
        {status === 'ready' && meta && visible.length === 0 && (
          <EmptyState filtered={filtersActive} onClear={() => setFilters(NO_FILTERS)} />
        )}
        {status === 'ready' && meta && visible.length > 0 && (
          view === 'kanban' ? (
            <KanbanBoard meta={meta} opportunities={visible} today={asOf} onOpen={openDrawer} onMove={(o, to) => moveTo(o, to)} />
          ) : (
            <ListView meta={meta} opportunities={visible} today={asOf} onOpen={openDrawer} />
          )
        )}
      </div>

      {selected && meta && (
        <Drawer
          code={selected}
          meta={meta}
          today={asOf}
          version={drawerVersion}
          startEditing={editOnOpen}
          onClose={() => setSelected(null)}
          onMove={(o, to) => moveTo(o, to)}
          onChanged={onChanged}
        />
      )}

      {lossFor && (
        <LossDialog
          opp={lossFor}
          onCancel={() => setLossFor(null)}
          onConfirm={(reason) => {
            const opp = lossFor;
            setLossFor(null);
            void moveTo(opp, 'perdida', reason);
          }}
        />
      )}

      <ToastRegion toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
