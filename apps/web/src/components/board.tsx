'use client';

import { useState } from 'react';
import type { Meta, Opportunity, Stage, StageMeta } from '@/lib/types';
import { brl } from '@/lib/format';
import { STAGE_COLORS, STAGE_HINTS } from '@/lib/stages';
import { OpportunityCard } from './card';

interface Props {
  meta: Meta;
  opportunities: Opportunity[];
  today: string;
  onOpen: (code: string) => void;
  onMove: (opp: Opportunity, to: Stage) => void;
}


export function KanbanBoard({ meta, opportunities, today, onOpen, onMove }: Props) {
  const [dragging, setDragging] = useState<Opportunity | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  const canDrop = (to: Stage) => !!dragging && dragging.stage !== to && meta.transitions[dragging.stage].includes(to);

  const lane = (stage: StageMeta) => {
    const cards = opportunities.filter((o) => o.stage === stage.key);
    const total = cards.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);
    const droppable = canDrop(stage.key);
    const blocked = !!dragging && dragging.stage !== stage.key && !droppable;
    const highlight = over === stage.key && droppable;

    return (
      <section
        key={stage.key}
        aria-label={`${stage.label}: ${cards.length} oportunidades`}
        onDragOver={(e) => {
          if (!dragging) return;
   
          e.preventDefault();
          setOver(stage.key);
        }}
        onDragLeave={() => setOver((cur) => (cur === stage.key ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          const d = dragging;
          setDragging(null);
          setOver(null);
          if (d && d.stage !== stage.key) onMove(d, stage.key);
        }}
        className={`flex min-w-0 flex-col rounded-2xl bg-lane p-3 outline-2 transition-colors ${
          highlight ? 'bg-brand-soft outline outline-brand' : 'outline-transparent'
        } ${blocked ? 'opacity-50' : ''}`}
      >
        <header className="mb-3 px-1">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_COLORS[stage.key] }} />
            <h3 className="font-display text-base font-semibold">{stage.label}</h3>
            <span className="tabular ml-auto rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
              {cards.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {STAGE_HINTS[stage.key]}
            {cards.length > 0 && total > 0 && <span className="tabular"> · {brl(total)}</span>}
          </p>
        </header>
        <div className="flex flex-col gap-2.5">
          {cards.map((opp) => (
            <OpportunityCard
              key={opp.code}
              opp={opp}
              today={today}
              meta={meta}
              dragging={dragging?.code === opp.code}
              onOpen={onOpen}
              onDragStart={setDragging}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
            />
          ))}
          {cards.length === 0 && (
            <p className="rounded-xl border border-dashed border-muted/30 px-3 py-6 text-center text-xs text-muted">
              {droppable ? 'Solte aqui para mover' : 'Nenhuma oportunidade aqui'}
            </p>
          )}
        </div>
      </section>
    );
  };

  const active = meta.stages.filter((s) => !s.final);
  const finals = meta.stages.filter((s) => s.final);

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">{active.map(lane)}</div>
      <div>
        <h2 className="mb-2 font-display text-lg font-semibold">Encerradas</h2>
        <div className="grid items-start gap-3 md:grid-cols-2">{finals.map(lane)}</div>
      </div>
    </div>
  );
}
