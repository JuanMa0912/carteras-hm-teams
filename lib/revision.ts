import { totalDeGrupo } from './aggregate';
import type { Corte, NivelAviso, PuntoHistorial, Tipo } from './types';

/**
 * Revisión de lo que está a punto de entrar.
 *
 * POR QUÉ EXISTE ESTE MÓDULO. El informe de edades no lo genera el ERP: alguien
 * copia el archivo del mes anterior y lo edita. Se ve en los propios archivos —
 * notas escritas a mano en el bloque de cuadre, columnas de verificación que
 * solo están en algunos, y la palabra «Merkmios» pegada junto a «fecha corte»
 * en los tres informes, sean de la empresa que sean.
 *
 * Eso quiere decir que **cualquier celda del encabezado puede venir del mes
 * pasado**, no solo el nombre de la empresa. Y el daño no se ve: una fecha
 * heredada machaca el punto de ese mes en el historial, y un nombre heredado
 * acumula la cartera de una empresa bajo otra. Meses después, la gráfica está
 * mal y nadie sabe desde cuándo.
 *
 * La defensa no es adivinar mejor. Es que **nada entre al historial sin que
 * alguien lo confirme**, y que lo que se pueda contrastar contra los datos se
 * contraste. La fecha de corte sí se puede: ver `Coherencia` en `types.ts`.
 */

export interface AjusteCorte {
  empresaId: string;
  empresaNombre: string;
  fecha: string;
  /** El usuario esta tecleando un nombre a mano en vez de elegir de la lista. */
  manual?: boolean;
}

export interface Revision {
  nivel: NivelAviso;
  mensaje: string;
  /** Valor que arregla el problema, si el tablero sabe cuál es. */
  sugerencia?: { campo: 'fecha' | 'empresaId'; valor: string; etiqueta: string };
}

export interface Empresa {
  id: string;
  nombre: string;
}

/** Diferencia relativa por encima de la cual dos saldos ya no son el mismo dato. */
const TOLERANCIA_RELATIVA = 0.005;

/** `comercializadora-floralia` -> `['comercializadora','floralia']`. */
const tokens = (id: string) => id.split('-').filter(Boolean);

/**
 * ¿Dos identificadores de empresa son probablemente la misma?
 *
 * El caso real que hay que atrapar: que un mes el informe diga
 * «COMERCIALIZADORA FLORALIA» y al siguiente solo «FLORALIA». Serían dos ids y
 * el historial se partiría en dos medias series sin que nada avise.
 */
export function empresasParecidas(a: string, b: string): boolean {
  if (a === b) return false;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const [corto, largo] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let comunes = 0;
  for (const t of corto) if (largo.has(t)) comunes++;
  /* Todos los tokens del nombre corto están en el largo: «Floralia» dentro de
   * «Comercializadora Floralia». */
  return comunes === corto.size;
}

function totalPrincipal(corte: Corte, tipo: Tipo): number | null {
  const c = corte.carteras[tipo];
  return c ? totalDeGrupo(c.docs, 'principal') : null;
}

/**
 * Revisa un corte pendiente con el ajuste que el usuario tenga puesto.
 *
 * Devuelve la lista vacía cuando no hay nada que decir. Los `error` bloquean la
 * confirmación; los `aviso` solo piden una mirada.
 */
