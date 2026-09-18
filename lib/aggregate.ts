import type { Cartera, Corte, Doc, Grupo, PuntoHistorial, Tipo, TramoDef } from './types';

export const UMBRALES_POR_DEFECTO = [30, 90, 180, 360] as const;

const ESTADOS: TramoDef['estado'][] = ['good', 'warning', 'serious', 'critical', 'critical-deep'];

/** Construye los cinco tramos de antiguedad a partir de cuatro umbrales. */
export function tramosDe(umbrales: readonly number[]): TramoDef[] {
  const t = umbrales;
  return [
    { idx: 0, key: 't1', desde: null,   hasta: t[0],  etiqueta: '1–' + t[0] + ' días',           estado: ESTADOS[0] },
    { idx: 1, key: 't2', desde: t[0]+1, hasta: t[1],  etiqueta: (t[0]+1) + '–' + t[1] + ' días', estado: ESTADOS[1] },
    { idx: 2, key: 't3', desde: t[1]+1, hasta: t[2],  etiqueta: (t[1]+1) + '–' + t[2] + ' días', estado: ESTADOS[2] },
    { idx: 3, key: 't4', desde: t[2]+1, hasta: t[3],  etiqueta: (t[2]+1) + '–' + t[3] + ' días', estado: ESTADOS[3] },
    { idx: 4, key: 't5', desde: t[3]+1, hasta: null,  etiqueta: 'Más de ' + t[3] + ' días',      estado: ESTADOS[4] },
  ];
}

/**
 * Corrige umbrales invalidos manteniendolos estrictamente crecientes.
 *
 * Empuja el valor en vez de rechazar la entrada entera: es el comportamiento
 * menos molesto mientras alguien teclea en el campo.
 */
export function sanearUmbrales(umbrales: readonly number[]): number[] {
  const base = [...UMBRALES_POR_DEFECTO];
  const out: number[] = [];
  for (let i = 0; i < base.length; i++) {
    const n = Math.round(Number(umbrales[i])) || base[i];
    const piso = i === 0 ? 1 : out[i - 1] + 1;
    out.push(Math.max(piso, n));
  }
  return out;
}

/**
 * Tramo al que cae un documento.
 *
 * Un documento que aun no vence trae dias negativos y cae en el primer tramo:
 * «1–30 días» en realidad significa «hasta 30 días», corrientes incluidos.
 */
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

export function totalDeGrupo(docs: Doc[], grupo: Grupo): number {
  return docs.reduce((a, d) => (d.grupo === grupo ? a + (d.saldo || 0) : a), 0);
}

/**
 * Filtra por grupo contable segun el modo de anticipos.
 *
 * `bruta` (por defecto, como en el visor) deja solo la cartera de verdad.
 * `neta` incluye los anticipos, que vienen con signo contrario y rebajan el
 * total.
 */
export type ModoAnticipos = 'bruta' | 'neta';

export function aplicarAnticipos(docs: Doc[], modo: ModoAnticipos): Doc[] {
  return modo === 'neta' ? docs : docs.filter((d) => d.grupo === 'principal');
}

export function totalesPorTramo(docs: Doc[], tramos: TramoDef[]): number[] {
  const out = tramos.map(() => 0);
  for (const d of docs) out[tramoDe(d, tramos).idx] += d.saldo || 0;
  return out;
}

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
  peor: TramoDef | null;
}

/**
 * Agrupa documentos por tercero.
 *
 * La llave es el NIT, no el nombre: en el consolidado de varias empresas el
 * mismo proveedor puede venir escrito distinto en cada una y se partiria en
 * dos entradas.
 */
