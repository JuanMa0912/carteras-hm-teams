export type Tipo = 'CXC' | 'CXP';

/** Una fila de detalle: un documento pendiente de un tercero. */
export interface Doc {
  cuenta: string;
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

export interface Dataset {
  tipo: Tipo;
  hoja: string;
  empresa: string | null;
  fechaCorte: string | null; // ISO
  docs: Doc[];
  /** Cuentas del balance listadas en el encabezado del Excel. */
  balance: LineaBalance[];
  /** Valor de la fila "Total Saldo Balance", si existe. */
  totalBalance: number | null;
  /** Valor de la fila "Dif", si existe. */
  difArchivo: number | null;
  /** Totales por tramo de la fila de control (la que lleva "fecha corte"). */
  controlTramos: number[] | null;
  /** Total de la fila de control. */
  controlTotal: number | null;
  /** Tramos declarados por las cabeceras del archivo. */
  tramosArchivo: TramoArchivo[];
}

export type NivelAviso = 'error' | 'aviso' | 'info';

export interface Aviso {
  nivel: NivelAviso;
  hoja?: string;
  mensaje: string;
}

export interface ResultadoLectura {
  archivo: string;
  datasets: Partial<Record<Tipo, Dataset>>;
  avisos: Aviso[];
}

/** Definicion de un tramo de antiguedad calculado por el tablero. */
export interface TramoDef {
  idx: number;
  key: string;
  desde: number | null;
  hasta: number | null;
  etiqueta: string;
  /** Rol de estado, para el chip de severidad. */
  estado: 'good' | 'warning' | 'serious' | 'critical' | 'critical-deep';
}
