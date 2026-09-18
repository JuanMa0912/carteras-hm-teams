import * as XLSX from 'xlsx';
import { identificarEmpresa } from './empresa';
import { norm } from './format';
import type {
  Aviso, Cartera, Corte, Doc, Grupo, LineaBalance, ResultadoLectura, Tipo, TramoArchivo,
} from './types';

/* ------------------------------------------------------------------
 * ESTANDAR DE INGESTA
 *
 * Una hoja se procesa si tiene una fila de cabecera con, al menos, una
 * columna de NOMBRE DEL TERCERO y una de SALDO. Todo lo demas se completa
 * o se deduce.
 *
 * Ninguna hoja se descarta en silencio: cada rechazo, deduccion o dato que
 * falta produce un aviso legible.
 * ------------------------------------------------------------------ */

type Campo =
  | 'cuenta' | 'nit' | 'nombre' | 'co' | 'documento'
  | 'fechaDcto' | 'fechaVcto' | 'dVenc' | 'saldo' | 'total';

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
    if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6);
  }
  return null;
}

/**
 * Texto a numero.
 *
 * El ERP puede exportar «1.234.567,89» o «1,234,567.89» segun la maquina donde
 * se genere. Se decide por cual separador va de ultimo.
 */
function num(v: unknown): number {
  if (esNumero(v)) return v;
  if (typeof v !== 'string') return 0;
  const s = v.trim();
  if (s === '') return 0;
  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  const limpio = ultimaComa > ultimoPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number.parseFloat(limpio.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function diasEntre(isoA: string, isoB: string): number {
  return Math.round((Date.parse(isoA + 'T00:00:00Z') - Date.parse(isoB + 'T00:00:00Z')) / 86400000);
}

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

/**
 * El PUC decide el grupo.
 *
 * En cartera por cobrar lo principal esta en el activo (cuentas 1x) y el
 * anticipo en el pasivo (28x). En cartera por pagar es al reves: lo principal
 * esta en el pasivo (2x) y los anticipos a proveedores en el activo (133x).
 */
function grupoDe(tipo: Tipo, cuenta: string): Grupo {
  const principal = tipo === 'CXC' ? '1' : '2';
  return cuenta.startsWith(principal) ? 'principal' : 'anticipo';
}

/** `CXP` / `CXC` a partir del nombre de la hoja. */
function tipoDeHoja(nombre: string): Tipo | null {
  const n = norm(nombre);
  if (/\bcxp\b|pagar|proveedor/.test(n)) return 'CXP';
  if (/\bcxc\b|cobrar|cliente/.test(n)) return 'CXC';
  return null;
}

interface HojaLeida {
  cartera: Cartera;
  fechaCorte: string | null;
  empresaTexto: string | null;
}

function leerHoja(archivo: string, hoja: string, filas: unknown[][], avisos: Aviso[]): HojaLeida | null {
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
      nivel: 'info',
      archivo,
      hoja,
      mensaje: 'No tiene fila de cabecera de cartera; se omitió (suele ser una hoja auxiliar del ERP).',
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
      archivo,
      hoja,
      mensaje:
        'Falta la columna de ' + faltan + '. Columnas reconocidas: ' + halladas + '. ' +
        'Cabeceras sin reconocer: ' + (noReconocidas.slice(0, 8).join(' | ') || '—') + '. ' +
        'Renombra la columna a uno de los nombres aceptados (ver docs/ESTANDAR-ARCHIVO.md).',
    });
    return null;
  }

  /* --- 3. fecha de corte --- */
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

  /* --- 4. empresa: SIEMPRE de la primera columna, nunca del vecino de
   *        «fecha corte» (ahí el ERP escribe «Merkmios» en todos los
   *        informes, sean de la empresa que sean). --- */
  let empresaTexto: string | null = null;
  for (let r = 0; r < headerIdx && !empresaTexto; r++) {
    const v = (filas[r] ?? [])[0];
    if (v != null && String(v).trim() !== '') empresaTexto = String(v).trim();
  }

  /* --- 5. bloque de cuadre contable --- */
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
      break;
    }
  }

  /* --- 6. fila de control de tramos --- */
  let controlTramos: number[] | null = null;
  let controlTotal: number | null = null;
  if (corteRowIdx >= 0 && tramosArchivo.length) {
    const fila = filas[corteRowIdx] ?? [];
    const vals = tramosArchivo.map((t) => (esNumero(fila[t.col]) ? (fila[t.col] as number) : NaN));
    if (vals.every((v) => Number.isFinite(v))) controlTramos = vals;
    if (col.saldo != null && esNumero(fila[col.saldo])) controlTotal = fila[col.saldo] as number;
  }

  /* --- 7. tipo de cartera --- */
  let tipo = tipoDeHoja(hoja);
  if (!tipo) {
    // Respaldo por PUC, ponderado por saldo.
    let activo = 0;
    let pasivo = 0;
    for (let r = headerIdx + 1; r < filas.length; r++) {
      const cru = String((filas[r] ?? [])[col.cuenta ?? -1] ?? '').trim();
      const cta = cru.split(/\s+/)[0];
      const s = Math.abs(num((filas[r] ?? [])[col.saldo]));
      if (cta.startsWith('1')) activo += s;
      else if (cta.startsWith('2')) pasivo += s;
    }
    tipo = pasivo > activo ? 'CXP' : 'CXC';
    avisos.push({
      nivel: 'aviso',
      archivo,
      hoja,
      mensaje: `El nombre de la hoja no dice si es por cobrar o por pagar; se clasificó como ${
        tipo === 'CXC' ? 'por cobrar' : 'por pagar'
      } según las cuentas del PUC. Verifícalo.`,
    });
  }

  /* --- 8. filas de detalle --- */
  const docs: Doc[] = [];
  let sinDVenc = 0;
  let sinCuenta = 0;
  for (let r = headerIdx + 1; r < filas.length; r++) {
    const fila = filas[r];
    if (!fila) continue;
    const nombre = fila[col.nombre];
    if (nombre == null || String(nombre).trim() === '') continue;

    /* La celda trae «13300500 A PROVEEDORES»: el codigo es el primer token. */
    const cuentaCruda = col.cuenta != null ? String(fila[col.cuenta] ?? '').trim() : '';
    const cuenta = cuentaCruda.split(/\s+/)[0];
    if (col.cuenta != null && !/^\d{4,}$/.test(cuenta)) {
      sinCuenta++;
      continue;
    }

    const saldo = num(fila[col.saldo]);
    if (saldo === 0) continue;

    const fechaVcto = col.fechaVcto != null ? aIso(fila[col.fechaVcto]) : null;
    let dVenc: number;
    if (col.dVenc != null && esNumero(fila[col.dVenc])) {
      dVenc = Math.round(fila[col.dVenc] as number);
    } else if (fechaVcto && fechaCorte) {
      dVenc = diasEntre(fechaCorte, fechaVcto);
      sinDVenc++;
    } else {
      dVenc = 0;
      sinDVenc++;
    }

    docs.push({
      cuenta,
      cuentaNombre: cuentaCruda.slice(cuenta.length).trim(),
      grupo: grupoDe(tipo, cuenta),
      /* Sin ceros a la izquierda: si un informe los trae, el mismo tercero se
       * partiria en dos entradas. */
      nit: col.nit != null && fila[col.nit] != null ? String(fila[col.nit]).trim().replace(/^0+(?=.)/, '') : '',
      nombre: String(nombre).trim(),
      co: col.co != null && fila[col.co] != null ? String(fila[col.co]).trim() : '',
      documento: col.documento != null && fila[col.documento] != null ? String(fila[col.documento]).trim() : '',
      fechaDcto: col.fechaDcto != null ? aIso(fila[col.fechaDcto]) : null,
      fechaVcto,
      dVenc,
      saldo,
      tramosArchivo: tramosArchivo.map((t) => num(fila[t.col])),
    });
  }

  if (!docs.length) {
    avisos.push({ nivel: 'aviso', archivo, hoja, mensaje: 'La cabecera se reconoció pero no hay filas con saldo debajo.' });
    return null;
  }
  if (sinDVenc) {
    avisos.push({
      nivel: 'info',
      archivo,
      hoja,
      mensaje: `${sinDVenc} de ${docs.length} documentos no traían días vencidos; se calcularon contra la fecha de corte.`,
    });
  }
  if (sinCuenta) {
    avisos.push({
      nivel: 'info',
      archivo,
      hoja,
      mensaje: `${sinCuenta} filas se omitieron por no tener un código de cuenta contable válido (suelen ser subtotales).`,
    });
  }
  if (!fechaCorte) {
    avisos.push({
      nivel: 'error',
      archivo,
      hoja,
      mensaje: 'No se encontró la fecha de corte (se busca la etiqueta «fecha corte» en la cabecera). Sin ella el corte no se puede ubicar en el tiempo y la hoja se omitió.',
    });
    return null;
  }

  return {
    cartera: { tipo, hoja, docs, balance, totalBalance, difArchivo, controlTramos, controlTotal, tramosArchivo },
    fechaCorte,
    empresaTexto,
  };
}

