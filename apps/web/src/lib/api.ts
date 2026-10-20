import type { Item, Meta, Opportunity, OpportunityDetail, Stage } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Não foi possível falar com o servidor. Confira se a API está no ar e tente de novo.');
  }
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } = {};
    try {
      body = await res.json();
    } catch {
      /* resposta sem JSON (ex.: proxy fora do ar) */
    }
    const fallback = res.status >= 500 ? 'O servidor não conseguiu concluir a operação.' : `Erro ${res.status}.`;
    throw new ApiError(res.status, body.error?.code ?? 'UNKNOWN', body.error?.message ?? fallback, body.error?.details);
  }
  return res.json() as Promise<T>;
}

export interface ListParams {
  q?: string;
  seller?: string;
}

export const api = {
  meta: () => request<Meta>('/meta'),

  list: (params: ListParams, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    if (params.q?.trim()) qs.set('q', params.q.trim());
    if (params.seller) qs.set('seller', params.seller);
    const suffix = qs.size ? `?${qs}` : '';
    return request<{ asOf: string; total: number; data: Opportunity[] }>(`/opportunities${suffix}`, { signal });
  },

  detail: (code: string) => request<OpportunityDetail>(`/opportunities/${code}`),

  transition: (code: string, body: { to: Stage; expectedStage: Stage; lossReason?: string; note?: string }) =>
    request<OpportunityDetail>(`/opportunities/${code}/transitions`, { method: 'POST', body: JSON.stringify(body) }),

  update: (
    code: string,
    body: {
      estimatedValue?: number | null;
      proposalValidUntil?: string | null;
      eventDate?: string | null;
      items?: Item[];
    },
  ) => request<Opportunity>(`/opportunities/${code}`, { method: 'PATCH', body: JSON.stringify(body) }),

  registerContact: (code: string) =>
    request<Opportunity>(`/opportunities/${code}/contacts`, { method: 'POST', body: JSON.stringify({}) }),
};
