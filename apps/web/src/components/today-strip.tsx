'use client';

import type { Opportunity } from '@/lib/types';
import { actionReasons, LEVEL_STYLES } from './attention';

interface Props {
  flagged: Opportunity[];
  attentionOnly: boolean;
  onOpen: (code: string) => void;
  onToggleOnly: () => void;
}

/** O que trabalhar primeiro hoje: as negociações mais urgentes, a um clique. */
export function TodayStrip({ flagged, attentionOnly, onOpen, onToggleOnly }: Props) {
  if (flagged.length === 0) {
    return (
      <p className="rounded-xl border border-brand/25 bg-brand-soft px-4 py-3 text-sm text-brand">
        Tudo em dia: nenhuma negociação precisa de ação hoje.
      </p>
    );
  }
  const top = flagged.slice(0, 4);
  return (
    <section aria-labelledby="hoje-titulo" className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="hoje-titulo" className="text-base font-semibold">
          {flagged.length === 1 ? '1 negociação pede ação hoje' : `${flagged.length} negociações pedem ação hoje`}
        </h2>
        <button onClick={onToggleOnly} className="text-sm font-medium text-brand underline underline-offset-2">
          {attentionOnly ? 'Mostrar todas' : 'Ver só estas'}
        </button>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {top.map((o) => {
          const reason = actionReasons(o.attention)[0];
          return (
            <li key={o.code}>
              <button
                onClick={() => onOpen(o.code)}
                className={`h-full w-full rounded-lg border border-line border-l-4 p-3 text-left hover:bg-paper ${LEVEL_STYLES[o.attention.level].bar}`}
              >
                <span className="block text-sm font-semibold">{o.company}</span>
                <span className="block text-xs text-muted">{o.seller}</span>
                {reason && (
                  <span className={`mt-1 block text-xs ${o.attention.level === 'high' ? 'text-alert' : 'text-warn'}`}>
                    {reason.message}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {flagged.length > top.length && (
        <p className="mt-2 text-xs text-muted">e mais {flagged.length - top.length} em “Só com atenção”.</p>
      )}
    </section>
  );
}
