'use client';

import { useMemo, useState } from 'react';
import type { Meta, Opportunity } from '@/lib/types';
import { brl, dateBR, itemsSummary, relativeDay } from '@/lib/format';
import { actionReasons, AttentionBadge, LEVEL_STYLES } from './attention';

type SortKey = 'attention' | 'company' | 'value' | 'lastContact' | 'event';

interface Props {
  meta: Meta;
  opportunities: Opportunity[];
  today: string;
  onOpen: (code: string) => void;
}

export function ListView({ meta, opportunities, today, onOpen }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'attention', dir: -1 });
  const stageLabel = (k: string) => meta.stages.find((s) => s.key === k)?.label ?? k;

  const rows = useMemo(() => {
    const val = (o: Opportunity): string | number => {
      switch (sort.key) {
        case 'attention': return o.attention.score;
        case 'company': return o.company.toLocaleLowerCase('pt-BR');
        case 'value': return o.estimatedValue ?? -1;
        case 'lastContact': return o.lastContactAt ?? '';
        case 'event': return o.eventDate ?? '9999-99-99';
      }
    };
    return [...opportunities].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return cmp * sort.dir || a.code.localeCompare(b.code);
    });
  }, [opportunities, sort]);

  const th = (key: SortKey, label: string, align = 'text-left') => {
    const active = sort.key === key;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2 ${align}`}>
        <button
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'attention' ? -1 : 1 }))}
          className="font-semibold hover:text-brand"
        >
          {label}
          <span aria-hidden className="ml-1 text-xs text-muted">{active ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="border-b border-line bg-paper text-xs">
          <tr>
            {th('attention', 'Atenção')}
            {th('company', 'Empresa')}
            <th scope="col" className="px-3 py-2 text-left font-semibold">Brinde</th>
            {th('value', 'Valor', 'text-right')}
            <th scope="col" className="px-3 py-2 text-left font-semibold">Vendedor</th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">Etapa</th>
            {th('lastContact', 'Último contato')}
            {th('event', 'Evento')}
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const first = actionReasons(o.attention)[0];
            return (
              <tr key={o.code} className="border-b border-line/70 last:border-0 hover:bg-paper/70">
                <td className={`border-l-4 px-3 py-2.5 ${LEVEL_STYLES[o.attention.level].bar}`}>
                  {o.attention.level === 'none' ? <span className="text-muted">—</span> : <AttentionBadge level={o.attention.level} />}
                </td>
                <td className="px-3 py-2.5">
                  <button onClick={() => onOpen(o.code)} className="text-left font-semibold hover:text-brand hover:underline">
                    {o.company}
                  </button>
                  <div className="text-xs text-muted">{o.code}</div>
                  {first && <div className={`mt-0.5 text-xs ${o.attention.level === 'high' ? 'text-alert' : 'text-warn'}`}>{first.message}</div>}
                </td>
                <td className="px-3 py-2.5 text-muted">{itemsSummary(o.items)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{brl(o.estimatedValue)}</td>
                <td className="px-3 py-2.5">{o.seller}</td>
                <td className="px-3 py-2.5">{stageLabel(o.stage)}</td>
                <td className="px-3 py-2.5">
                  {dateBR(o.lastContactAt)}
                  <div className="text-xs text-muted">{relativeDay(o.lastContactAt, today)}</div>
                </td>
                <td className="px-3 py-2.5">
                  {dateBR(o.eventDate)}
                  {o.eventDate && <div className="text-xs text-muted">{relativeDay(o.eventDate, today)}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
