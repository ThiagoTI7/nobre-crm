export function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" role="status" aria-label="Carregando oportunidades">
      {Array.from({ length: 6 }).map((_, c) => (
        <div key={c} className="min-w-[17rem] flex-1 rounded-xl border border-line bg-white/60 p-3">
          <div className="skeleton mb-4 h-5 w-32" />
          {Array.from({ length: c % 3 === 0 ? 3 : c % 3 === 1 ? 2 : 1 }).map((__, i) => (
            <div key={i} className="mb-3 rounded-lg border border-line bg-white p-3">
              <div className="skeleton mb-2 h-4 w-40" />
              <div className="skeleton mb-3 h-3 w-28" />
              <div className="skeleton h-3 w-full" />
            </div>
          ))}
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-10 max-w-md rounded-xl border border-alert/30 bg-alert-soft p-6 text-center">
      <h2 className="text-base font-semibold text-alert">Não foi possível carregar as oportunidades</h2>
      <p className="mt-2 text-sm text-ink">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90"
      >
        Tentar de novo
      </button>
    </div>
  );
}

export function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-dashed border-line bg-white p-8 text-center">
      <h2 className="text-base font-semibold">
        {filtered ? 'Nenhuma oportunidade com esses filtros' : 'Ainda não há oportunidades'}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {filtered
          ? 'Ajuste a busca ou remova os filtros para ver o funil completo.'
          : 'Quando um lead entrar, ele aparece aqui em Primeiro Contato.'}
      </p>
      {filtered && (
        <button
          onClick={onClear}
          className="mt-4 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-paper"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
