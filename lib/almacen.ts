import { resumirCorte } from './aggregate';
import type { Corte, PuntoHistorial } from './types';

/**
 * Persistencia en el navegador.
 *
 * DOS COSAS CON VIDAS DISTINTAS, y esa es toda la idea:
 *
 * - El **historial** (agregados por mes, empresa y cartera) se guarda siempre
 *   y para siempre. Es lo que alimenta la gráfica de evolución y va creciendo
 *   a medida que se suben informes. Pesa unos 200 bytes por registro: cinco
 *   años de tres empresas caben de sobra.
 *
 * - El **detalle** de los cortes se guarda si cabe, y si no, no. Tres empresas
 *   son unas 19.000 filas por corte; con varios cortes el almacenamiento local
 *   (unos 5 MB) se llena. Cuando no cabe se conserva solo el historial y el
 *   usuario vuelve a soltar el archivo: no se pierde la gráfica, que es lo que
 *   costó meses de acumular.
 *
 * Todo lo que toca `localStorage` va en try/catch: en ventana privada o con el
 * almacenamiento bloqueado, leer o escribir lanza excepción.
 */

const CLAVE_HISTORIAL = 'cartera-hm:historial:v2';
const CLAVE_CORTES = 'cartera-hm:cortes:v2';

/** Cuántos cortes se intentan conservar con detalle. Los más recientes. */
const CORTES_CON_DETALLE = 6;

export interface EstadoGuardado {
  historial: PuntoHistorial[];
  cortes: Corte[];
  /** `true` si el detalle no cupo y solo se conservó el historial. */
  detalleDescartado: boolean;
}

/* ---------------- historial ---------------- */

/**
 * Funde puntos nuevos en el historial.
 *
 * La llave es (empresa, mes, cartera). Un corte nuevo del mismo mes REEMPLAZA
 * al anterior: es lo que se espera al volver a subir un informe corregido. Si
 * se acumularan, un mes recargado dos veces valdría el doble.
 */
export function fundirHistorial(
  previo: readonly PuntoHistorial[],
  nuevos: readonly PuntoHistorial[]
): PuntoHistorial[] {
  const mapa = new Map<string, PuntoHistorial>();
  const llave = (p: PuntoHistorial) => `${p.empresaId}|${p.mes}|${p.tipo}`;
  for (const p of previo) mapa.set(llave(p), p);
  for (const p of nuevos) mapa.set(llave(p), p);
  return Array.from(mapa.values()).sort(
    (a, b) => a.mes.localeCompare(b.mes) || a.empresaNombre.localeCompare(b.empresaNombre, 'es')
  );
}

export function historialDeCortes(cortes: readonly Corte[]): PuntoHistorial[] {
  return cortes.flatMap(resumirCorte);
}

/* ---------------- lectura y escritura ---------------- */

export function cargar(): EstadoGuardado {
  const vacio: EstadoGuardado = { historial: [], cortes: [], detalleDescartado: false };
  try {
    const h = localStorage.getItem(CLAVE_HISTORIAL);
    const c = localStorage.getItem(CLAVE_CORTES);
    return {
      historial: h ? (JSON.parse(h) as PuntoHistorial[]) : [],
      cortes: c ? (JSON.parse(c) as Corte[]) : [],
      detalleDescartado: false,
    };
  } catch {
    /* Dato corrupto o almacenamiento bloqueado: se arranca en blanco. */
    return vacio;
  }
}

/**
 * Guarda historial y detalle. Devuelve `true` si el detalle no cupo.
 *
 * El historial se escribe PRIMERO y por separado: si el detalle desborda la
 * cuota, la gráfica de evolución sobrevive igual.
 */
export function guardar(historial: readonly PuntoHistorial[], cortes: readonly Corte[]): boolean {
  try {
    localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(historial));
  } catch {
    /* Sin historial persistido la gráfica solo vale para esta sesión. */
  }

  const recientes = [...cortes]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, CORTES_CON_DETALLE);

  try {
    localStorage.setItem(CLAVE_CORTES, JSON.stringify(recientes));
    return false;
  } catch {
    /* No cupo: se deja solo el corte más reciente; si tampoco, ninguno. */
    try {
      localStorage.setItem(CLAVE_CORTES, JSON.stringify(recientes.slice(0, 1)));
      return recientes.length > 1;
    } catch {
      try {
        localStorage.removeItem(CLAVE_CORTES);
      } catch {
        /* nada más que hacer */
      }
      return true;
    }
  }
}

export function limpiar(): void {
  try {
    localStorage.removeItem(CLAVE_HISTORIAL);
    localStorage.removeItem(CLAVE_CORTES);
  } catch {
    /* nada que limpiar */
  }
}

/* ---------------- traspaso entre equipos ---------------- */

interface ArchivoHistorial {
  formato: 'cartera-hm-historial';
  version: 2;
  generado: string;
  historial: PuntoHistorial[];
}

/**
 * Historial a archivo.
 *
 * El historial vive en el navegador de cada quien, así que sin esto no hay
 * forma de que el contador vea en su equipo la serie que se armó en otro.
 * Solo lleva agregados: ni un NIT ni un documento.
 */
export function exportarHistorial(historial: readonly PuntoHistorial[]): string {
  const doc: ArchivoHistorial = {
    formato: 'cartera-hm-historial',
    version: 2,
    generado: new Date().toISOString(),
    historial: [...historial],
  };
  return JSON.stringify(doc, null, 2);
}

export class HistorialInvalidoError extends Error {}

export function importarHistorial(texto: string): PuntoHistorial[] {
  let doc: unknown;
  try {
    doc = JSON.parse(texto);
  } catch {
    throw new HistorialInvalidoError('El archivo no es un JSON válido.');
  }
  const d = doc as Partial<ArchivoHistorial>;
  if (d?.formato !== 'cartera-hm-historial' || !Array.isArray(d.historial)) {
    throw new HistorialInvalidoError('El archivo no es un historial de cartera exportado desde este tablero.');
  }
  const out: PuntoHistorial[] = [];
  for (const p of d.historial) {
    if (
      typeof p?.mes !== 'string' ||
      !/^\d{4}-\d{2}$/.test(p.mes) ||
      typeof p?.empresaId !== 'string' ||
      (p?.tipo !== 'CXC' && p?.tipo !== 'CXP') ||
      typeof p?.principal !== 'number' ||
      typeof p?.anticipo !== 'number'
    ) {
      throw new HistorialInvalidoError('El archivo tiene registros con un formato que no se reconoce.');
    }
    out.push({
      mes: p.mes,
      fecha: typeof p.fecha === 'string' ? p.fecha : p.mes + '-01',
      empresaId: p.empresaId,
      empresaNombre: typeof p.empresaNombre === 'string' ? p.empresaNombre : p.empresaId,
      tipo: p.tipo,
      principal: p.principal,
      anticipo: p.anticipo,
      documentos: typeof p.documentos === 'number' ? p.documentos : 0,
    });
  }
  return out;
}
