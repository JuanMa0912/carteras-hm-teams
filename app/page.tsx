'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { leerLibro } from '@/lib/parser';
import { aCsv, calcularCuadre, sanearUmbrales, tramosDe, totalDe, UMBRALES_POR_DEFECTO } from '@/lib/aggregate';
import { fmtDate, fmtMoney, fmtNum, NOTA_ESCALA, type Escala } from '@/lib/format';
import type { Doc, ResultadoLectura, Tipo } from '@/lib/types';

import AgingChart from '@/components/AgingChart';
import AvisosPanel from '@/components/AvisosPanel';
import CuadrePanel from '@/components/CuadrePanel';
import DetailTable from '@/components/DetailTable';
import EmptyState from '@/components/EmptyState';
import KpiGrid from '@/components/KpiGrid';
import TopTable from '@/components/TopTable';
import TramoEditor from '@/components/TramoEditor';

const CLAVE_ALMACEN = 'cartera-hm:v1';
const CLAVE_TEMA = 'cartera-hm:tema';

export default function Page() {
  const [resultado, setResultado] = useState<ResultadoLectura | null>(null);
  const [escala, setEscala] = useState<Escala>(1);
  const [umbrales, setUmbrales] = useState<number[]>([...UMBRALES_POR_DEFECTO]);
  const [tipoDetalle, setTipoDetalle] = useState<Tipo>('CXC');
  const [nitCxc, setNitCxc] = useState('');
  const [nitCxp, setNitCxp] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [tema, setTema] = useState<'auto' | 'light' | 'dark'>('auto');
  const inputRef = useRef<HTMLInputElement>(null);

  /* ---------- avisos efímeros ---------- */
  const avisar = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(h);
  }, [toast]);

  /* ---------- tema ---------- */
  useEffect(() => {
    try {
      const t = localStorage.getItem(CLAVE_TEMA) as 'light' | 'dark' | null;
      if (t) {
        setTema(t);
        document.documentElement.setAttribute('data-theme', t);
      }
    } catch {
      /* almacenamiento bloqueado: se usa el tema del sistema */
    }
  }, []);

  function alternarTema() {
    const actual =
      tema === 'auto'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : tema;
    const siguiente = actual === 'dark' ? 'light' : 'dark';
    setTema(siguiente);
    document.documentElement.setAttribute('data-theme', siguiente);
    try {
      localStorage.setItem(CLAVE_TEMA, siguiente);
    } catch {
      /* sin persistencia, el cambio vale para esta sesión */
    }
  }

  /* ---------- restaurar la última carga ---------- */
  useEffect(() => {
    try {
      const crudo = localStorage.getItem(CLAVE_ALMACEN);
      if (crudo) setResultado(JSON.parse(crudo) as ResultadoLectura);
    } catch {
      /* dato corrupto o almacenamiento bloqueado: se arranca en blanco */
    }
  }, []);

  const guardar = useCallback((r: ResultadoLectura) => {
    try {
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(r));
    } catch {
      /* archivo demasiado grande o almacenamiento lleno: no se persiste */
    }
  }, []);

  /* ---------- carga de archivo ---------- */
  const procesar = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const r = leerLibro(buffer, file.name);
        const hayDatos = Boolean(r.datasets.CXC || r.datasets.CXP);
        setResultado(r);
        if (hayDatos) {
          guardar(r);
          const nC = r.datasets.CXC?.docs.length ?? 0;
          const nP = r.datasets.CXP?.docs.length ?? 0;
          avisar(`Archivo cargado: ${fmtNum(nC)} documentos por cobrar y ${fmtNum(nP)} por pagar.`);
        } else {
          avisar('No se reconoció ninguna hoja. Revisa las notas de lectura.', true);
        }
      } catch (e) {
        avisar('No se pudo leer el archivo: ' + (e instanceof Error ? e.message : String(e)), true);
      }
    },
    [avisar, guardar]
  );

  useEffect(() => {
    function onOver(e: DragEvent) {
      e.preventDefault();
      setArrastrando(true);
    }
    function onLeave(e: DragEvent) {
      if (e.target === document.documentElement) setArrastrando(false);
    }
    function onDrop(e: DragEvent) {
      e.preventDefault();
      setArrastrando(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void procesar(f);
    }
    document.addEventListener('dragover', onOver);
    document.addEventListener('dragenter', onOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragenter', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [procesar]);

  /* ---------- derivados ---------- */
  const tramos = useMemo(() => tramosDe(umbrales), [umbrales]);
  const dsCxc = resultado?.datasets.CXC ?? null;
  const dsCxp = resultado?.datasets.CXP ?? null;
  const docsCxc = useMemo(() => dsCxc?.docs ?? [], [dsCxc]);
  const docsCxp = useMemo(() => dsCxp?.docs ?? [], [dsCxp]);
  const hayDatos = docsCxc.length > 0 || docsCxp.length > 0;

  const empresa = dsCxc?.empresa ?? dsCxp?.empresa ?? null;
  const fechaCorte = dsCxc?.fechaCorte ?? dsCxp?.fechaCorte ?? null;

  const tercerosCxc = useMemo(() => listaTerceros(docsCxc), [docsCxc]);
  const tercerosCxp = useMemo(() => listaTerceros(docsCxp), [docsCxp]);

  const filtradosCxc = useMemo(() => filtrarPorNit(docsCxc, nitCxc, tercerosCxc), [docsCxc, nitCxc, tercerosCxc]);
  const filtradosCxp = useMemo(() => filtrarPorNit(docsCxp, nitCxp, tercerosCxp), [docsCxp, nitCxp, tercerosCxp]);

  function exportar(docs: Doc[]) {
    const csv = aCsv(docs, tramos);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cartera-${tipoDetalle.toLowerCase()}-${fechaCorte ?? 'sin-corte'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    avisar(`${fmtNum(docs.length)} documentos exportados a CSV.`);
  }

  function limpiar() {
    setResultado(null);
    setNitCxc('');
    setNitCxp('');
    try {
      localStorage.removeItem(CLAVE_ALMACEN);
    } catch {
      /* nada que limpiar */
    }
    avisar('Datos borrados de este navegador.');
  }

  return (
    <div className="wrap">
      {arrastrando && <div id="dropHint">Suelta el archivo para cargarlo</div>}

      <div className="topbar">
        <div className="brand">
          <div className="mark" aria-hidden="true">$</div>
          <div>
            <h1>Cartera por edades</h1>
            <div className="company">{empresa ?? 'Sin archivo cargado'}</div>
          </div>
        </div>

        <div className="head-right">
          {hayDatos && (
            <>
              <div className="scale-control">
                <span className="sr-only" id="lblEscala">Escala de las cifras</span>
                <div className="scale-toggle" role="group" aria-labelledby="lblEscala">
                  {([1, 1000, 1000000] as Escala[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="scale-btn"
                      aria-pressed={escala === s}
                      onClick={() => setEscala(s)}
                    >
                      {s === 1 ? '$' : s === 1000 ? 'Miles' : 'Millones'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="stamp">{fechaCorte ? `Corte ${fmtDate(fechaCorte)}` : 'Sin corte'}</div>
            </>
          )}
          <button type="button" className="btn small" onClick={alternarTema} title="Cambiar tema">
            ◐ Tema
          </button>
          <button type="button" className="btn primary" onClick={() => inputRef.current?.click()}>
            ⇪ {hayDatos ? 'Cambiar archivo' : 'Cargar .xlsx'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void procesar(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {!hayDatos ? (
        <>
          <EmptyState onElegir={() => inputRef.current?.click()} />
          {resultado && (
            <section style={{ marginTop: 28 }}>
              <AvisosPanel avisos={resultado.avisos} />
            </section>
          )}
        </>
      ) : (
        <>
          <section>
            <div className="section-label">
              Resumen {NOTA_ESCALA[escala] && <>— {NOTA_ESCALA[escala]}</>}
            </div>
            <KpiGrid
              docsCxc={docsCxc}
              docsCxp={docsCxp}
              tramos={tramos}
              escala={escala}
              fechaCorte={fechaCorte}
              fuente={resultado?.archivo ?? '—'}
            />
          </section>

          <section>
            <div className="section-label-row">
              <div className="section-label">Antigüedad de saldos por tramo</div>
              <TramoEditor umbrales={umbrales} onChange={(u) => setUmbrales(sanearUmbrales(u))} />
            </div>
            <div className="chart-grid">
              {dsCxc && (
                <div className="card">
                  <div className="chart-title">
                    <span className="dot" style={{ background: 'var(--cxc)' }} aria-hidden="true" />
                    <h3>Por cobrar</h3>
                    <span className="tot num">{fmtMoney(totalDe(filtradosCxc), escala)}</span>
                    <input
                      type="text"
                      className="nit-select"
                      list="listaCxc"
                      value={nitCxc}
                      placeholder="Filtrar por cliente o NIT…"
                      aria-label="Filtrar por cliente o NIT"
                      autoComplete="off"
                      onChange={(e) => setNitCxc(e.target.value)}
                    />
                    <datalist id="listaCxc">
                      {tercerosCxc.map((t) => (
                        <option key={t.nit + t.nombre} value={`${t.nombre} — NIT ${t.nit}`} />
                      ))}
                    </datalist>
                  </div>
                  <div className="chart-scope">
                    {nitCxc
                      ? `Mostrando ${fmtNum(filtradosCxc.length)} de ${fmtNum(docsCxc.length)} documentos`
                      : `${fmtNum(docsCxc.length)} documentos · ${fmtNum(tercerosCxc.length)} clientes`}
                  </div>
                  <AgingChart tipo="CXC" docs={filtradosCxc} tramos={tramos} escala={escala} />
                </div>
              )}
              {dsCxp && (
                <div className="card">
                  <div className="chart-title">
                    <span className="dot" style={{ background: 'var(--cxp)' }} aria-hidden="true" />
                    <h3>Por pagar</h3>
                    <span className="tot num">{fmtMoney(totalDe(filtradosCxp), escala)}</span>
                    <input
                      type="text"
                      className="nit-select"
                      list="listaCxp"
                      value={nitCxp}
                      placeholder="Filtrar por proveedor o NIT…"
                      aria-label="Filtrar por proveedor o NIT"
                      autoComplete="off"
                      onChange={(e) => setNitCxp(e.target.value)}
                    />
                    <datalist id="listaCxp">
                      {tercerosCxp.map((t) => (
                        <option key={t.nit + t.nombre} value={`${t.nombre} — NIT ${t.nit}`} />
                      ))}
                    </datalist>
                  </div>
                  <div className="chart-scope">
                    {nitCxp
                      ? `Mostrando ${fmtNum(filtradosCxp.length)} de ${fmtNum(docsCxp.length)} documentos`
                      : `${fmtNum(docsCxp.length)} documentos · ${fmtNum(tercerosCxp.length)} proveedores`}
                  </div>
                  <AgingChart tipo="CXP" docs={filtradosCxp} tramos={tramos} escala={escala} />
                </div>
              )}
            </div>
          </section>

          <section>
            <details className="collapsible" open>
              <summary className="collapsible-summary section-label">
                <span className="chev" aria-hidden="true">▾</span>
                Cuadre contra el balance
              </summary>
              <div className="collapsible-body">
                <div className="cuadre-grid">
                  {dsCxc && <CuadrePanel ds={dsCxc} cuadre={calcularCuadre(dsCxc)} escala={escala} />}
                  {dsCxp && <CuadrePanel ds={dsCxp} cuadre={calcularCuadre(dsCxp)} escala={escala} />}
                </div>
              </div>
            </details>
          </section>

          <section>
            <details className="collapsible" open>
              <summary className="collapsible-summary section-label">
                <span className="chev" aria-hidden="true">▾</span>
                Concentración de la cartera
              </summary>
              <div className="collapsible-body">
                <div className="chart-grid">
                  {dsCxc && <TopTable tipo="CXC" docs={docsCxc} tramos={tramos} escala={escala} />}
                  {dsCxp && <TopTable tipo="CXP" docs={docsCxp} tramos={tramos} escala={escala} />}
                </div>
              </div>
            </details>
          </section>

          <section>
            <details className="collapsible" open>
              <summary className="collapsible-summary section-label">
                <span className="chev" aria-hidden="true">▾</span>
                Detalle por tercero
              </summary>
              <div className="collapsible-body">
                <DetailTable
                  tipo={tipoDetalle}
                  onTipo={setTipoDetalle}
                  docsCxc={docsCxc}
                  docsCxp={docsCxp}
                  tramos={tramos}
                  escala={escala}
                  onExportar={exportar}
                />
              </div>
            </details>
          </section>

          {resultado && (
            <section>
              <AvisosPanel avisos={resultado.avisos} />
            </section>
          )}

          <footer className="pie">
            <span>
              Fuente: {resultado?.archivo} · procesado en este navegador, sin enviarse a ningún servidor.
            </span>
            <button type="button" className="btn-reset" onClick={limpiar}>
              Borrar los datos de este navegador
            </button>
          </footer>
        </>
      )}

      {toast && (
        <div className={`toast${toast.err ? ' err' : ''}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ---------------- utilidades locales ---------------- */

interface Entrada {
  nit: string;
  nombre: string;
}

function listaTerceros(docs: Doc[]): Entrada[] {
  const mapa = new Map<string, string>();
  for (const d of docs) if (d.nit && !mapa.has(d.nit)) mapa.set(d.nit, d.nombre);
  return Array.from(mapa, ([nit, nombre]) => ({ nit, nombre })).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es')
  );
}

/** Acepta "NOMBRE — NIT 123", un NIT suelto o parte del nombre. */
function filtrarPorNit(docs: Doc[], valor: string, entradas: Entrada[]): Doc[] {
  const v = valor.trim();
  if (!v) return docs;

  const m = v.match(/NIT\s+(\S+)\s*$/i);
  if (m) {
    const nit = m[1];
    if (entradas.some((e) => e.nit === nit)) return docs.filter((d) => d.nit === nit);
  }
  if (entradas.some((e) => e.nit === v)) return docs.filter((d) => d.nit === v);

  const q = v.toLowerCase();
  const parciales = docs.filter((d) => d.nombre.toLowerCase().includes(q) || d.nit.includes(q));
  return parciales.length ? parciales : docs;
}
