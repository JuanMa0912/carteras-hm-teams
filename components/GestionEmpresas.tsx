'use client';

import { useState } from 'react';
import { identificarEmpresa } from '@/lib/empresa';
import { empresasParecidas, type Empresa } from '@/lib/revision';
import { fmtNum } from '@/lib/format';
import type { PuntoHistorial } from '@/lib/types';

/**
 * Reparación de empresas ya guardadas.
 *
 * El paso de confirmación evita que entre mal, pero no arregla lo que ya está
 * en el historial. Dos cosas que hay que poder hacer sin borrar todo:
 *
 * - **Renombrar**, cuando el nombre entró feo o incompleto.
 * - **Fusionar**, cuando la misma empresa entró con dos nombres y su serie
 *   quedó partida en dos medias series. Es el daño caro: meses de acumulación
 *   repartidos entre dos etiquetas.
 */
export default function GestionEmpresas({
  empresas,
  historial,
  onReasignar,
}: {
  empresas: Empresa[];
  historial: PuntoHistorial[];
  onReasignar: (idOrigen: string, idDestino: string, nombreDestino: string) => void;
}) {
  const [origen, setOrigen] = useState(empresas[0]?.id ?? '');
  const [accion, setAccion] = useState<'renombrar' | 'fusionar'>('renombrar');
  const [nombre, setNombre] = useState('');
  const [destino, setDestino] = useState('');

  const laOrigen = empresas.find((e) => e.id === origen);
  const otras = empresas.filter((e) => e.id !== origen);
  const mesesDe = (id: string) => new Set(historial.filter((p) => p.empresaId === id).map((p) => p.mes)).size;

  /* Un par sospechoso es el motivo por el que esto existe: se señala solo. */
  const sospechoso = empresas.find((a) =>
    empresas.some((b) => a.id !== b.id && empresasParecidas(a.id, b.id) && a.id < b.id)
  );

  const nuevoId = identificarEmpresa(nombre)?.id ?? '';
  const puede =
    accion === 'renombrar'
      ? Boolean(laOrigen && nombre.trim() && nuevoId)
      : Boolean(laOrigen && destino && destino !== origen);

  function aplicar() {
    if (!laOrigen || !puede) return;
    if (accion === 'renombrar') {
      onReasignar(origen, nuevoId, nombre.trim());
    } else {
      const d = empresas.find((e) => e.id === destino);
      if (d) onReasignar(origen, d.id, d.nombre);
    }
    setNombre('');
  }

  return (
    <details className="collapsible gestion">
      <summary className="collapsible-summary section-label">
        <span className="chev" aria-hidden="true">▾</span>
        Corregir o unir empresas
      </summary>
      <div className="collapsible-body">
        {sospechoso && (
          <div className="aviso aviso-warn" style={{ marginBottom: 14 }}>
            <span className="tag">Posible duplicado</span>
            <span>
              Hay dos empresas con nombres parecidos en el historial. Si son la misma, fusiónalas aquí o la
              gráfica mostrará dos medias series.
            </span>
          </div>
        )}

        <div className="gestion-grid">
          <div className="field">
            <label className="field-label" htmlFor="gOrigen">Empresa</label>
            <select id="gOrigen" value={origen} onChange={(e) => setOrigen(e.target.value)}>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} · {fmtNum(mesesDe(e.id))} mes{mesesDe(e.id) === 1 ? '' : 'es'}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <span className="field-label">Qué hacer</span>
            <div className="scale-toggle" role="group" aria-label="Acción">
              <button type="button" className="scale-btn" aria-pressed={accion === 'renombrar'} onClick={() => setAccion('renombrar')}>
                Renombrar
              </button>
              <button type="button" className="scale-btn" aria-pressed={accion === 'fusionar'} onClick={() => setAccion('fusionar')}>
                Fusionar con otra
              </button>
            </div>
          </div>

          {accion === 'renombrar' ? (
            <div className="field">
              <label className="field-label" htmlFor="gNombre">Nombre nuevo</label>
              <input
                id="gNombre"
                type="text"
                value={nombre}
                placeholder={laOrigen?.nombre ?? ''}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <label className="field-label" htmlFor="gDestino">Se une a</label>
              <select id="gDestino" value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Elige una…</option>
                {otras.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" disabled={!puede} onClick={aplicar}>
              Aplicar
            </button>
          </div>
        </div>

        {accion === 'fusionar' && destino && (
          <p className="nota-modo">
            Los meses de <strong>{laOrigen?.nombre}</strong> pasan a{' '}
            <strong>{empresas.find((e) => e.id === destino)?.nombre}</strong>. Si las dos tienen el mismo mes,
            se conserva el de la empresa destino.
          </p>
        )}
      </div>
    </details>
  );
}