export function revisarPendiente(
  corte: Corte,
  ajuste: AjusteCorte,
  historial: readonly PuntoHistorial[],
  conocidas: readonly Empresa[],
  otros: readonly { corte: Corte; ajuste: AjusteCorte }[]
): Revision[] {
  const out: Revision[] = [];

  /* --- 1. ¿los datos desmienten la fecha? --- */
  for (const tipo of ['CXC', 'CXP'] as Tipo[]) {
    const c = corte.carteras[tipo];
    if (!c) continue;
    const { declarado, derivado, filasCoinciden, filasEvaluadas } = c.coherencia;
    if (!derivado) continue;
    const etiqueta = tipo === 'CXC' ? 'por cobrar' : 'por pagar';

    if (derivado !== ajuste.fecha) {
      const seguro = filasEvaluadas > 0 && filasCoinciden / filasEvaluadas > 0.8;
      out.push({
        nivel: seguro ? 'error' : 'aviso',
        mensaje:
          `Los días vencidos de ${etiqueta} corresponden al ${derivado}, no al ${ajuste.fecha} ` +
          `(${filasCoinciden} de ${filasEvaluadas} filas). ` +
          'Es lo que pasa cuando se copia el archivo del mes anterior y no se cambia la celda de corte.',
        sugerencia: { campo: 'fecha', valor: derivado, etiqueta: `Usar ${derivado}` },
      });
      continue;
    }

    /* La fecha propuesta ya es la buena, pero la celda decía otra cosa. Se dice
     * igual: corregir en silencio esconde que el archivo viene mal, y el mes que
     * viene vuelve a pasar. */
    if (declarado && declarado !== derivado) {
      out.push({
        nivel: 'aviso',
        mensaje:
          `La celda «fecha corte» de ${etiqueta} dice ${declarado}, pero los días vencidos de las ` +
          `${filasEvaluadas} filas corresponden al ${derivado}. Se propone la de los datos. ` +
          'Conviene corregir la celda en el archivo origen para que no se repita.',
        sugerencia: { campo: 'fecha', valor: declarado, etiqueta: `Dejar ${declarado}` },
      });
    }
  }

  /* --- 2. ¿ya hay un corte de esta empresa en ese mes? --- */
  const mes = ajuste.fecha.slice(0, 7);
  for (const tipo of ['CXC', 'CXP'] as Tipo[]) {
    const nuevo = totalPrincipal(corte, tipo);
    if (nuevo == null) continue;
    const previo = historial.find((p) => p.empresaId === ajuste.empresaId && p.mes === mes && p.tipo === tipo);
    if (!previo) continue;
    const base = Math.max(Math.abs(previo.principal), 1);
    const dif = Math.abs(nuevo - previo.principal) / base;
    if (dif <= TOLERANCIA_RELATIVA) continue;
    out.push({
      nivel: 'aviso',
      mensaje:
        `Ya hay un corte de ${ajuste.empresaNombre} en ${mes} con otro saldo ` +
        `(${Math.round(previo.principal / 1e6).toLocaleString('es-CO')} MM guardado contra ` +
        `${Math.round(nuevo / 1e6).toLocaleString('es-CO')} MM en este archivo). ` +
        'Si es un informe corregido, confirma y se reemplaza. Si no, revisa la fecha y la empresa.',
    });
  }

  /* --- 3. ¿empresa nueva parecida a una que ya existe? --- */
  const yaConocida = conocidas.some((e) => e.id === ajuste.empresaId);
  if (!yaConocida) {
    const parecida = conocidas.find((e) => empresasParecidas(e.id, ajuste.empresaId));
    if (parecida) {
      out.push({
        nivel: 'aviso',
        mensaje:
          `«${ajuste.empresaNombre}» entraría como empresa nueva, pero se parece a «${parecida.nombre}», ` +
          'que ya tiene historial. Si son la misma, elígela en la lista o la serie quedará partida en dos.',
        sugerencia: { campo: 'empresaId', valor: parecida.id, etiqueta: `Usar ${parecida.nombre}` },
      });
    } else if (conocidas.length > 0) {
      out.push({
        nivel: 'info',
        mensaje: `«${ajuste.empresaNombre}» es una empresa nueva; se creará su propia serie.`,
      });
    }
  }

  /* --- 4. ¿choca con otro archivo de esta misma carga? --- */
  const choque = otros.find(
    (o) => o.ajuste.empresaId === ajuste.empresaId && o.ajuste.fecha === ajuste.fecha
  );
  if (choque) {
    out.push({
      nivel: 'error',
      mensaje:
        `Otro archivo de esta carga (${choque.corte.archivo}) quedaría como la misma empresa y la misma fecha. ` +
        'Corrige uno de los dos: si se confirman así, solo queda el último.',
    });
  }

  return out;
}

export const hayBloqueo = (revisiones: readonly Revision[]): boolean =>
  revisiones.some((r) => r.nivel === 'error');
