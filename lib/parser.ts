import * as XLSX from 'xlsx';
import { norm } from './format';
import type { Aviso, Dataset, Doc, LineaBalance, ResultadoLectura, Tipo, TramoArchivo } from './types';

/* ------------------------------------------------------------------
 * ESTANDAR DE INGESTA
 *
 * Una hoja se considera valida si tiene una fila de cabecera que
 * contenga, como minimo, una columna de NOMBRE DEL TERCERO y una de
 * SALDO. Todo lo demas es opcional y se completa o se deduce.
 *
 * A diferencia de la version anterior, ninguna hoja se descarta en
 * silencio: cada rechazo produce un aviso legible que explica que
 * columnas se encontraron y cual falto.
 * ------------------------------------------------------------------ */

type Campo =
  | 'cuenta' | 'nit' | 'nombre' | 'co' | 'documento'
  | 'fechaDcto' | 'fechaVcto' | 'dVenc' | 'saldo' | 'total';

/** Sinonimos aceptados por columna. Se comparan normalizados. */
const SINONIMOS: Record<Campo, string[]> = {
  cuenta:    ['cuenta_contable', 'cuenta contable', 'cuenta', 'codigo cuenta', 'cta'],
  nit:       ['nit', 'nit/cc', 'identificacion', 'documento identidad', 'cedula', 'id tercero'],
  nombre:    ['proveedor', 'cliente', 'tercero', 'razon social', 'nombre', 'nombre tercero', 'descripcion', 'beneficiario'],
  co:        ['c.o', 'co', 'centro operacion', 'centro de operacion', 'centro operativo', 'sucursal'],
  documento: ['documento', 'doc', 'nro documento', 'numero documento', 'no documento', 'factura'],
  fechaDcto: ['fecha_dcto', 'fecha dcto', 'fecha documento', 'fecha_documento', 'fecha emision'],
  fechaVcto: ['fecha_vcto', 'fecha vcto', 'fecha vencimiento', 'fecha_vencimiento', 'vencimiento'],
  dVenc:     ['d_venc', 'dias vencidos', 'dias_venc', 'dias de vencimiento', 'dias vencimiento', 'dias', 'edad'],
  saldo:     ['saldo', 'saldo cartera', 'saldo_total', 'saldo total', 'valor', 'valor saldo'],
  total:     ['total'],
};

const CAMPOS = Object.keys(SINONIMOS) as Campo[];

/** Reconoce cabeceras de tramo: "Hasta 1 a 30 dias", "31 a 90 dias", "Mas de 360 dias". */
function leerTramoCabecera(raw: unknown, col: number): TramoArchivo | null {
  const n = norm(raw);
  if (!n) return null;
  let m = n.match(/(\d+)\s*a\s*(\d+)\s*dias?/);
  if (m) return { etiqueta: String(raw).trim(), desde: Number(m[1]), hasta: Number(m[2]), col };
  m = n.match(/mas de\s*(\d+)\s*dias?/);
  if (m) return { etiqueta: String(raw).trim(), desde: Number(m[1]) + 1, hasta: null, col };
  m = n.match(/hasta\s*(\d+)\s*dias?/);
  if (m) return { etiqueta: String(raw).trim(), desde: null, hasta: Number(m[1]), col };
  return null;
}

