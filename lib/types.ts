export type Tipo = 'CXC' | 'CXP';

/**
 * Grupo contable de la fila.
 *
 * `principal` es la cartera o la deuda de verdad; `anticipo` es la
 * contrapartida, que viene con signo contrario. Se separan porque netearlas
 * subestima: en la CxP de Mercamio al 31-ago-2026 son 6.171 millones menos,
 * un 26 % del total.
 */
export type Grupo = 'principal' | 'anticipo';

/** Una fila de detalle: un documento pendiente de un tercero. */
export interface Doc {
  cuenta: string;
  cuentaNombre: string;
  grupo: Grupo;
  nit: string;
  nombre: string;
  co: string;
  documento: string;
  fechaDcto: string | null; // ISO yyyy-mm-dd
  fechaVcto: string | null; // ISO yyyy-mm-dd
  dVenc: number;
  saldo: number;
  /** Tramos tal como vienen calculados en el Excel, en el orden de sus columnas. */
  tramosArchivo: number[];
}

/** Una linea del bloque de cuadre contable que el Excel trae arriba de la tabla. */
export interface LineaBalance {
  concepto: string;
  valor: number;
}

/** Tramo detectado en las cabeceras del Excel (p. ej. "31 a 90 dias"). */
export interface TramoArchivo {
  etiqueta: string;
  desde: number | null;
  hasta: number | null;
  col: number;
}

/** Los datos de una cartera (CxC o CxP) de una empresa a una fecha. */
export interface Cartera {
  tipo: Tipo;
  hoja: string;
  docs: Doc[];
  balance: LineaBalance[];
  totalBalance: number | null;
  difArchivo: number | null;
  controlTramos: number[] | null;
  controlTotal: number | null;
  tramosArchivo: TramoArchivo[];
}

/**
 * Un corte: la foto de una empresa a una fecha.
 *
 * La unidad de todo el tablero. El detalle y la antiguedad SIEMPRE se miran
 * sobre cortes de una misma fecha; mezclarlas duplicaria documentos. La
 * evolucion mensual es lo unico que cruza varios cortes.
 */
export interface Corte {
  /** Identificador estable: `empresaId|fecha`. */
  id: string;
  empresaId: string;
  empresaNombre: string;
  /** ISO yyyy-mm-dd. */
  fecha: string;
  /** `yyyy-mm`, derivado de la fecha. Es la llave de la serie mensual. */
  mes: string;
  archivo: string;
  carteras: Partial<Record<Tipo, Cartera>>;
}

export type NivelAviso = 'error' | 'aviso' | 'info';

export interface Aviso {
  nivel: NivelAviso;
  archivo?: string;
  hoja?: string;
  mensaje: string;
}

/** Resultado de leer uno o varios libros. */
export interface ResultadoLectura {
  cortes: Corte[];
  avisos: Aviso[];
}

/** Definicion de un tramo de antiguedad calculado por el tablero. */
export interface TramoDef {
  idx: number;
  key: string;
  desde: number | null;
  hasta: number | null;
  etiqueta: string;
  /** Rol de estado, para el distintivo de severidad. */
  estado: 'good' | 'warning' | 'serious' | 'critical' | 'critical-deep';
}

/**
 * Un punto de la serie mensual: lo unico que se guarda de forma permanente.
 *
 * Son cinco campos por empresa, mes y cartera. El detalle no cabe en el
 * navegador —tres empresas son unas 19.000 filas por corte— pero esto sí:
 * cinco años de tres empresas son 360 registros.
 */
export interface PuntoHistorial {
  mes: string; // yyyy-mm
  fecha: string; // ISO del corte exacto
  empresaId: string;
  empresaNombre: string;
  tipo: Tipo;
  principal: number;
  anticipo: number;
  documentos: number;
}

/**
 * Un documento ya situado en su empresa.
 *
 * El detalle puede mostrar varias empresas a la vez (consolidado), y entonces
 * hace falta saber de cual viene cada fila. `Doc` sale del parser por hoja y no
 * lo sabe; la empresa vive en el `Corte`. Al aplanar los cortes seleccionados
 * se marca cada fila.
 */
export interface DocVista extends Doc {
  empresaId: string;
  empresaNombre: string;
}
