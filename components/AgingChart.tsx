'use client';

import { useMemo, useState } from 'react';
import type { Doc, Tipo, TramoDef } from '@/lib/types';
import { conteoPorTramo, totalDe, totalesPorTramo } from '@/lib/aggregate';
import { fmtMoney, fmtNum, fmtPct, type Escala } from '@/lib/format';

/**
 * Antigüedad de saldos por tramo.
 *
 * Forma: barras horizontales — la comparación es de magnitud entre pocas
 * categorías ordenadas, con etiquetas largas. Color: rampa ordinal de un solo
 * tono (azul para CxC, naranja para CxP), clara → oscura conforme aumenta la
 * mora. Los saldos negativos (anticipos, notas crédito) se dibujan con textura
 * diagonal porque su longitud representa magnitud, no deuda.
 */

const RAMPA: Record<Tipo, string[]> = {
  CXC: ['var(--cxc-1)', 'var(--cxc-2)', 'var(--cxc-3)', 'var(--cxc-4)', 'var(--cxc-5)'],
  CXP: ['var(--cxp-1)', 'var(--cxp-2)', 'var(--cxp-3)', 'var(--cxp-4)', 'var(--cxp-5)'],
};

interface Props {
  tipo: Tipo;
  docs: Doc[];
  tramos: TramoDef[];
  escala: Escala;
}

export default function AgingChart({ tipo, docs, tramos, escala }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);

  const { valores, conteos, total, max } = useMemo(() => {
    const v = totalesPorTramo(docs, tramos);
    const c = conteoPorTramo(docs, tramos);
    return {
      valores: v,
      conteos: c,
      total: totalDe(docs),
      max: Math.max(1, ...v.map((x) => Math.abs(x))),
    };
  }, [docs, tramos]);

  const rampa = RAMPA[tipo];
  const hayNegativos = valores.some((v) => v < -0.5);

  if (!docs.length) {
    return <div className="bar-empty">Sin documentos para este filtro.</div>;
  }

  if (tabla) {
    return (
      <>
        <table>
          <thead>
            <tr>
              <th>Tramo</th>
              <th className="amt">Saldo</th>
              <th className="amt">% del total</th>
              <th className="amt">Docs.</th>
            </tr>
          </thead>
          <tbody>
            {tramos.map((t, i) => (
              <tr key={t.key}>
                <td>{t.etiqueta}</td>
                <td className="amt num">{fmtMoney(valores[i], escala)}</td>
                <td className="amt num muted">{total ? fmtPct((valores[i] / total) * 100) : '—'}</td>
                <td className="amt num muted">{fmtNum(conteos[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn small" style={{ marginTop: 14 }} onClick={() => setTabla(false)}>
          Ver como gráfico
        </button>
      </>
    );
  }

  return (
    <>
      <div className="bars" role="img" aria-label={`Antigüedad de saldos por tramo. ${tramos
        .map((t, i) => `${t.etiqueta}: ${fmtMoney(valores[i], escala)}`)
        .join('. ')}`}>
        {tramos.map((t, i) => {
          const v = valores[i];
          const neg = v < -0.5;
          const pct = Math.max(Math.abs(v) > 0.5 ? 1.5 : 0, (Math.abs(v) / max) * 100);
          const color = rampa[i];
          return (
            <div
              key={t.key}
              className="bar-row"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
            >
              <div className="bar-lbl">{t.etiqueta}</div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: pct + '%',
                    background: neg
                      ? `repeating-linear-gradient(135deg, ${color} 0 4px, transparent 4px 8px)`
                      : color,
                    border: neg ? `1px solid ${color}` : undefined,
                  }}
                />
              </div>
              <div className="bar-val num">{fmtMoney(v, escala)}</div>
              {hover === i && (
                <div className="tip" role="status">
                  <div>
                    <strong>{t.etiqueta}</strong>
                  </div>
                  <div>
                    <span className="tip-k">Saldo </span>
                    {fmtMoney(v, escala)}
                  </div>
                  <div>
                    <span className="tip-k">Participación </span>
                    {total ? fmtPct((v / total) * 100) : '—'}
                  </div>
                  <div>
                    <span className="tip-k">Documentos </span>
                    {fmtNum(conteos[i])}
                  </div>
                  {neg && <div className="tip-k">Saldo a favor (anticipo o nota crédito)</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: rampa[0] }} />
          Reciente
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: rampa[4] }} />
          Mayor mora
        </span>
        {hayNegativos && (
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{
                background: `repeating-linear-gradient(135deg, ${rampa[2]} 0 4px, transparent 4px 8px)`,
                border: `1px solid ${rampa[2]}`,
              }}
            />
            Saldo a favor
          </span>
        )}
        <button type="button" className="btn-reset" onClick={() => setTabla(true)} style={{ marginLeft: 'auto' }}>
          Ver como tabla
        </button>
      </div>
    </>
  );
}
