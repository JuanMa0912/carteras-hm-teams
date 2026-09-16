import type { Aviso } from '@/lib/types';

const ETIQUETA = { error: 'Error', aviso: 'Revisar', info: 'Nota' } as const;

/**
 * Bitacora de la lectura del archivo. Es deliberadamente visible: la version
 * anterior descartaba hojas en silencio y nadie se enteraba.
 */
export default function AvisosPanel({ avisos }: { avisos: Aviso[] }) {
  if (!avisos.length) return null;
  const errores = avisos.filter((a) => a.nivel === 'error').length;
  const revisar = avisos.filter((a) => a.nivel === 'aviso').length;

  return (
    <details className="collapsible" open={errores > 0 || revisar > 0}>
      <summary className="collapsible-summary section-label">
        <span className="chev" aria-hidden="true">▾</span>
        Lectura del archivo · {avisos.length} nota{avisos.length === 1 ? '' : 's'}
        {errores > 0 && <span style={{ color: 'var(--danger-text)' }}> · {errores} error{errores === 1 ? '' : 'es'}</span>}
        {revisar > 0 && <span style={{ color: 'var(--warning-text)' }}> · {revisar} por revisar</span>}
      </summary>
      <div className="collapsible-body">
        <div className="avisos">
          {avisos.map((a, i) => (
            <div key={i} className={`aviso ${a.nivel === 'aviso' ? 'aviso-warn' : a.nivel}`}>
              <span className="tag">{ETIQUETA[a.nivel]}{a.hoja ? ` · ${a.hoja}` : ''}</span>
              <span>{a.mensaje}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
