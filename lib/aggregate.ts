import type { Dataset, Doc, TramoDef } from './types';

export const UMBRALES_POR_DEFECTO = [30, 90, 180, 360] as const;

const ESTADOS: TramoDef['estado'][] = ['good', 'warning', 'serious', 'critical', 'critical-deep'];

/** Construye los cinco tramos de antiguedad a partir de cuatro umbrales. */
export function tramosDe(umbrales: number[]): TramoDef[] {
  const t = umbrales;
  return [
    { idx: 0, key: 'b1', desde: null,   hasta: t[0],  etiqueta: '1–' + t[0] + ' días',           estado: ESTADOS[0] },
    { idx: 1, key: 'b2', desde: t[0]+1, hasta: t[1],  etiqueta: (t[0]+1) + '–' + t[1] + ' días', estado: ESTADOS[1] },
    { idx: 2, key: 'b3', desde: t[1]+1, hasta: t[2],  etiqueta: (t[1]+1) + '–' + t[2] + ' días', estado: ESTADOS[2] },
    { idx: 3, key: 'b4', desde: t[2]+1, hasta: t[3],  etiqueta: (t[2]+1) + '–' + t[3] + ' días', estado: ESTADOS[3] },
    { idx: 4, key: 'b5', desde: t[3]+1, hasta: null,  etiqueta: 'Más de ' + t[3] + ' días',      estado: ESTADOS[4] },
  ];
}

/** Corrige umbrales invalidos manteniendolos estrictamente crecientes. */
export function sanearUmbrales(umbrales: number[]): number[] {
  const out = umbrales.map((v) => Math.max(1, Math.round(v) || 1));
  for (let i = 1; i < out.length; i++) {
    if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1;
  }
  return out;
}

/** Tramo al que pertenece un documento segun sus dias vencidos. */
export function tramoDe(doc: Doc, tramos: TramoDef[]): TramoDef {
  const d = doc.dVenc || 0;
  for (const t of tramos) {
    const loOk = t.desde == null || d >= t.desde;
    const hiOk = t.hasta == null || d <= t.hasta;
    if (loOk && hiOk) return t;
  }
  return tramos[tramos.length - 1];
}

export function totalDe(docs: Doc[]): number {
  return docs.reduce((a, d) => a + (d.saldo || 0), 0);
}

/** Suma por tramo. Devuelve un arreglo paralelo a `tramos`. */
export function totalesPorTramo(docs: Doc[], tramos: TramoDef[]): number[] {
  const out = tramos.map(() => 0);
  for (const d of docs) out[tramoDe(d, tramos).idx] += d.saldo || 0;
  return out;
}

/** Conteo de documentos por tramo. */
export function conteoPorTramo(docs: Doc[], tramos: TramoDef[]): number[] {
  const out = tramos.map(() => 0);
  for (const d of docs) out[tramoDe(d, tramos).idx] += 1;
  return out;
}

export interface Tercero {
  key: string;
  nit: string;
  nombre: string;
  saldo: number;
  docs: Doc[];
  porTramo: number[];
  /** Tramo mas grave con saldo distinto de cero. */
  peor: TramoDef | null;
}

/** Agrupa documentos por tercero (NIT + nombre). */
export function agruparPorTercero(docs: Doc[], tramos: TramoDef[]): Tercero[] {
  const mapa = new Map<string, Tercero>();
  for (const d of docs) {
    const key = d.nit + '|' + d.nombre;
    let g = mapa.get(key);
    if (!g) {
      g = { key, nit: d.nit, nombre: d.nombre, saldo: 0, docs: [], porTramo: tramos.map(() => 0), peor: null };
      mapa.set(key, g);
    }
    g.saldo += d.saldo || 0;
    g.docs.push(d);
    g.porTramo[tramoDe(d, tramos).idx] += d.saldo || 0;
  }
  const lista = Array.from(mapa.values());
  for (const g of lista) g.peor = peorTramo(g.porTramo, tramos);
  return lista;
}