function esNumero(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function aIso(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  return null;
}

function num(v: unknown): number {
  if (esNumero(v)) return v;
  if (typeof v === 'string') {
    const limpio = v.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number(limpio);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function diasEntre(isoA: string, isoB: string): number {
  const a = Date.parse(isoA + 'T00:00:00Z');
  const b = Date.parse(isoB + 'T00:00:00Z');
  return Math.round((a - b) / 86400000);
}

/** Puntua una fila como candidata a cabecera: cuantas columnas conocidas trae. */
function puntuarCabecera(fila: unknown[]): number {
  let score = 0;
  for (let c = 0; c < fila.length; c++) {
    const n = norm(fila[c]);
    if (!n) continue;
    if (CAMPOS.some((campo) => SINONIMOS[campo].includes(n))) score += 1;
    else if (leerTramoCabecera(fila[c], c)) score += 1;
  }
  return score;
}

/** Deduce si la hoja es cartera por cobrar o por pagar. */
function deducirTipo(hoja: string, docs: Doc[]): { tipo: Tipo; motivo: string } {
  const n = norm(hoja);
  if (/\bcxp\b|pagar|proveedor/.test(n)) return { tipo: 'CXP', motivo: 'el nombre de la hoja ("' + hoja + '")' };
  if (/\bcxc\b|cobrar|cliente/.test(n)) return { tipo: 'CXC', motivo: 'el nombre de la hoja ("' + hoja + '")' };

  // Por PUC: 1 = activo (por cobrar), 2 = pasivo (por pagar). Gana la mayoria ponderada por saldo.
  let activo = 0;
  let pasivo = 0;
  for (const d of docs) {
    const primer = d.cuenta.trim()[0];
    if (primer === '1') activo += Math.abs(d.saldo);
    else if (primer === '2') pasivo += Math.abs(d.saldo);
  }
  if (activo > 0 || pasivo > 0) {
    return pasivo > activo
      ? { tipo: 'CXP', motivo: 'que la mayoria del saldo esta en cuentas del pasivo (PUC 2x)' }
      : { tipo: 'CXC', motivo: 'que la mayoria del saldo esta en cuentas del activo (PUC 1x)' };
  }

  const suma = docs.reduce((a, d) => a + d.saldo, 0);
  return suma < 0
    ? { tipo: 'CXP', motivo: 'que el saldo total de la hoja es negativo' }
    : { tipo: 'CXC', motivo: 'que el saldo total de la hoja es positivo' };
}

function leerHoja(hoja: string, filas: unknown[][], avisos: Aviso[]): Dataset | null {
  /* --- 1. localizar la fila de cabecera --- */
  let headerIdx = -1;
  let mejor = 0;
  const limite = Math.min(filas.length, 60);
  for (let i = 0; i < limite; i++) {
    const s = puntuarCabecera(filas[i] ?? []);
    if (s > mejor) {
      mejor = s;
      headerIdx = i;
    }
  }
  if (headerIdx < 0 || mejor < 3) {
    avisos.push({
      nivel: 'aviso',
      hoja,
      mensaje: 'No se encontro una fila de cabecera reconocible en las primeras ' + limite + ' filas. La hoja se omitio.',
    });
    return null;
  }

  /* --- 2. mapear columnas --- */
  const cabecera = filas[headerIdx] ?? [];
  const col: Partial<Record<Campo, number>> = {};
  const tramosArchivo: TramoArchivo[] = [];
  const noReconocidas: string[] = [];

  cabecera.forEach((h, c) => {
    const n = norm(h);
    if (!n) return;
    const campo = CAMPOS.find((k) => SINONIMOS[k].includes(n));
    if (campo) {
      if (col[campo] == null) col[campo] = c;
      return;
    }
    const tramo = leerTramoCabecera(h, c);
    if (tramo) {
      tramosArchivo.push(tramo);
      return;
    }
    noReconocidas.push(String(h).trim());
  });

  if (col.nombre == null || col.saldo == null) {
    const faltan = [col.nombre == null ? 'nombre del tercero' : null, col.saldo == null ? 'saldo' : null]
      .filter(Boolean)
      .join(' y ');
    const halladas = CAMPOS.filter((k) => col[k] != null).join(', ') || 'ninguna';
    avisos.push({
      nivel: 'error',
      hoja,
      mensaje:
        'Falta la columna de ' + faltan + '. Columnas reconocidas: ' + halladas + '. ' +
        'Cabeceras sin reconocer: ' + (noReconocidas.slice(0, 8).join(' | ') || '—') + '. ' +
        'Renombra la columna a uno de los nombres aceptados (ver docs/ESTANDAR-ARCHIVO.md).',
    });
    return null;
  }
  if (noReconocidas.length) {
    avisos.push({
      nivel: 'info',
      hoja,
      mensaje: 'Columnas ignoradas por no estar en el estandar: ' + noReconocidas.slice(0, 8).join(', ') + '.',
    });
  }

  /* --- 3. fecha de corte (arriba de la cabecera) --- */
  let fechaCorte: string | null = null;
  let corteRowIdx = -1;
  for (let r = 0; r < headerIdx; r++) {
    const fila = filas[r] ?? [];
    for (let c = 0; c < fila.length; c++) {
      if (norm(fila[c]).includes('fecha corte')) {
        corteRowIdx = r;
        for (let c2 = c + 1; c2 < fila.length; c2++) {
          const iso = aIso(fila[c2]);
          if (iso) {
            fechaCorte = iso;
            break;
          }
        }
        break;
      }
    }
    if (corteRowIdx >= 0) break;
  }

  /* --- 4. bloque de cuadre contable --- */
  const balance: LineaBalance[] = [];
  let totalBalance: number | null = null;
  let difArchivo: number | null = null;

  for (let r = 0; r < headerIdx; r++) {
    if (r === corteRowIdx) continue;
    const fila = filas[r] ?? [];
    for (let c = 0; c < fila.length - 1; c++) {
      const etiqueta = fila[c];
      const valor = fila[c + 1];
      if (etiqueta == null || String(etiqueta).trim() === '') continue;
      if (!esNumero(valor)) continue;
      const concepto = String(etiqueta).trim();
      const n = norm(concepto);
      if (n.includes('total saldo balance')) totalBalance = valor;
      else if (n === 'dif' || n === 'diferencia') difArchivo = valor;
      else balance.push({ concepto, valor });
      break; // solo el primer par (etiqueta, numero) de cada fila
    }
  }

  /* --- 5. fila de control de tramos (la misma que lleva "fecha corte") --- */
  let controlTramos: number[] | null = null;
  let controlTotal: number | null = null;
  if (corteRowIdx >= 0 && tramosArchivo.length) {
    const fila = filas[corteRowIdx] ?? [];
    const vals = tramosArchivo.map((t) => (esNumero(fila[t.col]) ? (fila[t.col] as number) : NaN));
    if (vals.every((v) => Number.isFinite(v))) controlTramos = vals;
    if (col.saldo != null && esNumero(fila[col.saldo])) controlTotal = fila[col.saldo] as number;
  }

  /* --- 6. empresa --- */
  let empresa: string | null = null;
  for (let r = 0; r < headerIdx && !empresa; r++) {
    const v = (filas[r] ?? [])[0];
    if (v != null && String(v).trim() !== '') empresa = String(v).trim();
  }

  /* --- 7. filas de detalle --- */
  const docs: Doc[] = [];
  let sinFecha = 0;
  let sinDVenc = 0;
  for (let r = headerIdx + 1; r < filas.length; r++) {
    const fila = filas[r];
    if (!fila) continue;
    const nombre = fila[col.nombre];
    if (nombre == null || String(nombre).trim() === '') continue;

    const fechaVcto = col.fechaVcto != null ? aIso(fila[col.fechaVcto]) : null;
    let dVenc: number;
    if (col.dVenc != null && esNumero(fila[col.dVenc])) {
      dVenc = fila[col.dVenc] as number;
    } else if (fechaVcto && fechaCorte) {
      dVenc = diasEntre(fechaCorte, fechaVcto); // respaldo: se calcula contra el corte
      sinDVenc++;
    } else {
      dVenc = 0;
      sinDVenc++;
    }
    if (!fechaVcto) sinFecha++;

    docs.push({
      cuenta: col.cuenta != null ? String(fila[col.cuenta] ?? '').trim() : '',
      nit: col.nit != null && fila[col.nit] != null ? String(fila[col.nit]).trim() : '',
      nombre: String(nombre).trim(),
      co: col.co != null && fila[col.co] != null ? String(fila[col.co]).trim() : '',
      documento: col.documento != null && fila[col.documento] != null ? String(fila[col.documento]).trim() : '',
      fechaDcto: col.fechaDcto != null ? aIso(fila[col.fechaDcto]) : null,
      fechaVcto,
      dVenc,
      saldo: num(fila[col.saldo]),
      tramosArchivo: tramosArchivo.map((t) => num(fila[t.col])),
    });
  }

  if (!docs.length) {
    avisos.push({ nivel: 'aviso', hoja, mensaje: 'La cabecera se reconocio pero no hay filas de detalle debajo.' });
    return null;
  }
  if (sinDVenc) {
    avisos.push({
      nivel: 'info',
      hoja,
      mensaje: sinDVenc + ' de ' + docs.length + ' documentos no traian dias vencidos; se calcularon contra la fecha de corte.',
    });
  }
  if (sinFecha) {
    avisos.push({ nivel: 'info', hoja, mensaje: sinFecha + ' documentos sin fecha de vencimiento legible.' });
  }
  if (!fechaCorte) {
    avisos.push({
      nivel: 'aviso',
      hoja,
      mensaje: 'No se encontro la fecha de corte en el encabezado. Los tramos se calculan solo con los dias vencidos del archivo.',
    });
  }

  const { tipo, motivo } = deducirTipo(hoja, docs);
  avisos.push({
    nivel: 'info',
    hoja,
    mensaje: 'Clasificada como ' + (tipo === 'CXC' ? 'cartera por cobrar' : 'cartera por pagar') + ' segun ' + motivo + '.',
  });

  return {
    tipo, hoja, empresa, fechaCorte, docs,
    balance, totalBalance, difArchivo,
    controlTramos, controlTotal, tramosArchivo,
  };
}

/** Lee un libro de Excel completo y devuelve los datasets reconocidos + avisos. */
export function leerLibro(buffer: ArrayBuffer, nombreArchivo: string): ResultadoLectura {
  const avisos: Aviso[] = [];
  const datasets: Partial<Record<Tipo, Dataset>> = {};

  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });

  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], {
      header: 1, raw: true, defval: null, blankrows: true,
    });
    const ds = leerHoja(hoja, filas, avisos);
    if (!ds) continue;

    const previo = datasets[ds.tipo];
    if (previo) {
      // Dos hojas del mismo tipo: se acumulan los documentos.
      previo.docs = previo.docs.concat(ds.docs);
      previo.empresa = previo.empresa ?? ds.empresa;
      previo.fechaCorte = previo.fechaCorte ?? ds.fechaCorte;
      avisos.push({ nivel: 'info', hoja, mensaje: 'Sus documentos se sumaron a los de la hoja "' + previo.hoja + '".' });
    } else {
      datasets[ds.tipo] = ds;
    }
  }

  if (!datasets.CXC && !datasets.CXP) {
    avisos.push({
      nivel: 'error',
      mensaje:
        'Ninguna hoja del archivo cumple el estandar minimo (una columna de nombre del tercero y una de saldo). ' +
        'Revisa docs/ESTANDAR-ARCHIVO.md.',
    });
  }

  return { archivo: nombreArchivo, datasets, avisos };
}
