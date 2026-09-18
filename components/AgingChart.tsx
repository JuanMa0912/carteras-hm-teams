'use client';

import { useMemo, useState } from 'react';
import type { Doc, Tipo, TramoDef } from '@/lib/types';
import { conteoPorTramo, totalDe, totalesPorTramo } from '@/lib/aggregate';
import { fmtMoney, fmtNum, fmtPct, type Escala } from '@/lib/format';

/**
 * Antigüedad de saldos por tramo. Es un CONTROL, no solo un dibujo.
 *
 * Pulsar un tramo lo selecciona en TODO el tablero —detalle, mayores saldos y
 * evolución— y volver a pulsarlo lo suelta. El filtro lleva la cartera
 * consigo: elegir «181–360» en la de pagar no puede dejar el detalle mostrando
 * la de cobrar.
 *
 * Forma: barras horizontales — magnitud entre pocas categorías ordenadas, con
 * etiquetas largas. Color: rampa ordinal de un solo tono (azul para CxC,
 * naranja para CxP), donde el contraste contra el fondo crece con la mora. Los
 * saldos a favor se dibujan con textura diagonal porque su longitud representa
 * magnitud, no deuda.
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
  /** Tramo seleccionado en el tablero, si la selección es de ESTA cartera. */
  tramoActivo: string | null;
  onTramo: (tipo: Tipo, key: string) => void;
}

export default function AgingChart({ tipo, docs, tramos, escala, tramoActivo, onTramo }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);

  const { valores, conteos, total, max } = useMemo(() => {
    const v = totalesPorTramo(docs, tramos);
    return {
      valores: v,
      conteos: conteoPorTramo(docs, tramos),
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
      <div className="bars">
        {tramos.map((t, i) => {
          const v = valores[i];
          const neg = v < -0.5;
          const pct = Math.max(Math.abs(v) > 0.5 ? 1.5 : 0, (Math.abs(v) / max) * 100);
          const color = rampa[i];
          const activo = tramoActivo === t.key;
          return (
            <button
              type="button"
              key={t.key}
              className={`bar-row${activo ? ' activo' : ''}`}
              aria-pressed={activo}
              title={activo ? 'Quitar este filtro' : 'Filtrar el tablero por este tramo'}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => onTramo(tipo, t.key)}
            >
              <span className="bar-lbl">{t.etiqueta}</span>
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={{
                    width: pct + '%',
                    background: neg
                      ? `repeating-linear-gradient(135deg, ${color} 0 4px, transparent 4px 8px)`
                      : color,
                    border: neg ? `1px solid ${color}` : undefined,
                  }}
                />
              </span>
              <span className="bar-val num">{fmtMoney(v, escala)}</span>
              {hover === i && (
                <span className="tip" role="status">
                  <span className="tip-l">
                    <strong>{t.etiqueta}</strong>
                  </span>
                  <span className="tip-l">
                    <span className="tip-k">Saldo </span>
                    {fmtMoney(v, escala)}
                  </span>
                  <span className="tip-l">
                    <span className="tip-k">Participación </span>
                    {total ? fmtPct((v / total) * 100) : '—'}
                  </span>
                  <span className="tip-l">
                    <span className="tip-k">Documentos </span>
                    {fmtNum(conteos[i])}
                  </span>
                  {neg && <span className="tip-l tip-k">Saldo a favor (anticipo o nota crédito)</span>}
                  <span className="tip-l tip-k">{activo ? 'Clic para quitar el filtro' : 'Clic para filtrar el tablero'}</span>
                </span>
              )}
            </button>
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
