'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { Meta, Opportunity } from './types';

type Status = 'loading' | 'ready' | 'error';

export function useBoard(params: { q: string; seller: string }) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string>('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [data, setData] = useState<Opportunity[]>([]);
  const [asOf, setAsOf] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const id = ++requestId.current;
      if (opts.silent) setRefreshing(true);
      else setStatus('loading');
      try {
        const [m, list] = await Promise.all([api.meta(), api.list(params)]);
        if (id !== requestId.current) return; // resposta de uma busca antiga
        setMeta(m);
        setData(list.data);
        setAsOf(list.asOf);
        setStatus('ready');
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof ApiError ? e.message : 'Erro inesperado ao carregar as oportunidades.');
        setStatus('error');
      } finally {
        if (id === requestId.current) setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.q, params.seller],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const replace = useCallback((opp: Opportunity) => {
    setData((prev) => prev.map((o) => (o.code === opp.code ? { ...o, ...opp } : o)));
  }, []);

  return { status, error, meta, data, asOf, refreshing, reload: () => load({ silent: true }), retry: () => load(), setData, replace };
}
