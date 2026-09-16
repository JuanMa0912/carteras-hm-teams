import type { TramoDef } from '@/lib/types';

const COLOR: Record<TramoDef['estado'], string> = {
  good: 'var(--good)',
  warning: 'var(--warning)',
  serious: 'var(--serious)',
  critical: 'var(--critical)',
  'critical-deep': 'var(--critical-deep)',
};

/**
 * Distintivo de severidad. Los colores de estado nunca van solos: siempre
 * acompanan a la etiqueta del tramo, que es la que carga el significado.
 */
export default function Chip({ tramo }: { tramo: TramoDef }) {
  const c = COLOR[tramo.estado];
  return (
    <span
      className="chip"
      style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}
    >
      <span className="dot" style={{ background: c }} aria-hidden="true" />
      {tramo.etiqueta}
    </span>
  );
}