/** Lee un libro y devuelve los cortes que contiene (normalmente uno). */
function leerLibro(buffer: ArrayBuffer, archivo: string, avisos: Aviso[]): Corte[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  const porCorte = new Map<string, Corte>();

  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], {
      header: 1, raw: true, defval: null, blankrows: true,
    });
    const leida = leerHoja(archivo, hoja, filas, avisos);
    if (!leida) continue;

    const empresa = identificarEmpresa(leida.empresaTexto);
    if (!empresa) {
      avisos.push({
        nivel: 'error',
        archivo,
        hoja,
        mensaje: 'No se pudo identificar la empresa: la primera columna de la cabecera está vacía. La hoja se omitió.',
      });
      continue;
    }

    const id = empresa.id + '|' + leida.fechaCorte;
    let corte = porCorte.get(id);
    if (!corte) {
      corte = {
        id,
        empresaId: empresa.id,
        empresaNombre: empresa.nombre,
        fecha: leida.fechaCorte!,
        mes: leida.fechaCorte!.slice(0, 7),
        archivo,
        carteras: {},
      };
      porCorte.set(id, corte);
    }

    const previa = corte.carteras[leida.cartera.tipo];
    if (previa) {
      previa.docs = previa.docs.concat(leida.cartera.docs);
      avisos.push({
        nivel: 'info',
        archivo,
        hoja,
        mensaje: `Sus documentos se sumaron a los de la hoja «${previa.hoja}» (misma cartera y mismo corte).`,
      });
    } else {
      corte.carteras[leida.cartera.tipo] = leida.cartera;
    }
  }

  return Array.from(porCorte.values());
}

