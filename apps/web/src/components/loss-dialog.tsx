'use client';

import { useEffect, useRef, useState } from 'react';
import type { Opportunity } from '@/lib/types';

const SUGGESTIONS = ['Preço acima do orçamento', 'Fechou com concorrente', 'Cliente sem retorno', 'Evento cancelado ou adiado'];

interface Props {
  opp: Opportunity;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function LossDialog({ opp, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const valid = reason.trim().length >= 3;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onMouseDown={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="perda-titulo"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm(reason.trim());
        }}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 id="perda-titulo" className="text-lg font-semibold">Marcar como perdida</h2>
        <p className="mt-1 text-sm text-muted">
          {opp.company} ({opp.code}) sai do funil e não poderá ser reaberta. Registre o motivo para alimentar a análise de perdas.
        </p>
        <label htmlFor="motivo" className="mt-4 block text-sm font-medium">Motivo da perda</label>
        <textarea
          id="motivo"
          ref={ref}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1 w-full rounded-md border border-line p-2 text-sm focus:border-brand"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setReason(s)}
              className="rounded-full border border-line px-2.5 py-1 text-xs hover:bg-paper"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-line px-4 py-2 text-sm hover:bg-paper">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="rounded-md bg-alert px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Marcar como perdida
          </button>
        </div>
      </form>
    </div>
  );
}
