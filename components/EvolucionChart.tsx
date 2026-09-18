'use client';

import { useId, useState } from 'react';
import { escalaDeEje } from '@/lib/escala';
import type { PuntoSerie } from '@/lib/aggregate';
import type { ModoAnticipos } from '@/lib/aggregate';

/**
 * Columnas de evolución mensual. Portada del visor de productividad.
 *
 * SVG y no divs: hace falta un eje con rejilla a escala y etiquetas alineadas
 * al valor, y eso con flexbox se pelea en cada resolución.
 *
 * Reglas que quedan fijadas aquí:
 * - columna de 24px como máximo, remate superior redondeado 4px y base recta;
 * - rejilla y ejes en 1px SÓLIDO (nunca punteado) y en un gris recesivo;
 * - 2px de aire entre columnas contiguas;
 * - el TEXTO no lleva nunca el color de la serie: valores, meses y ejes van en
 *   tinta, y el color solo lo carga la barra.
 *
 * DIFERENCIA CON EL VISOR, y es la que importa: allá la serie sale de la tabla
 * de saldos mensuales del ERP y está completa por construcción. Aquí sale de
 * los informes que alguien haya subido, así que un mes puede venir con menos
 * empresas que el anterior. Esa columna se marca: sin la marca, la gráfica
 * mostraría una caída donde en realidad falta un archivo.
 */

type Props = {
  titulo: string;
  serie: PuntoSerie[];
  /** Color de la serie. Solo lo llevan las barras. */
  color: string;
  modo: ModoAnticipos;
  /** Cuántas empresas debería traer un mes completo. */
  empresasEsperadas: number;
};