export interface EntradaLibro {
  nombre: string;
  buffer: ArrayBuffer;
}

/**
 * Lee varios libros de una sola vez.
 *
 * Se pueden soltar tantos archivos como se quiera: varias empresas del mismo
 * mes, varios meses de la misma empresa, o las dos cosas. Cada combinación
 * (empresa, fecha de corte) queda como un corte independiente.
 *
 * Un corte que ya estaba se REEMPLAZA por el del archivo nuevo. Es lo que se
 * espera al volver a subir un informe corregido, y evita que dos versiones del
 * mismo mes se sumen.
 *
 * Toma buffers y no `File` para que el verificador de línea de comandos use
 * exactamente este código y no una copia que se desactualice.
 */
export function leerBuffers(entradas: EntradaLibro[]): ResultadoLectura {
  const avisos: Aviso[] = [];
  const porId = new Map<string, Corte>();

  for (const { nombre, buffer } of entradas) {
    try {
      const cortes = leerLibro(buffer, nombre, avisos);
      if (!cortes.length) {
        avisos.push({ nivel: 'aviso', archivo: nombre, mensaje: 'No se reconoció ninguna hoja de cartera en este archivo.' });
      }
      for (const c of cortes) {
        if (porId.has(c.id)) {
          avisos.push({
            nivel: 'aviso',
            archivo: nombre,
            mensaje: `El corte de ${c.empresaNombre} al ${c.fecha} ya venía en otro archivo de esta carga; se conservó el último leído.`,
          });
        }
        porId.set(c.id, c);
      }
    } catch (e) {
      avisos.push({
        nivel: 'error',
        archivo: nombre,
        mensaje: 'No se pudo abrir el archivo: ' + (e instanceof Error ? e.message : String(e)),
      });
    }
  }

  const cortes = Array.from(porId.values()).sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.empresaNombre.localeCompare(b.empresaNombre, 'es')
  );

  if (!cortes.length) {
    avisos.push({
      nivel: 'error',
      mensaje:
        'Ningún archivo cumple el estándar mínimo: una fila de cabecera con nombre del tercero y saldo, ' +
        'y la etiqueta «fecha corte» en el encabezado. Revisa docs/ESTANDAR-ARCHIVO.md.',
    });
  }

  return { cortes, avisos };
}

/** Envoltorio para el navegador: convierte los `File` en buffers y delega. */
export async function leerArchivos(archivos: File[]): Promise<ResultadoLectura> {
  const entradas: EntradaLibro[] = [];
  const fallos: Aviso[] = [];
  for (const f of archivos) {
    try {
      entradas.push({ nombre: f.name, buffer: await f.arrayBuffer() });
    } catch (e) {
      fallos.push({
        nivel: 'error',
        archivo: f.name,
        mensaje: 'No se pudo leer el archivo del disco: ' + (e instanceof Error ? e.message : String(e)),
      });
    }
  }
  const r = leerBuffers(entradas);
  return { cortes: r.cortes, avisos: [...fallos, ...r.avisos] };
}
