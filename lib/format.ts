export type Escala = 1 | 1000 | 1000000;

export const NOTA_ESCALA: Record<Escala, string> = {
  1: '',
  1000: 'cifras en miles de pesos',
  1000000: 'cifras en millones de pesos',
};

export const SUFIJO_ESCALA: Record<Escala, string> = { 1: '', 1000: ' mil', 1000000: ' M' };

/** Formatea un valor en pesos colombianos aplicando la escala activa. */
export function fmtMoney(v: number | null | undefined, escala: Escala = 1): string {
  if (v == null || Number.isNaN(v)) return '—';
  const decimales = escala === 1000000 ? 1 : 0;
  const escalado = v / escala;
  const neg = escalado < -(0.5 / Math.pow(10, decimales));
  const n = Math.abs(escalado);
  return (
    (neg ? '-' : '') +
    '$ ' +
    n.toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
  );
}

/** Version compacta para etiquetas dentro de graficos. */
export function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1).replace('.', ',') + ' MM';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(0) + ' M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + ' mil';
  return sign + '$' + abs.toFixed(0);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = iso.split('-');
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

export function fmtPct(v: number): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
}

export function fmtNum(v: number): string {
  return v.toLocaleString('es-CO');
}

/** Normaliza texto para comparaciones: sin acentos, minusculas, sin espacios extra. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}
