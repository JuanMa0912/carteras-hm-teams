'use client';

import { useMemo, useState } from 'react';
import { identificarEmpresa } from '@/lib/empresa';
import { hayBloqueo, revisarPendiente, type AjusteCorte, type Empresa } from '@/lib/revision';
import { totalDeGrupo } from '@/lib/aggregate';
import { fmtDate, fmtMoney, fmtNum } from '@/lib/format';
import type { Corte, PuntoHistorial, Tipo } from '@/lib/types';

/**
 * Paso de confirmación antes de que nada entre al tablero ni al historial.
 *
 * Es la respuesta al problema de fondo: el informe lo mantiene una persona
 * copiando el archivo del mes anterior, así que el nombre de la empresa y la
 * fecha de corte del encabezado pueden venir heredados. Detectarlos mejor no
 * alcanza —no hay en el archivo ningún identificador de empresa— pero sí se
 * puede impedir que un dato heredado entre sin que nadie lo vea.
 *
 * La fecha, además, se contrasta contra los propios datos y se ofrece corregida.
 */
export default function ConfirmarCarga({
  pendientes,
  historial,
  conocidas,
  onConfirmar,
  onCancelar,
}: {
  pendientes: Corte[];
  historial: PuntoHistorial[];
  conocidas: Empresa[];
  onConfirmar: (cortes: Corte[]) => void;
  onCancelar: () => void;
}) {
  const [ajustes, setAjustes] = useState<Record<string, AjusteCorte>>(() => {
    const init: Record<string, AjusteCorte> = {};
    for (const c of pendientes) {
      /* La fecha propuesta es la que reconstruyen los datos cuando existe: es
       * evidencia, mientras que la celda es lo que alguien escribió. */
      const derivado = (['CXC', 'CXP'] as Tipo[])
        .map((t) => c.carteras[t]?.coherencia.derivado)
        .find((d): d is string => Boolean(d));
      init[c.id] = {
        empresaId: c.empresaId,
        empresaNombre: c.empresaNombre,
        fecha: derivado ?? c.fecha,
      };
    }
    return init;
  });

  function set(id: string, cambio: Partial<AjusteCorte>) {
    setAjustes((prev) => ({ ...prev, [id]: { ...prev[id], ...cambio } }));
  }

  function elegirEmpresa(id: string, valor: string) {
    if (valor === '__nueva__') {
      set(id, { manual: true, empresaId: '', empresaNombre: '' });
      return;
    }
    const opcion = [...conocidas, ...pendientes.map((c) => ({ id: c.empresaId, nombre: c.empresaNombre }))]
      .find((x) => x.id === valor);
    if (opcion) set(id, { empresaId: opcion.id, empresaNombre: opcion.nombre, manual: false });
  }

  function escribirEmpresa(id: string, texto: string) {
    const e = identificarEmpresa(texto);
    set(id, { empresaId: e?.id ?? '', empresaNombre: texto, manual: true });
  }

  const revisiones = useMemo(() => {
    const out: Record<string, ReturnType<typeof revisarPendiente>> = {};
    for (const c of pendientes) {
      const otros = pendientes
        .filter((o) => o.id !== c.id)
        .map((o) => ({ corte: o, ajuste: ajustes[o.id] }));
      out[c.id] = revisarPendiente(c, ajustes[c.id], historial, conocidas, otros);
    }
    return out;
  }, [pendientes, ajustes, historial, conocidas]);

  const bloqueado =
    Object.values(revisiones).some(hayBloqueo) ||
    pendientes.some((c) => !ajustes[c.id].empresaId || !ajustes[c.id].fecha);

  function confirmar() {
    const cortes = pendientes.map((c) => {
      const a = ajustes[c.id];
      return {
        ...c,
        id: a.empresaId + '|' + a.fecha,
        empresaId: a.empresaId,
        empresaNombre: a.empresaNombre.trim(),
        fecha: a.fecha,
        mes: a.fecha.slice(0, 7),
      };
    });
    onConfirmar(cortes);
  }

  return (
    <section>
      <div className="section-label">Revisa antes de cargar</div>
      <div className="card confirmar">
        <p className="confirmar-intro">
          El informe se mantiene copiando el archivo del mes anterior, así que la empresa y la fecha del
          encabezado pueden venir heredadas. <strong>Nada entra al historial hasta que confirmes.</strong> La
          fecha propuesta es la que reconstruyen los días vencidos de cada documento, no la de la celda.
        </p>

        <div className="table-scroll">
          <table className="tabla-confirmar">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Empresa</th>
                <th>Fecha de corte</th>
                <th className="amt">Contenido</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((c) => {
                const a = ajustes[c.id];
                const rs = revisiones[c.id];
                const esNueva = !conocidas.some((e) => e.id === a.empresaId);
                /* La empresa que trae el archivo tiene que estar en la lista, o
                 * la primera carga obliga a teclear un nombre que ya se leyó. */
                const opciones = esNueva && a.empresaId
                  ? [...conocidas, { id: a.empresaId, nombre: a.empresaNombre }]
                  : conocidas;
                const celdaDeclarada = c.carteras.CXC?.coherencia.declarado ?? c.carteras.CXP?.coherencia.declarado;
                return (
                  <tr key={c.id} className={hayBloqueo(rs) ? 'fila-bloqueada' : undefined}>
                    <td className="confirmar-archivo">{c.archivo}</td>
                    <td>
                      <select
                        value={a.manual ? '__nueva__' : a.empresaId}
                        aria-label={`Empresa de ${c.archivo}`}
                        onChange={(e) => elegirEmpresa(c.id, e.target.value)}
                      >
                        {opciones.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nombre}
                          </option>
                        ))}
                        <option value="__nueva__">Empresa nueva…</option>
                      </select>
                      {a.manual && (
                        <input
                          type="text"
                          value={a.empresaNombre}
                          aria-label={`Nombre de la empresa de ${c.archivo}`}
                          placeholder="Nombre de la empresa"
                          style={{ marginTop: 6, width: '100%' }}
                          onChange={(e) => escribirEmpresa(c.id, e.target.value)}
                        />
                      )}
                      <div className="confirmar-origen">del archivo: «{c.empresaNombre}»</div>
                    </td>
                    <td>
                      <input
                        type="date"
                        value={a.fecha}
                        aria-label={`Fecha de corte de ${c.archivo}`}
                        onChange={(e) => set(c.id, { fecha: e.target.value })}
                      />
                      {celdaDeclarada && celdaDeclarada !== a.fecha && (
                        <div className="confirmar-origen">la celda decía {fmtDate(celdaDeclarada)}</div>
                      )}
                    </td>
                    <td className="amt">
                      {(['CXC', 'CXP'] as Tipo[]).map((t) => {
                        const cart = c.carteras[t];
                        if (!cart) return null;
                        return (
                          <div key={t} className="confirmar-cifra">
                            <span className="muted">{t === 'CXC' ? 'cobrar' : 'pagar'} </span>
                            <span className="num">{fmtMoney(totalDeGrupo(cart.docs, 'principal'))}</span>
                            <span className="muted num"> · {fmtNum(cart.docs.length)} docs</span>
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pendientes.some((c) => revisiones[c.id].length > 0) && (
          <div className="avisos" style={{ marginTop: 18 }}>
            {pendientes.flatMap((c) =>
              revisiones[c.id].map((r, i) => (
                <div key={c.id + i} className={`aviso ${r.nivel === 'aviso' ? 'aviso-warn' : r.nivel}`}>
                  <span className="tag">{c.archivo}</span>
                  <span>
                    {r.mensaje}
                    {r.sugerencia && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="btn-inline"
                          onClick={() =>
                            set(c.id, {
                              [r.sugerencia!.campo]: r.sugerencia!.valor,
                              ...(r.sugerencia!.campo === 'empresaId'
                                ? {
                                    empresaNombre: conocidas.find((e) => e.id === r.sugerencia!.valor)?.nombre ?? '',
                                    manual: false,
                                  }
                                : {}),
                            })
                          }
                        >
                          {r.sugerencia.etiqueta}
                        </button>
                      </>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="confirmar-acciones">
          <button type="button" className="btn primary" disabled={bloqueado} onClick={confirmar}>
            Confirmar y cargar {pendientes.length} corte{pendientes.length === 1 ? '' : 's'}
          </button>
          <button type="button" className="btn" onClick={onCancelar}>
            Descartar
          </button>
          {bloqueado && (
            <span className="muted" style={{ fontSize: 12.5 }}>
              Resuelve lo marcado en rojo para poder confirmar.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
