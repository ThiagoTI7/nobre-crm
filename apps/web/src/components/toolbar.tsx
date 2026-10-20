'use client';

import type { Filters, Meta } from '@/lib/types';

export type View = 'kanban' | 'lista';

interface Props {
  filters: Filters;
  setFilters: (f: Filters) => void;
  meta: Meta | null;
  view: View;
  setView: (v: View) => void;
  attentionCount: number;
  refreshing: boolean;
  onRefresh: () => void;
}

const field =
  'h-9 rounded-md border border-line bg-white px-3 text-sm placeholder:text-muted/70 focus:border-brand';

export function Toolbar({ filters, setFilters, meta, view, setView, attentionCount, refreshing, onRefresh }: Props) {
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <label htmlFor="busca" className="sr-only">Buscar por empresa, brinde ou código</label>
        <input
          id="busca"
          type="search"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Buscar empresa, brinde ou código"
          className={`${field} w-72 max-w-full`}
        />
      </div>

      <label className="sr-only" htmlFor="vendedor">Vendedor</label>
      <select
        id="vendedor"
        value={filters.seller}
        onChange={(e) => set({ seller: e.target.value })}
        className={field}
      >
        <option value="">Todos os vendedores</option>
        {meta?.sellers.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {view === 'lista' && (
        <>
          <label className="sr-only" htmlFor="etapa">Etapa</label>
          <select
            id="etapa"
            value={filters.stage}
            onChange={(e) => set({ stage: e.target.value as Filters['stage'] })}
            className={field}
          >
            <option value="">Todas as etapas</option>
            {meta?.stages.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </>
      )}

      <button
        aria-pressed={filters.attentionOnly}
        onClick={() => set({ attentionOnly: !filters.attentionOnly })}
        className={`h-9 rounded-md border px-3 text-sm font-medium ${
          filters.attentionOnly ? 'border-alert bg-alert-soft text-alert' : 'border-line bg-white hover:bg-paper'
        }`}
      >
        Só com atenção ({attentionCount})
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm hover:bg-paper disabled:opacity-60"
        >
          {refreshing ? 'Atualizando…' : 'Atualizar'}
        </button>
        <div role="group" aria-label="Visualização" className="flex overflow-hidden rounded-md border border-line bg-white">
          {(['kanban', 'lista'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`h-9 px-3 text-sm font-medium ${view === v ? 'bg-ink text-white' : 'hover:bg-paper'}`}
            >
              {v === 'kanban' ? 'Kanban' : 'Lista'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
