'use client';

import { useMemo, useState } from 'react';
import type { DocVista, Tipo, TramoDef } from '@/lib/types';
import { agruparPorTercero, tramoDe, type Tercero } from '@/lib/aggregate';
import { fmtDate, fmtMoney, fmtNum, norm, type Escala } from '@/lib/format';
import Chip from './Chip';

type Orden = 'nombre' | 'docs' | 'tramo' | 'saldo';

const TAM_PAGINA = 40;

/**
 * Detalle por tercero, agrupado y desplegable.
 *
 * Lee la selección del tablero —cartera, tramo y terceros— en vez de tener
 * filtros propios. Antes había tres filtros sueltos que no se hablaban entre
 * sí y se podía quedar viendo el tramo de una cartera con el detalle de la
 * otra.
 */
interface Props {
  tipo: Tipo;
  onTipo: (t: Tipo) => void;
  docs: DocVista[];
  tramos: TramoDef[];
  escala: Escala;
  /** `true` cuando hay más de una empresa en pantalla. */
  multiempresa: boolean;
  onExportar: (docs: DocVista[]) => void;
}

export default function DetailTable({ tipo, onTipo, docs, tramos, escala, multiempresa, onExportar }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<Orden>('saldo');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [pagina, setPagina] = useState(1);
  const [abiertos, setAbiertos] = useState<Record<Tipo, Set<string>>>({ CXC: new Set(), CXP: new Set() });

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return docs;
    const q = norm(busqueda);
    return docs.filter(
      (d) => norm(d.nombre).includes(q) || norm(d.nit).includes(q) || norm(d.documento).includes(q)
    );
  }, [docs, busqueda]);

  const grupos = useMemo(() => {
    const g = agruparPorTercero(filtrados, tramos);
    const f = dir === 'asc' ? 1 : -1;
    g.sort((a, b) => {
      if (orden === 'nombre') return a.nombre.localeCompare(b.nombre, 'es') * f;
      if (orden === 'docs') return (a.docs.length - b.docs.length) * f;
      if (orden === 'tramo') return ((a.peor?.idx ?? -1) - (b.peor?.idx ?? -1)) * f;
      return (a.saldo - b.saldo) * f;
    });
    return g;
  }, [filtrados, tramos, orden, dir]);

  const totalPaginas = Math.max(1, Math.ceil(grupos.length / TAM_PAGINA));
  const pag = Math.min(pagina, totalPaginas);
  const inicio = (pag - 1) * TAM_PAGINA;
  const visibles = grupos.slice(inicio, inicio + TAM_PAGINA);
  const abiertosTipo = abiertos[tipo];

  function alternar(key: string) {
    setAbiertos((prev) => {
      const set = new Set(prev[tipo]);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, [tipo]: set };
    });
  }

  function ordenar(k: Orden) {
    if (orden === k) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setOrden(k);
      setDir('desc');
    }
  }

  const flecha = (k: Orden) => (orden === k ? (dir === 'asc' ? ' ▲' : ' ▼') : '');
  const colSpan = multiempresa ? 8 : 7;

  return (
    <div className="card">
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="tabs" role="group" aria-label="Tipo de cartera">
            <button
              type="button"
              className="tab"
              aria-pressed={tipo === 'CXC'}
              onClick={() => {
                onTipo('CXC');
                setPagina(1);
              }}
            >
              Por cobrar
            </button>
            <button
              type="button"
              className="tab"
              aria-pressed={tipo === 'CXP'}
              onClick={() => {
                onTipo('CXP');
                setPagina(1);
              }}
            >
              Por pagar
            </button>
          </div>
          <input
            type="text"
            value={busqueda}
            placeholder="Buscar por nombre, NIT o documento…"
            aria-label="Buscar"
            style={{ minWidth: 260 }}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
          />
          <button type="button" className="btn small" onClick={() => onExportar(filtrados)}>
            ⤓ Exportar CSV
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => ordenar('nombre')}>
                Tercero<span className="arrow">{flecha('nombre')}</span>
              </th>
              {multiempresa && <th>Empresa</th>}
              <th>NIT</th>
              <th className="sortable" onClick={() => ordenar('docs')}>
                Documento<span className="arrow">{flecha('docs')}</span>
              </th>
              <th>Vence</th>
              <th className="amt">Días</th>
              <th className="sortable" onClick={() => ordenar('tramo')}>
                Tramo<span className="arrow">{flecha('tramo')}</span>
              </th>
              <th className="amt sortable" onClick={() => ordenar('saldo')}>
                Saldo<span className="arrow">{flecha('saldo')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="empty">
                  No hay registros que coincidan con el filtro.
                </td>
              </tr>
            )}
            {visibles.map((g: Tercero) => {
              const abierto = abiertosTipo.has(g.key);
              const empresas = Array.from(new Set((g.docs as DocVista[]).map((d) => d.empresaNombre)));
              return [
                <tr
                  key={g.key}
                  className={`group-row${abierto ? ' open' : ''}`}
                  onClick={() => alternar(g.key)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      alternar(g.key);
                    }
                  }}
                >
                  <td>
                    <span className="chevron" aria-hidden="true">
                      {abierto ? '▾' : '▸'}
                    </span>
                    <span className="name">{g.nombre}</span>
                  </td>
                  {multiempresa && (
                    <td className="muted" style={{ fontSize: 12 }}>
                      {empresas.length === 1 ? empresas[0] : `${empresas.length} empresas`}
                    </td>
                  )}
                  <td className="num">{g.nit || '—'}</td>
                  <td className="num muted">
                    {fmtNum(g.docs.length)} documento{g.docs.length === 1 ? '' : 's'}
                  </td>
                  <td className="muted">—</td>
                  <td className="days muted">—</td>
                  <td>{g.peor ? <Chip tramo={g.peor} /> : '—'}</td>
                  <td className="amt num">{fmtMoney(g.saldo, escala)}</td>
                </tr>,
                ...(abierto
                  ? (g.docs as DocVista[])
                      .slice()
                      .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))
                      .map((d, i) => (
                        <tr className="child-row" key={g.key + '|' + d.documento + '|' + i}>
                          <td />
                          {multiempresa && (
                            <td className="muted" style={{ fontSize: 11.5 }}>
                              {d.empresaNombre}
                            </td>
                          )}
                          <td className="muted" style={{ fontSize: 11.5 }}>
                            {d.cuenta}
                          </td>
                          <td className="child-doc">↳ {d.documento || '(sin documento)'}</td>
                          <td className="num">{fmtDate(d.fechaVcto)}</td>
                          <td className="days num">{Math.round(d.dVenc)}</td>
                          <td>
                            <Chip tramo={tramoDe(d, tramos)} />
                          </td>
                          <td className="amt num">{fmtMoney(d.saldo, escala)}</td>
                        </tr>
                      ))
                  : []),
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <span>
          {grupos.length
            ? `Mostrando ${fmtNum(inicio + 1)}–${fmtNum(inicio + visibles.length)} de ${fmtNum(
                grupos.length
              )} terceros (${fmtNum(filtrados.length)} documentos)`
            : '0 registros'}
        </span>
        <div className="pager-btns">
          <button type="button" disabled={pag <= 1} onClick={() => setPagina(pag - 1)}>
            ← Anterior
          </button>
          <button type="button" disabled={pag >= totalPaginas} onClick={() => setPagina(pag + 1)}>
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}
