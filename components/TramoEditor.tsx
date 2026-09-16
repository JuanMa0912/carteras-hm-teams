'use client';

import { UMBRALES_POR_DEFECTO } from '@/lib/aggregate';

/** Editor de los cuatro umbrales que definen los cinco tramos de antiguedad. */
export default function TramoEditor({
  umbrales,
  onChange,
}: {
  umbrales: number[];
  onChange: (u: number[]) => void;
}) {
  function set(i: number, valor: string) {
    const n = parseInt(valor, 10);
    if (!Number.isFinite(n)) return;
    const copia = umbrales.slice();
    copia[i] = n;
    onChange(copia);
  }

  const porDefecto = umbrales.every((v, i) => v === UMBRALES_POR_DEFECTO[i]);

  return (
    <div className="tramo-editor">
      <span className="tramo-editor-label">Tramos</span>
      <span className="th-group">
        <span className="th-pre">1–</span>
        <input
          type="number" className="th-input num" min={1} value={umbrales[0]}
          aria-label="Primer umbral en dias" onChange={(e) => set(0, e.target.value)}
        />
        <span className="th-suf">días</span>
      </span>
      <span className="th-sep">·</span>
      <span className="th-group">
        <input
          type="number" className="th-input num" min={2} value={umbrales[1]}
          aria-label="Segundo umbral en dias" onChange={(e) => set(1, e.target.value)}
        />
        <span className="th-suf">días</span>
      </span>
      <span className="th-sep">·</span>
      <span className="th-group">
        <input
          type="number" className="th-input num" min={3} value={umbrales[2]}
          aria-label="Tercer umbral en dias" onChange={(e) => set(2, e.target.value)}
        />
        <span className="th-suf">días</span>
      </span>
      <span className="th-sep">·</span>
      <span className="th-group">
        <input
          type="number" className="th-input num" min={4} value={umbrales[3]}
          aria-label="Cuarto umbral en dias" onChange={(e) => set(3, e.target.value)}
        />
        <span className="th-suf">días</span>
      </span>
      <button
        type="button" className="btn-reset" disabled={porDefecto}
        onClick={() => onChange([...UMBRALES_POR_DEFECTO])}
        title="Restablecer 30 / 90 / 180 / 360"
      >
        ↺ Restablecer
      </button>
    </div>
  );
}
