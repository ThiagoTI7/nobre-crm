'use client';

import type { Meta, Opportunity } from '@/lib/types';
import { brl, dateBR, initials, itemsSummary, relativeDay } from '@/lib/format';
import { actionReasons, AttentionBadge, LEVEL_STYLES } from './attention';

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
  const reasons = actionReasons(opp.attention);
  const final = meta.transitions[opp.stage].length === 0;
  const isFinalLost = opp.stage === 'perdida';

  return (
    <article
      draggable={!final}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', opp.code);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(opp);
      }}
      onDragEnd={onDragEnd}
      className={`rounded-lg border border-line border-l-4 bg-white transition-shadow hover:shadow-md ${LEVEL_STYLES[level].bar} ${
        final ? 'opacity-90' : 'cursor-grab active:cursor-grabbing'
      } ${dragging ? 'opacity-40' : ''}`}
    >
      <button onClick={() => onOpen(opp.code)} className="block w-full rounded-lg p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-semibold leading-snug">{opp.company}</h3>
          <AttentionBadge level={level} />
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {opp.code} · {itemsSummary(opp.items)}
        </p>
        <p className="mt-2 text-sm font-semibold tabular-nums">{brl(opp.estimatedValue)}</p>

        {isFinalLost && opp.lossReason && (
          <p className="mt-2 text-xs text-muted">Motivo: {opp.lossReason}</p>
        )}

        {reasons.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className={`text-xs font-medium ${level === 'high' ? 'text-alert' : 'text-warn'}`}>{reasons[0]!.message}</p>
            {reasons.length > 1 && <p className="text-xs text-muted">+{reasons.length - 1} alerta(s)</p>}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="grid h-5 w-5 place-items-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand"
            >
              {initials(opp.seller)}
            </span>
            {opp.seller}
          </span>
          <span title={`Último contato: ${dateBR(opp.lastContactAt)}`}>
            Contato: {relativeDay(opp.lastContactAt, today)}
          </span>
        </div>
        {opp.eventDate && (
          <p className="mt-1 text-xs text-muted">
            Evento {dateBR(opp.eventDate, true)} ({relativeDay(opp.eventDate, today)})
          </p>
        )}
      </button>
    </article>
  );
}