const W = 900;
const H = 300;
const M = { top: 22, right: 8, bottom: 62, left: 74 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const COL_MAX = 24;
const GAP = 2;

/** Cifras en millones: 11.821.043.390 -> "11.821". */
const enMillones = (v: number): string => Math.round(v / 1_000_000).toLocaleString('es-CO');

const pesosCompletos = (v: number): string => `$ ${Math.round(v).toLocaleString('es-CO')}`;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const mesCorto = (mes: string): string => {
  const [a, m] = mes.split('-');
  return `${MESES[Number(m) - 1]} ${a.slice(2)}`;
};

export default function EvolucionChart({ titulo, serie, color, modo, empresasEsperadas }: Props) {
  const idBase = useId();
  const [activo, setActivo] = useState<number | null>(null);

  if (serie.length === 0) {
    return (
      <figure className="grafica">
        <figcaption className="grafica-cab">
          <span className="dot" style={{ background: color }} aria-hidden="true" />
          <h3>{titulo}</h3>
        </figcaption>
        <p className="grafica-vacia">Sin cortes cargados para esta cartera.</p>
      </figure>
    );
  }

  const valor = (p: PuntoSerie) => (modo === 'neta' ? p.principal + p.anticipo : p.principal);
  const valores = serie.map(valor);

  /* La escala va contra el mayor valor ABSOLUTO y con el cero dentro del
   * rango: la cartera neta puede quedar negativa un mes y una escala que solo
   * mire hacia arriba la aplastaría contra el piso. */
  const maxAbs = Math.max(...valores.map(Math.abs), 1);
  const hayNegativos = valores.some((v) => v < 0);
  const { techo, paso } = escalaDeEje(maxAbs);
  const piso = hayNegativos ? -techo : 0;
  const escalaY = (v: number) => M.top + PLOT_H - ((v - piso) / (techo - piso)) * PLOT_H;
  const yCero = escalaY(0);

  const banda = PLOT_W / Math.max(1, serie.length);
  const ancho = Math.min(COL_MAX, Math.max(3, banda - GAP));

  const marcas: number[] = [];
  for (let v = piso; v <= techo + paso / 2; v += paso) marcas.push(Math.round(v));

  const unSoloMes = serie.length === 1;

  return (
    <figure className="grafica">
      <figcaption className="grafica-cab">
        <span className="dot" style={{ background: color }} aria-hidden="true" />
        <h3>{titulo}</h3>
        <span className="grafica-unidad">millones de pesos</span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="grafica-svg"
        role="img"
        aria-label={`${titulo}, saldo al cierre de cada mes. ${serie
          .map((p) => `${mesCorto(p.mes)}: ${pesosCompletos(valor(p))}`)
          .join('. ')}`}
      >
        {marcas.map((m) => (
          <g key={m}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={escalaY(m)}
              y2={escalaY(m)}
              className={m === 0 ? 'eje-cero' : 'eje-rejilla'}
            />
            <text x={M.left - 10} y={escalaY(m) + 4} className="eje-marca" textAnchor="end">
              {enMillones(m)}
            </text>
          </g>
        ))}

        {serie.map((p, i) => {
          const v = valor(p);
          const x = M.left + i * banda + (banda - ancho) / 2;
          const yVal = escalaY(v);
          const y = Math.min(yVal, yCero);
          const alto = Math.max(2, Math.abs(yCero - yVal));
          const ultimo = i === serie.length - 1;
          const previo = i > 0 ? valor(serie[i - 1]) : null;
          const pct =
            previo !== null && Math.abs(previo) > 0.5 ? ((v - previo) / Math.abs(previo)) * 100 : null;
          const incompleto = p.empresas < empresasEsperadas;
          const opacidad = activo === null || activo === i ? (v < 0 ? 0.5 : 1) : 0.4;

          return (
            <g key={p.mes} onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)}>
              {/* blanco de clic más grande que la barra */}
              <rect x={M.left + i * banda} y={M.top} width={banda} height={PLOT_H} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={ancho}
                height={alto}
                rx={4}
                fill={
                  incompleto
                    ? `url(#${idBase}-rayado)`
                    : color
                }
                stroke={incompleto ? color : undefined}
                strokeWidth={incompleto ? 1 : undefined}
                opacity={opacidad}
              />
              {/* La base va recta: se tapa el redondeo del lado del cero. */}
              <rect
                x={x}
                y={v >= 0 ? yCero - 4 : yCero}
                width={ancho}
                height={4}
                fill={incompleto ? `url(#${idBase}-rayado)` : color}
                opacity={opacidad}
              />

              {/*
                La guía dice "nunca una etiqueta en cada punto". Aquí se rompe
                a propósito, por pedido de gerencia; se compensa con cifras en
                millones y en tinta apagada para que no compitan con las barras.
              */}
              <text
                x={x + ancho / 2}
                y={v >= 0 ? y - 7 : y + alto + 15}
                className={`grafica-valor${ultimo ? ' fuerte' : ''}`}
                textAnchor="middle"
              >
                {enMillones(v)}
              </text>

              <text
                x={M.left + i * banda + banda / 2}
                y={H - M.bottom + 20}
                className={`grafica-mes${ultimo ? ' fuerte' : ''}`}
                textAnchor="middle"
              >
                {mesCorto(p.mes)}
              </text>

              {/*
                Variación contra el mes anterior. Va en tinta apagada con una
                flecha y NO en verde/rojo: que la cartera suba no es bueno ni
                malo por sí mismo —en CxC puede ser más venta y en CxP más
                plazo— y pintarlo de color sería opinar, no informar.
              */}
              <text
                x={M.left + i * banda + banda / 2}
                y={H - M.bottom + 38}
                className="grafica-delta"
                textAnchor="middle"
              >
                {pct === null ? '—' : `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`}
              </text>
            </g>
          );
        })}

        <defs>
          <pattern id={`${idBase}-rayado`} width="6" height="6" patternTransform="rotate(135)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--surface)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="3" />
          </pattern>
        </defs>

        <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + PLOT_H} className="eje-rejilla" />
      </svg>

      {activo !== null ? (
        <div className="grafica-tip" id={`${idBase}-tip`} role="status">
          <strong>{mesCorto(serie[activo].mes)}</strong> {pesosCompletos(valor(serie[activo]))}
          {activo > 0 && Math.abs(valor(serie[activo - 1])) > 0.5 ? (
            <>
              {' · '}
              {pesosCompletos(valor(serie[activo]) - valor(serie[activo - 1]))} vs{' '}
              {mesCorto(serie[activo - 1].mes)}
            </>
          ) : null}
          {serie[activo].empresas < empresasEsperadas ? (
            <div className="grafica-tip-aviso">
              Solo {serie[activo].empresas} de {empresasEsperadas} empresas tienen informe de este mes.
            </div>
          ) : null}
        </div>
      ) : null}

      {unSoloMes ? (
        <p className="grafica-nota">
          Un solo corte cargado. La evolución se va armando a medida que subes los informes de otros meses.
        </p>
      ) : null}
    </figure>
  );
}