export function peorTramo(porTramo: number[], tramos: TramoDef[]): TramoDef | null {
  for (let i = tramos.length - 1; i >= 0; i--) {
    if (Math.abs(porTramo[i] || 0) > 0.5) return tramos[i];
  }
  return null;
}

export function topTerceros(docs: Doc[], tramos: TramoDef[], n: number): Tercero[] {
  return agruparPorTercero(docs, tramos)
    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))
    .slice(0, n);
}

/* ------------------------------------------------------------------
 * CUADRE CONTABLE
 * El Excel de SIESA trae, arriba de la tabla, las cuentas del balance,
 * un "Total Saldo Balance" y una fila "Dif". El tablero las lee y las
 * contrasta contra lo que realmente suma el detalle.
 * ------------------------------------------------------------------ */

export type EstadoCuadre = 'ok' | 'leve' | 'grave' | 'sin-datos';

export interface Cuadre {
  /** Suma de la columna Saldo en el detalle. */
  sumaDetalle: number;
  /** "Total Saldo Balance" declarado en el archivo. */
  totalBalance: number | null;
  /** Diferencia calculada por el tablero: detalle − balance. */
  diferencia: number | null;
  /** Valor de la fila "Dif" del propio archivo. */
  difArchivo: number | null;
  estado: EstadoCuadre;
  /** Totales por tramo del archivo vs. los recalculados por el tablero. */
  tramos: { etiqueta: string; archivo: number; calculado: number; dif: number }[] | null;
  tramosCuadran: boolean | null;
}

const TOLERANCIA_OK = 1;       // hasta $1 se considera redondeo
const TOLERANCIA_LEVE = 1000;  // hasta $1.000 es un aviso, no un error

export function calcularCuadre(ds: Dataset): Cuadre {
  const sumaDetalle = totalDe(ds.docs);
  const diferencia = ds.totalBalance != null ? sumaDetalle - ds.totalBalance : null;

  let estado: EstadoCuadre = 'sin-datos';
  if (diferencia != null) {
    const abs = Math.abs(diferencia);
    estado = abs <= TOLERANCIA_OK ? 'ok' : abs <= TOLERANCIA_LEVE ? 'leve' : 'grave';
  }

  // Tramos: se comparan los del archivo contra la suma de sus propias columnas.
  let tramos: Cuadre['tramos'] = null;
  let tramosCuadran: boolean | null = null;
  if (ds.controlTramos && ds.tramosArchivo.length === ds.controlTramos.length) {
    const calculado = ds.tramosArchivo.map((_, i) =>
      ds.docs.reduce((a, d) => a + (d.tramosArchivo[i] || 0), 0)
    );
    tramos = ds.tramosArchivo.map((t, i) => ({
      etiqueta: t.etiqueta,
      archivo: ds.controlTramos![i],
      calculado: calculado[i],
      dif: calculado[i] - ds.controlTramos![i],
    }));
    tramosCuadran = tramos.every((t) => Math.abs(t.dif) <= TOLERANCIA_OK);
  }

  return {
    sumaDetalle,
    totalBalance: ds.totalBalance,
    diferencia,
    difArchivo: ds.difArchivo,
    estado,
    tramos,
    tramosCuadran,
  };
}

/** Exporta documentos a CSV (separador ';', compatible con Excel en es-CO). */
export function aCsv(docs: Doc[], tramos: TramoDef[]): string {
  const sep = ';';
  const cab = ['Cuenta', 'NIT', 'Tercero', 'C.O', 'Documento', 'Fecha dcto', 'Fecha vcto', 'Días vencidos', 'Tramo', 'Saldo'];
  const esc = (v: string) => (/[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const lineas = [cab.join(sep)];
  for (const d of docs) {
    lineas.push([
      esc(d.cuenta), esc(d.nit), esc(d.nombre), esc(d.co), esc(d.documento),
      d.fechaDcto ?? '', d.fechaVcto ?? '',
      String(Math.round(d.dVenc)),
      esc(tramoDe(d, tramos).etiqueta),
      String(d.saldo).replace('.', ','),
    ].join(sep));
  }
  return '﻿' + lineas.join('\r\n');
}
