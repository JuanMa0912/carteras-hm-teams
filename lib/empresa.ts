import { norm } from './format';

/**
 * Identificacion de la empresa dueña del informe.
 *
 * NO hay lista fija de empresas. El tablero esta pensado para que entren
 * empresas nuevas sin tocar codigo, asi que el identificador se deriva del
 * nombre que trae el propio archivo.
 *
 * DE DONDE SE LEE, Y POR QUE IMPORTA: del nombre en la primera columna de la
 * franja de cabecera (la celda A1 del informe). **Nunca de la celda que está
 * junto a la etiqueta «fecha corte»**: el generador del ERP escribe ahí
 * «Merkmios» en TODOS los informes, sin importar de qué empresa sean.
 * Verificado el 18-sep-2026 con los tres informes al 31-ago: los de Mercamio y
 * Comercializadora Floralia también dicen «Merkmios» en esa celda. Apoyarse en
 * ella juntaría las tres empresas bajo un mismo nombre sin que nada avise.
 */

/** Sufijos societarios que no distinguen una empresa de otra. */
const SUFIJOS = /\b(s\.?a\.?s?\.?|ltda\.?|e\.?u\.?|s\.? en c\.?|sociedad|comercial)\b/g;

export interface Empresa {
  id: string;
  nombre: string;
}

/**
 * Nombre crudo del informe -> identificador estable + nombre presentable.
 *
 * «MERKMIOS SAS» y «MERKMIOS » (que es como sale en la hoja CXC del mismo
 * libro) tienen que dar el mismo id, o la misma empresa se partiria en dos.
 */
export function identificarEmpresa(textoCrudo: string | null): Empresa | null {
  const crudo = (textoCrudo ?? '').trim();
  if (!crudo) return null;

  const limpio = norm(crudo).replace(SUFIJOS, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!limpio) return null;

  const id = limpio.replace(/ /g, '-');
  return { id, nombre: presentable(crudo) };
}

/** «MERCAMIO S.A» -> «Mercamio S.A». Deja las siglas cortas en mayuscula. */
function presentable(crudo: string): string {
  return crudo
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((p) => {
      const sinPuntos = p.replace(/\./g, '');
      if (sinPuntos.length <= 3 && !VOCALES.test(sinPuntos)) return p.toUpperCase();
      if (/^s\.?a\.?s?\.?$|^ltda\.?$|^e\.?u\.?$/.test(p)) return p.toUpperCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(' ');
}

const VOCALES = /[aeiou]/;

/** Etiqueta para el conjunto de todas las empresas cargadas. */
export const CONSOLIDADO = '__todas__';

export function etiquetaScope(scope: string, empresas: Empresa[]): string {
  if (scope === CONSOLIDADO) {
    return empresas.length === 1 ? empresas[0].nombre : `Las ${empresas.length} empresas`;
  }
  return empresas.find((e) => e.id === scope)?.nombre ?? scope;
}
