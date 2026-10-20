'use client';

import { useCallback, useEffect, useState } from 'react';

export interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
  action?: { label: string; run: () => void };
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    setToasts((prev) => [...prev, { ...t, id: Date.now() + Math.random() }]);
  }, []);
  return { toasts, push, dismiss };
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, toast.action || toast.kind === 'error' ? 10_000 : 4_500);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  const tone = toast.kind === 'error' ? 'border-alert/40 bg-white' : 'border-brand/40 bg-white';
  return (
    <div className={`flex items-start gap-3 rounded-lg border ${tone} p-3 text-sm shadow-lg`}>
      <span
        aria-hidden
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${toast.kind === 'error' ? 'bg-alert' : 'bg-brand'}`}
      />
      <div className="flex-1">
        <p>{toast.message}</p>
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.run();
              onDismiss();
            }}
            className="mt-1 font-medium text-brand underline underline-offset-2"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button onClick={onDismiss} aria-label="Fechar aviso" className="text-muted hover:text-ink">
        ×
      </button>
    </div>
  );
}

export function ToastRegion({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" className="fixed bottom-4 left-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
