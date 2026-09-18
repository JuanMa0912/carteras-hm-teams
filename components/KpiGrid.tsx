'use client';

import { useMemo } from 'react';
import type { Doc, TramoDef } from '@/lib/types';
import { totalDe, totalesPorTramo, type ModoAnticipos } from '@/lib/aggregate';
import { fmtMoney, fmtNum, fmtPct, type Escala } from '@/lib/format';

/**
 * Cifras de cabecera. Son números sueltos, no gráficos: la pregunta que
 * responden es "¿cuánto?", y un número grande la responde mejor que una barra.
 *
 * La casilla de anticipos está a propósito: con el tablero en cartera bruta,
 * esa plata NO está sumada en las otras casillas, y no mostrarla en ninguna
 * parte hace que el total parezca no cuadrar contra el balance.
 */
export default function KpiGrid({
  docsCxc,
  docsCxp,
  anticiposCxc,
  anticiposCxp,
  modo,
  tramos,
  escala,
}: {
  docsCxc: Doc[];
  docsCxp: Doc[];
  anticiposCxc: number;
  anticiposCxp: number;
  modo: ModoAnticipos;
  tramos: TramoDef[];
  escala: Escala;
}) {
  const k = useMemo(() => {
    const totC = totalDe(docsCxc);
    const totP = totalDe(docsCxp);
    const tC = totalesPorTramo(docsCxc, tramos);
    const tP = totalesPorTramo(docsCxp, tramos);
    const critC = tC[3] + tC[4];
    const critP = tP[3] + tP[4];
    return {
      totC,
      totP,
      neto: totC - totP,
      critC,
      critP,
      pctC: totC ? (critC / totC) * 100 : 0,
      pctP: totP ? (critP / totP) * 100 : 0,
    };
  }, [docsCxc, docsCxp, tramos]);

  const umbral = (tramos[3].desde ?? 1) - 1;
  const etiquetaModo = modo === 'bruta' ? 'bruta' : 'neta';
  const anticipos = anticiposCxc + anticiposCxp;

  const tiles: { lbl: string; dot: string; val: string; sub: string; color?: string }[] = [
    {
      lbl: `Por cobrar (${etiquetaModo})`,
      dot: 'var(--cxc)',
      val: fmtMoney(k.totC, escala),
      sub: `${fmtNum(docsCxc.length)} documentos`,
    },
    {
      lbl: `Por pagar (${etiquetaModo})`,
      dot: 'var(--cxp)',
      val: fmtMoney(k.totP, escala),
      sub: `${fmtNum(docsCxp.length)} documentos`,
    },
    {
      lbl: 'Posición neta',
      dot: k.neto >= 0 ? 'var(--good)' : 'var(--critical)',
      val: fmtMoney(k.neto, escala),
      color: k.neto >= 0 ? 'var(--success-text)' : 'var(--danger-text)',
      sub: k.neto >= 0 ? 'a favor de la empresa' : 'se debe más de lo que hay por cobrar',
    },
    {
      lbl: `Por cobrar con más de ${umbral} días`,
      dot: 'var(--critical)',
      val: fmtMoney(k.critC, escala),
      sub: `${fmtPct(k.pctC)} del total por cobrar`,
    },
    {
      lbl: `Por pagar con más de ${umbral} días`,
      dot: 'var(--critical)',
      val: fmtMoney(k.critP, escala),
      sub: `${fmtPct(k.pctP)} del total por pagar`,
    },
    {
      lbl: 'Anticipos',
      dot: 'var(--ink-muted)',
      val: fmtMoney(anticipos, escala),
      sub:
        modo === 'bruta'
          ? 'fuera de las cifras de arriba'
          : 'ya descontados de las cifras de arriba',
    },
  ];

  return (
    <div className="kpi-grid">
      {tiles.map((t) => (
        <div className="kpi" key={t.lbl}>
          <div className="lbl">
            <span className="dot" style={{ background: t.dot }} aria-hidden="true" />
            {t.lbl}
          </div>
          <div>
            <div className="val num" style={t.color ? { color: t.color } : undefined}>
              {t.val}
            </div>
            <div className="sub">{t.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