export function agruparPorTercero(docs: Doc[], tramos: TramoDef[]): Tercero[] {
  const mapa = new Map<string, Tercero>();
  for (const d of docs) {
    const key = d.nit || d.nombre;
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
 * ------------------------------------------------------------------ */

export type EstadoCuadre = 'ok' | 'leve' | 'grave' | 'sin-datos';

export interface Cuadre {
  sumaDetalle: number;
  totalBalance: number | null;
  diferencia: number | null;
  difArchivo: number | null;
  estado: EstadoCuadre;
  tramos: { etiqueta: string; archivo: number; calculado: number; dif: number }[] | null;
  tramosCuadran: boolean | null;
}

const TOLERANCIA_OK = 1;
const TOLERANCIA_LEVE = 1000;

/**
 * Cuadre de una cartera contra el balance.
 *
 * Se calcula SIEMPRE sobre el total neto de la hoja —todas las cuentas, con su
 * signo—, porque eso es lo que el informe declara en «Total Saldo Balance». No
 * depende del modo de anticipos que tenga puesto la pantalla: si dependiera,
 * el cuadre diria «descuadre» cada vez que alguien mira la cartera bruta.
 */
export function calcularCuadre(c: Cartera): Cuadre {
  const sumaDetalle = totalDe(c.docs);
  const diferencia = c.totalBalance != null ? sumaDetalle - c.totalBalance : null;

  let estado: EstadoCuadre = 'sin-datos';
  if (diferencia != null) {
    const abs = Math.abs(diferencia);
    estado = abs <= TOLERANCIA_OK ? 'ok' : abs <= TOLERANCIA_LEVE ? 'leve' : 'grave';
  }

  let tramos: Cuadre['tramos'] = null;
  let tramosCuadran: boolean | null = null;
  if (c.controlTramos && c.tramosArchivo.length === c.controlTramos.length) {
    const calculado = c.tramosArchivo.map((_, i) => c.docs.reduce((a, d) => a + (d.tramosArchivo[i] || 0), 0));
    tramos = c.tramosArchivo.map((t, i) => ({
      etiqueta: t.etiqueta,
      archivo: c.controlTramos![i],
      calculado: calculado[i],
      dif: calculado[i] - c.controlTramos![i],
    }));
    tramosCuadran = tramos.every((t) => Math.abs(t.dif) <= TOLERANCIA_OK);
  }

  return { sumaDetalle, totalBalance: c.totalBalance, diferencia, difArchivo: c.difArchivo, estado, tramos, tramosCuadran };
}

/* ------------------------------------------------------------------
 * SERIE MENSUAL
 * ------------------------------------------------------------------ */

/**
 * Resumen permanente de un corte.
 *
 * Es lo unico que sobrevive al cierre del navegador. Guarda los agregados, no
 * el detalle: tres empresas son unas 19.000 filas por corte y eso no cabe en
 * el almacenamiento local, pero cinco años de agregados son 360 registros.
 */
export function resumirCorte(corte: Corte): PuntoHistorial[] {
  const out: PuntoHistorial[] = [];
  for (const tipo of ['CXC', 'CXP'] as Tipo[]) {
    const c = corte.carteras[tipo];
    if (!c) continue;
    out.push({
      mes: corte.mes,
      fecha: corte.fecha,
      empresaId: corte.empresaId,
      empresaNombre: corte.empresaNombre,
      tipo,
      principal: totalDeGrupo(c.docs, 'principal'),
      anticipo: totalDeGrupo(c.docs, 'anticipo'),
      documentos: c.docs.length,
    });
  }
  return out;
}

export interface PuntoSerie {
  mes: string;
  principal: number;
  anticipo: number;
  /** Empresas que aportaron dato ese mes, para avisar de meses incompletos. */
  empresas: number;
}

/**
 * Serie mensual de una cartera, sumando las empresas pedidas.
 *
 * OJO con los meses incompletos: si un mes solo trae el informe de una empresa
 * y los demas traen tres, la columna baja sin que nadie haya pagado nada. Por
 * eso se devuelve cuantas empresas aportaron cada mes y la gráfica lo marca.
 */
export function serieMensual(
  historial: PuntoHistorial[],
  tipo: Tipo,
  empresaIds: string[]
): PuntoSerie[] {
  const porMes = new Map<string, PuntoSerie>();
  const empresasPorMes = new Map<string, Set<string>>();

  for (const p of historial) {
    if (p.tipo !== tipo) continue;
    if (empresaIds.length && !empresaIds.includes(p.empresaId)) continue;
    let s = porMes.get(p.mes);
    if (!s) {
      s = { mes: p.mes, principal: 0, anticipo: 0, empresas: 0 };
      porMes.set(p.mes, s);
      empresasPorMes.set(p.mes, new Set());
    }
    s.principal += p.principal;
    s.anticipo += p.anticipo;
    empresasPorMes.get(p.mes)!.add(p.empresaId);
  }

  for (const [mes, set] of empresasPorMes) porMes.get(mes)!.empresas = set.size;

  return Array.from(porMes.values()).sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Exporta documentos a CSV (separador ';', compatible con Excel en es-CO). */
export function aCsv(docs: Doc[], tramos: TramoDef[]): string {
  const sep = ';';
  const cab = ['Cuenta', 'Nombre cuenta', 'Grupo', 'NIT', 'Tercero', 'C.O', 'Documento',
               'Fecha dcto', 'Fecha vcto', 'Días vencidos', 'Tramo', 'Saldo'];
  const esc = (v: string) => (/[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const lineas = [cab.join(sep)];
  for (const d of docs) {
    lineas.push([
      esc(d.cuenta), esc(d.cuentaNombre), d.grupo, esc(d.nit), esc(d.nombre), esc(d.co), esc(d.documento),
      d.fechaDcto ?? '', d.fechaVcto ?? '',
      String(Math.round(d.dVenc)),
      esc(tramoDe(d, tramos).etiqueta),
      String(d.saldo).replace('.', ','),
    ].join(sep));
  }
  return '﻿' + lineas.join('\r\n');
}
