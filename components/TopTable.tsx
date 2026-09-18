'use client';

import { useMemo } from 'react';
import type { Doc, Tipo, TramoDef } from '@/lib/types';
import { topTerceros, totalDe } from '@/lib/aggregate';
import { fmtMoney, fmtPct, type Escala } from '@/lib/format';
import Chip from './Chip';

/**
 * Concentración de la cartera: los diez terceros de mayor saldo.
 *
 * Respeta la selección del tablero: si se pulsó «181–360 días» en por pagar,
 * esta lista es la de ESE tramo, no la general. Un top que ignora el filtro
 * que acabas de poner es peor que no tenerlo.
 *
 * Pulsar un tercero lo agrega a la comparación (hasta el tope) y lo aplica al
 * resto del tablero.
 */
export default function TopTable({
  tipo,
  docs,
  tramos,
  escala,
  nitsActivos,
  onTercero,
}: {
  tipo: Tipo;
  docs: Doc[];
  tramos: TramoDef[];
  escala: Escala;
  nitsActivos: string[];
  onTercero: (tipo: Tipo, nit: string) => void;
}) {
  const { lista, total } = useMemo(
    () => ({ lista: topTerceros(docs, tramos, 10), total: totalDe(docs) }),
    [docs, tramos]
  );

  const esCxc = tipo === 'CXC';
  const acumulado = lista.reduce((a, g) => a + g.saldo, 0);

  return (
    <div className="card">
      <div className="chart-title">
        <span className="dot" style={{ background: esCxc ? 'var(--cxc)' : 'var(--cxp)' }} aria-hidden="true" />
        <h3>Top 10 {esCxc ? 'clientes' : 'proveedores'}</h3>
        {total !== 0 && (
          <span className="tot num muted" style={{ fontSize: 12.5 }}>
            {fmtPct((acumulado / total) * 100)} del total
          </span>
        )}
      </div>
      <div className="table-scroll top-scroll">
        <table>
          <thead>
            <tr>
              <th style={{ width: 26 }} />
              <th>{esCxc ? 'Cliente' : 'Proveedor'}</th>
              <th className="amt">Saldo</th>
              <th className="amt">%</th>
              <th>Peor tramo</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  Sin registros para este filtro
                </td>
              </tr>
            )}
            {lista.map((g, i) => {
              const activo = nitsActivos.includes(g.nit);
              return (
                <tr
                  key={g.key}
                  className={`fila-tercero${activo ? ' activo' : ''}`}
                  onClick={() => onTercero(tipo, g.nit)}
                  tabIndex={0}
                  aria-pressed={activo}
                  title={activo ? 'Quitar de la comparación' : 'Agregar a la comparación'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onTercero(tipo, g.nit);
                    }
                  }}
                >
                  <td className="rank num">{i + 1}</td>
                  <td>
                    <div className="name">{g.nombre}</div>
                    <div className="nit">NIT {g.nit || '—'}</div>
                  </td>
                  <td className="amt num">{fmtMoney(g.saldo, escala)}</td>
                  <td className="amt num muted">{total ? fmtPct((g.saldo / total) * 100) : '—'}</td>
                  <td>{g.peor ? <Chip tramo={g.peor} /> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
