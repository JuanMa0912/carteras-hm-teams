'use client';

import type { Cuadre } from '@/lib/aggregate';
import type { Cartera } from '@/lib/types';
import { fmtMoney, type Escala } from '@/lib/format';

/**
 * Cuadre contable.
 *
 * El reporte de SIESA trae, encima de la tabla, las cuentas del balance, un
 * "Total Saldo Balance" y una fila "Dif". Este panel las muestra y, además,
 * contrasta ese total contra lo que realmente suma el detalle cargado — que es
 * la verificación que un contador hace antes de creerle a cualquier tablero.
 */

const VEREDICTO = {
  ok: { txt: 'Cuadra', icono: '✓' },
  leve: { txt: 'Diferencia menor', icono: '!' },
  grave: { txt: 'Descuadre', icono: '✕' },
  'sin-datos': { txt: 'Sin control en el archivo', icono: '–' },
} as const;

export default function CuadrePanel({
  ds,
  cuadre,
  escala,
  titulo,
}: {
  ds: Cartera;
  cuadre: Cuadre;
  escala: Escala;
  titulo: string;
}) {
  const v = VEREDICTO[cuadre.estado];
  const esCxc = ds.tipo === 'CXC';

  return (
    <div className="card">
      <div className="cuadre-head">
        <span className="dot" style={{ background: esCxc ? 'var(--cxc)' : 'var(--cxp)' }} />
        <h3>{titulo}</h3>
        <span className={`verdict ${cuadre.estado}`}>
          <span aria-hidden="true">{v.icono}</span>
          {v.txt}
        </span>
      </div>

      {ds.balance.length > 0 && (
        <>
          <div className="section-label" style={{ marginBottom: 6 }}>
            Cuentas del balance
          </div>
          {ds.balance.map((l, i) => (
            <div className="cuadre-line" key={i}>
              <span className="concepto">{l.concepto}</span>
              <span className="num">{fmtMoney(l.valor, escala)}</span>
            </div>
          ))}
        </>
      )}

      <div className="cuadre-line strong">
        <span>Total saldo balance</span>
        <span className="num">{fmtMoney(cuadre.totalBalance, escala)}</span>
      </div>
      <div className="cuadre-line">
        <span className="concepto">Suma del detalle cargado</span>
        <span className="num">{fmtMoney(cuadre.sumaDetalle, escala)}</span>
      </div>
      <div className="cuadre-line strong">
        <span>Diferencia</span>
        <span
          className="num"
          style={{
            color:
              cuadre.estado === 'ok'
                ? 'var(--success-text)'
                : cuadre.estado === 'grave'
                  ? 'var(--danger-text)'
                  : 'var(--warning-text)',
          }}
        >
          {cuadre.diferencia == null ? '—' : fmtMoney(cuadre.diferencia, escala)}
        </span>
      </div>

      {cuadre.difArchivo != null && (
        <div className="cuadre-line">
          <span className="concepto">Fila «Dif» del archivo</span>
          <span className="num muted">{fmtMoney(cuadre.difArchivo, escala)}</span>
        </div>
      )}

      {cuadre.tramos && (
        <div style={{ marginTop: 18 }}>
          <div className="section-label" style={{ marginBottom: 6 }}>
            Tramos del archivo vs. detalle{' '}
            {cuadre.tramosCuadran ? (
              <span style={{ color: 'var(--success-text)' }}>· cuadran</span>
            ) : (
              <span style={{ color: 'var(--danger-text)' }}>· revisar</span>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tramo</th>
                  <th className="amt">Encabezado</th>
                  <th className="amt">Detalle</th>
                  <th className="amt">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {cuadre.tramos.map((t) => (
                  <tr key={t.etiqueta}>
                    <td>{t.etiqueta}</td>
                    <td className="amt num muted">{fmtMoney(t.archivo, escala)}</td>
                    <td className="amt num">{fmtMoney(t.calculado, escala)}</td>
                    <td
                      className="amt num"
                      style={{ color: Math.abs(t.dif) <= 1 ? 'var(--ink-muted)' : 'var(--danger-text)' }}
                    >
                      {fmtMoney(t.dif, escala)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
