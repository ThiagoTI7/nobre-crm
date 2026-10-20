'use client';

import { useState } from 'react';
import type { Meta, Opportunity, Stage } from '@/lib/types';
import { brl } from '@/lib/format';
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

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" role="list" aria-label="Funil de oportunidades">
      {meta.stages.map((stage) => {
        const cards = opportunities.filter((o) => o.stage === stage.key);
        const total = cards.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);
        const droppable = canDrop(stage.key);
        const blocked = !!dragging && dragging.stage !== stage.key && !droppable;
        const highlight = over === stage.key && droppable;

        return (
          <section
            key={stage.key}
            role="listitem"
            aria-label={`${stage.label}: ${cards.length} oportunidades`}
            onDragOver={(e) => {
              if (!dragging) return;
              // Permite soltar em qualquer coluna para o backend dar o motivo da recusa;
              // visualmente só as válidas se destacam.
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
            className={`flex min-w-[17rem] flex-1 flex-col rounded-xl border p-2.5 transition-colors ${
              stage.key === 'perdida' ? 'bg-paper' : 'bg-white/70'
            } ${highlight ? 'border-brand bg-brand-soft/60' : 'border-line'} ${blocked ? 'opacity-50' : ''}`}
          >
            <header className="mb-2.5 flex items-baseline justify-between gap-2 px-1">
              <h2 className="text-sm font-semibold">{stage.label}</h2>
              <span className="text-xs tabular-nums text-muted">
                {cards.length} · {brl(total)}
              </span>
            </header>
            <div className="flex flex-1 flex-col gap-2.5">
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
                <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
                  {droppable ? 'Solte aqui para mover' : 'Nenhuma oportunidade nesta etapa'}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
