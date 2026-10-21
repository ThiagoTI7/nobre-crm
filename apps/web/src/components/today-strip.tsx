'use client';

import type { Opportunity } from '@/lib/types';
import { brl } from '@/lib/format';
import { actionReasons } from './attention';

interface Props {
  data: Opportunity[];
  flagged: Opportunity[];
  onOpen: (code: string) => void;
}

const FINAL = ['fechamento', 'perdida'];
const MAX_ROWS = 5;

/** Único resumo da tela: o que fazer hoje (esquerda) e os números do funil (direita). */
export function TodayPanel({ data, flagged, onOpen }: Props) {
  const open = data.filter((o) => !FINAL.includes(o.stage));
  const openValue = open.reduce((s, o) => s + (o.estimatedValue ?? 0), 0);
  const won = data.filter((o) => o.stage === 'fechamento');
  const wonValue = won.reduce((s, o) => s + (o.estimatedValue ?? 0), 0);
  const rows = flagged.slice(0, MAX_ROWS);
  const n = flagged.length;

  return (
    <section aria-labelledby="hoje" className="grid gap-6 rounded-2xl bg-pine p-5 text-white lg:grid-cols-[1fr_17rem] lg:p-6">
      <div>
        <h2 id="hoje" className="text-2xl font-semibold leading-tight sm:text-[1.7rem]">
          {n === 0 ? 'Tudo em dia hoje' : n === 1 ? '1 negociação precisa de ação hoje' : `${n} negociações precisam de ação hoje`}
        </h2>
        <p className="mt-1 text-sm text-white/70">
          {n === 0 ? 'Nenhum retorno atrasado, proposta vencida ou evento em risco.' : 'Da mais urgente para a menos urgente. Clique para ver o que fazer.'}
        </p>

        {n > 0 && (
          <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-xl bg-white/[0.06]">
            {rows.map((o) => {
              const reason = actionReasons(o.attention)[0];
              const high = o.attention.level === 'high';
              return (
                <li key={o.code}>
                  <button
                    onClick={() => onOpen(o.code)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/10"
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${high ? 'bg-[#ff7a5c]' : 'bg-[#f5b84a]'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold">{o.company}</span>
                        <span className="text-sm text-white/60">{o.seller}</span>
                      </span>
                      {reason && (
                        <span className={`block text-sm ${high ? 'text-[#ffd3c7]' : 'text-[#ffe3a8]'}`}>
                          {reason.message}
                        </span>
                      )}
                    </span>
                    <span aria-hidden className="mt-0.5 text-sm text-white/50">Abrir</span>
                  </button>
                </li>
              );
            })}
            {n > rows.length && (
              <li className="px-4 py-2.5 text-sm text-white/60">
                e mais {n - rows.length}. Use “Só com ação hoje” abaixo para ver todas.
              </li>
            )}
          </ul>
        )}
      </div>

      <dl className="grid grid-cols-2 content-start gap-4 border-t border-white/15 pt-5 lg:grid-cols-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <Stat label="Em negociação" value={brl(openValue)} note={`${open.length} ${open.length === 1 ? 'oportunidade' : 'oportunidades'}`} />
        <Stat label="Vendas fechadas" value={brl(wonValue)} note={`${won.length} ${won.length === 1 ? 'venda' : 'vendas'}`} />
      </dl>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-sm text-white/65">{label}</dt>
      <dd className="font-display tabular mt-0.5 text-3xl font-semibold leading-none">{value}</dd>
      <dd className="mt-1 text-sm text-white/65">{note}</dd>
    </div>
  );
}
