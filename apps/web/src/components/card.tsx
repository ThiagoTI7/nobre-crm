'use client';

import type { Meta, Opportunity } from '@/lib/types';
import { brl, dateBR, initials, itemsSummary, relativeDay } from '@/lib/format';
import { actionReasons, LEVEL_STYLES } from './attention';

interface Props {
  opp: Opportunity;
  today: string;
  meta: Meta;
  dragging: boolean;
  onOpen: (code: string) => void;
  onDragStart: (opp: Opportunity) => void;
  onDragEnd: () => void;
}

export function OpportunityCard({ opp, today, meta, dragging, onOpen, onDragStart, onDragEnd }: Props) {
  const level = opp.attention.level;
  const reason = actionReasons(opp.attention)[0];
  const extra = actionReasons(opp.attention).length - 1;
  const final = meta.transitions[opp.stage].length === 0;

  return (
    <article
      draggable={!final}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', opp.code);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(opp);
      }}
      onDragEnd={onDragEnd}
      className={`rounded-xl border border-line border-l-4 bg-surface shadow-[0_1px_2px_rgba(20,35,31,.06)] transition-shadow hover:shadow-md ${LEVEL_STYLES[level].bar} ${
        final ? '' : 'cursor-grab active:cursor-grabbing'
      } ${dragging ? 'opacity-40' : ''}`}
    >
      <button onClick={() => onOpen(opp.code)} className="block w-full rounded-xl p-3.5 text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-snug">{opp.company}</h3>
          <p className="tabular shrink-0 text-base font-semibold">{brl(opp.estimatedValue)}</p>
        </div>

        <p className="mt-0.5 text-sm text-muted">{itemsSummary(opp.items)}</p>

        {opp.stage === 'perdida' && opp.lossReason && (
          <p className="mt-2 text-xs text-muted">Motivo: {opp.lossReason}</p>
        )}

        {reason && (
          <p
            className={`mt-2 rounded-md px-2 py-1.5 text-xs font-medium ${
              level === 'high' ? 'bg-alert-soft text-alert' : 'bg-warn-soft text-warn'
            }`}
          >
            <strong className="font-semibold">{level === 'high' ? 'Urgente: ' : 'Atenção: '}</strong>
            {reason.message}
            {extra > 0 && <span className="font-normal opacity-80"> (+{extra})</span>}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-xs text-muted">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand"
            >
              {initials(opp.seller)}
            </span>
            <span className="truncate">{opp.seller}</span>
          </span>
          <span className="text-right" title={`Último contato: ${dateBR(opp.lastContactAt)}`}>
            Contato {relativeDay(opp.lastContactAt, today)}
            {opp.eventDate && stageActive(opp) && <> · Evento {dateBR(opp.eventDate, true)}</>}
          </span>
        </div>
      </button>
    </article>
  );
}

const stageActive = (o: Opportunity) => o.stage !== 'fechamento' && o.stage !== 'perdida';
