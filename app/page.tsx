'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { leerArchivos } from '@/lib/parser';
import {
  aCsv, aplicarAnticipos, calcularCuadre, sanearUmbrales, serieMensual, tramoDe, tramosDe,
  totalDe, totalDeGrupo, UMBRALES_POR_DEFECTO, type ModoAnticipos,
} from '@/lib/aggregate';
import {
  cargar, exportarHistorial, fundirHistorial, guardar, historialDeCortes,
  HistorialInvalidoError, importarHistorial, limpiar,
} from '@/lib/almacen';
import { CONSOLIDADO, etiquetaScope } from '@/lib/empresa';
import { fmtDate, fmtMoney, fmtNum, NOTA_ESCALA, type Escala } from '@/lib/format';
import type { Aviso, Corte, DocVista, PuntoHistorial, Tipo } from '@/lib/types';

import AgingChart from '@/components/AgingChart';
import AvisosPanel from '@/components/AvisosPanel';
import CuadrePanel from '@/components/CuadrePanel';
import DetailTable from '@/components/DetailTable';
import EmptyState from '@/components/EmptyState';
import EvolucionChart from '@/components/EvolucionChart';
import KpiGrid from '@/components/KpiGrid';
import TopTable from '@/components/TopTable';
import TramoEditor from '@/components/TramoEditor';

const CLAVE_TEMA = 'cartera-hm:tema';

/** Cuántos terceros se pueden comparar a la vez. Más y el agregado deja de decir cuál se movió. */
const MAX_TERCEROS = 5;

/**
 * UNA sola selección manda en todo el tablero: qué cartera, qué tramo y qué
 * terceros. Tener un filtro por tarjeta los deja desincronizados y se termina
 * viendo el tramo de una cartera con el detalle de la otra.
 */
interface Seleccion {
  tipo: Tipo;
  tramo: string | null;
  nits: string[];
}

export default function Page() {
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [historial, setHistorial] = useState<PuntoHistorial[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [detalleDescartado, setDetalleDescartado] = useState(false);

  const [scope, setScope] = useState<string>(CONSOLIDADO);
  const [fechaSel, setFechaSel] = useState<string>('');
  const [modo, setModo] = useState<ModoAnticipos>('bruta');
  const [escala, setEscala] = useState<Escala>(1);
  const [umbrales, setUmbrales] = useState<number[]>([...UMBRALES_POR_DEFECTO]);
  const [sel, setSel] = useState<Seleccion>({ tipo: 'CXC', tramo: null, nits: [] });

  const [arrastrando, setArrastrando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [tema, setTema] = useState<'auto' | 'light' | 'dark'>('auto');
  const inputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const avisar = useCallback((msg: string, err = false) => setToast({ msg, err }), []);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 6000);
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

  /* ---------- restaurar ---------- */
  useEffect(() => {
    const g = cargar();
    if (g.historial.length) setHistorial(g.historial);
    if (g.cortes.length) setCortes(g.cortes);
  }, []);

  /* ---------- carga de archivos ---------- */
  const procesar = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setCargando(true);
      try {
        const r = await leerArchivos(files);
        setAvisos(r.avisos);
        if (!r.cortes.length) {
          avisar('No se reconoció ningún corte. Revisa las notas de lectura.', true);
          return;
        }

        /* Un corte que ya estaba se reemplaza por el nuevo: es lo que se
         * espera al volver a subir un informe corregido. */
        const fusion = new Map<string, Corte>();
        for (const c of cortes) fusion.set(c.id, c);
        for (const c of r.cortes) fusion.set(c.id, c);
        const todos = Array.from(fusion.values()).sort(
          (a, b) => a.fecha.localeCompare(b.fecha) || a.empresaNombre.localeCompare(b.empresaNombre, 'es')
        );

        const hist = fundirHistorial(historial, historialDeCortes(r.cortes));
        setCortes(todos);
        setHistorial(hist);
        setDetalleDescartado(guardar(hist, todos));

        /* Se muestra el corte más reciente de los que acaban de entrar. */
        const ultima = r.cortes.reduce((a, c) => (c.fecha > a ? c.fecha : a), r.cortes[0].fecha);
        setFechaSel(ultima);
        setSel({ tipo: 'CXC', tramo: null, nits: [] });

        const empresas = new Set(r.cortes.map((c) => c.empresaId)).size;
        const meses = new Set(r.cortes.map((c) => c.mes)).size;
        avisar(
          `${r.cortes.length} corte${r.cortes.length === 1 ? '' : 's'} cargado${
            r.cortes.length === 1 ? '' : 's'
          }: ${empresas} empresa${empresas === 1 ? '' : 's'}, ${meses} mes${meses === 1 ? '' : 'es'}.`
        );
      } catch (e) {
        avisar('No se pudo leer: ' + (e instanceof Error ? e.message : String(e)), true);
      } finally {
        setCargando(false);
      }
    },
    [avisar, cortes, historial]
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
      const fs = Array.from(e.dataTransfer?.files ?? []);
      if (fs.length) void procesar(fs);
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

  const empresas = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cortes) m.set(c.empresaId, c.empresaNombre);
    for (const p of historial) if (!m.has(p.empresaId)) m.set(p.empresaId, p.empresaNombre);
    return Array.from(m, ([id, nombre]) => ({ id, nombre })).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es')
    );
  }, [cortes, historial]);

  const fechas = useMemo(
    () => Array.from(new Set(cortes.map((c) => c.fecha))).sort((a, b) => b.localeCompare(a)),
    [cortes]
  );

  /* La fecha seleccionada tiene que existir; si se borró un corte, cae a la más reciente. */
  const fecha = fechas.includes(fechaSel) ? fechaSel : (fechas[0] ?? '');

  const empresasScope = useMemo(
    () => (scope === CONSOLIDADO ? empresas.map((e) => e.id) : [scope]),
    [scope, empresas]
  );

  /**
   * Cortes en pantalla: UNA fecha, las empresas del scope.
   *
   * La fecha única es deliberada: sumar cortes de meses distintos duplicaría
   * los documentos que siguen abiertos en los dos. La evolución es lo único
   * que cruza fechas, y lo hace sobre agregados.
   */
  const cortesVista = useMemo(
    () => cortes.filter((c) => c.fecha === fecha && empresasScope.includes(c.empresaId)),
    [cortes, fecha, empresasScope]
  );

  const multiempresa = cortesVista.length > 1;

  /** Documentos de una cartera, ya marcados con su empresa y filtrados por anticipos. */
  const docsDe = useCallback(
    (tipo: Tipo): DocVista[] => {
      const out: DocVista[] = [];
      for (const c of cortesVista) {
        const cartera = c.carteras[tipo];
        if (!cartera) continue;
        for (const d of aplicarAnticipos(cartera.docs, modo)) {
          out.push({ ...d, empresaId: c.empresaId, empresaNombre: c.empresaNombre });
        }
      }
      return out;
    },
    [cortesVista, modo]
  );

  const baseCxc = useMemo(() => docsDe('CXC'), [docsDe]);
  const baseCxp = useMemo(() => docsDe('CXP'), [docsDe]);

  const anticipos = useMemo(() => {
    let c = 0;
    let p = 0;
    for (const corte of cortesVista) {
      if (corte.carteras.CXC) c += totalDeGrupo(corte.carteras.CXC.docs, 'anticipo');
      if (corte.carteras.CXP) p += totalDeGrupo(corte.carteras.CXP.docs, 'anticipo');
    }
    return { cxc: c, cxp: p };
  }, [cortesVista]);

  /** Aplica la selección (tramo + terceros) a una cartera. */
  const aplicarSeleccion = useCallback(
    (docs: DocVista[], tipo: Tipo): DocVista[] => {
      let out = docs;
      if (sel.tramo && sel.tipo === tipo) out = out.filter((d) => tramoDe(d, tramos).key === sel.tramo);
      if (sel.nits.length) {
        const set = new Set(sel.nits);
        out = out.filter((d) => set.has(d.nit));
      }
      return out;
    },
    [sel, tramos]
  );

  const cxcSel = useMemo(() => aplicarSeleccion(baseCxc, 'CXC'), [baseCxc, aplicarSeleccion]);
  const cxpSel = useMemo(() => aplicarSeleccion(baseCxp, 'CXP'), [baseCxp, aplicarSeleccion]);

  const serieCxc = useMemo(() => serieMensual(historial, 'CXC', empresasScope), [historial, empresasScope]);
  const serieCxp = useMemo(() => serieMensual(historial, 'CXP', empresasScope), [historial, empresasScope]);

  const hayDatos = cortes.length > 0;
  const hayHistorial = historial.length > 0;

  /* ---------- acciones ---------- */
  function alternarTramo(tipo: Tipo, key: string) {
    setSel((s) => (s.tipo === tipo && s.tramo === key ? { ...s, tramo: null } : { ...s, tipo, tramo: key }));
  }

  function alternarTercero(tipo: Tipo, nit: string) {
    if (!nit) return;
    setSel((s) => {
      if (s.nits.includes(nit)) return { ...s, tipo, nits: s.nits.filter((n) => n !== nit) };
      if (s.nits.length >= MAX_TERCEROS) {
        avisar(`Se pueden comparar hasta ${MAX_TERCEROS} terceros a la vez. Suelta uno primero.`, true);
        return s;
      }
      return { ...s, tipo, nits: [...s.nits, nit] };
    });
  }

  const nombrePorNit = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of [...baseCxc, ...baseCxp]) if (d.nit && !m.has(d.nit)) m.set(d.nit, d.nombre);
    return m;
  }, [baseCxc, baseCxp]);

  function exportar(docs: DocVista[]) {
    const csv = aCsv(docs, tramos);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cartera-${sel.tipo.toLowerCase()}-${fecha || 'sin-corte'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    avisar(`${fmtNum(docs.length)} documentos exportados a CSV.`);
  }

  function descargarHistorial() {
    const blob = new Blob([exportarHistorial(historial)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-cartera-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    avisar(`Historial exportado: ${fmtNum(historial.length)} registros.`);
  }

  async function cargarHistorial(file: File) {
    try {
      const texto = await file.text();
      const nuevos = importarHistorial(texto);
      const fundido = fundirHistorial(historial, nuevos);
      setHistorial(fundido);
      setDetalleDescartado(guardar(fundido, cortes));
      avisar(`Historial importado: ${fmtNum(nuevos.length)} registros.`);
    } catch (e) {
      avisar(
        e instanceof HistorialInvalidoError ? e.message : 'No se pudo leer el historial.',
        true
      );
    }
  }

  function borrarTodo() {
    setCortes([]);
    setHistorial([]);
    setAvisos([]);
    setSel({ tipo: 'CXC', tramo: null, nits: [] });
    limpiar();
    avisar('Datos e historial borrados de este navegador.');
  }

  /* ---------- render ---------- */
  return (
    <div className="wrap">
      {arrastrando && <div id="dropHint">Suelta los archivos para cargarlos</div>}

      <div className="topbar">
        <div className="brand">
          <div className="mark" aria-hidden="true">$</div>
          <div>
            <h1>Cartera por edades</h1>
            <div className="company">
              {hayDatos ? etiquetaScope(scope, empresas) : 'Sin archivos cargados'}
            </div>
          </div>
        </div>

        <div className="head-right">
          {hayDatos && (
            <>
              <div className="scale-toggle" role="group" aria-label="Escala de las cifras">
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
              <div className="stamp">{fecha ? `Corte ${fmtDate(fecha)}` : 'Sin corte'}</div>
            </>
          )}
          <button type="button" className="btn small" onClick={alternarTema} title="Cambiar tema">
            ◐ Tema
          </button>
          <button type="button" className="btn primary" onClick={() => inputRef.current?.click()} disabled={cargando}>
            {cargando ? 'Leyendo…' : `⇪ ${hayDatos ? 'Cargar más archivos' : 'Cargar archivos .xlsx'}`}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length) void procesar(fs);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {!hayDatos ? (
        <>
          <EmptyState
            onElegir={() => inputRef.current?.click()}
            onImportarHistorial={() => importRef.current?.click()}
            hayHistorial={hayHistorial}
          />
          {avisos.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <AvisosPanel avisos={avisos} />
            </section>
          )}
        </>
      ) : (
        <>
          {/* ---------- qué se está viendo ---------- */}
          <section>
            <div className="section-label">Qué se está viendo</div>
            <div className="card">
              <div className="vista-grid">
                <div className="field">
                  <label className="field-label" htmlFor="fEmpresa">Empresa</label>
                  <select id="fEmpresa" value={scope} onChange={(e) => setScope(e.target.value)}>
                    <option value={CONSOLIDADO}>
                      {empresas.length === 1 ? empresas[0].nombre : `Las ${empresas.length} empresas`}
                    </option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="fCorte">Corte</label>
                  <select id="fCorte" value={fecha} onChange={(e) => setFechaSel(e.target.value)}>
                    {fechas.map((f) => (
                      <option key={f} value={f}>{fmtDate(f)}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <span className="field-label">Anticipos</span>
                  <div className="scale-toggle" role="group" aria-label="Tratamiento de anticipos">
                    <button
                      type="button" className="scale-btn" aria-pressed={modo === 'bruta'}
                      onClick={() => setModo('bruta')}
                      title="Solo las cuentas de cartera; los anticipos quedan aparte"
                    >
                      Cartera bruta
                    </button>
                    <button
                      type="button" className="scale-btn" aria-pressed={modo === 'neta'}
                      onClick={() => setModo('neta')}
                      title="Descuenta los anticipos del total"
                    >
                      Neta
                    </button>
                  </div>
                </div>

                <div className="field vista-resumen">
                  <span className="field-label">Cortes cargados</span>
                  <span className="num">
                    {fmtNum(cortes.length)} · {fmtNum(empresas.length)} empresa
                    {empresas.length === 1 ? '' : 's'} · {fmtNum(new Set(historial.map((h) => h.mes)).size)} mes
                    {new Set(historial.map((h) => h.mes)).size === 1 ? '' : 'es'} en el historial
                  </span>
                </div>
              </div>

              {modo === 'bruta' && (
                <p className="nota-modo">
                  <strong>Cartera bruta:</strong> solo las cuentas de cartera del PUC. Los anticipos
                  ({fmtMoney(anticipos.cxc + anticipos.cxp, escala)}) van aparte y no rebajan estos totales.
                </p>
              )}

              {(sel.tramo || sel.nits.length > 0) && (
                <div className="seleccion-activa">
                  <span className="field-label">Filtro activo</span>
                  {sel.tramo && (
                    <button type="button" className="filter-chip activo" onClick={() => setSel((s) => ({ ...s, tramo: null }))}>
                      {sel.tipo === 'CXC' ? 'Por cobrar' : 'Por pagar'} ·{' '}
                      {tramos.find((t) => t.key === sel.tramo)?.etiqueta} ✕
                    </button>
                  )}
                  {sel.nits.map((n) => (
                    <button key={n} type="button" className="filter-chip activo" onClick={() => alternarTercero(sel.tipo, n)}>
                      {nombrePorNit.get(n) ?? n} ✕
                    </button>
                  ))}
                  <button type="button" className="btn-reset" onClick={() => setSel({ tipo: sel.tipo, tramo: null, nits: [] })}>
                    Quitar todo
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ---------- resumen ---------- */}
          <section>
            <div className="section-label">
              Resumen {NOTA_ESCALA[escala] && <>— {NOTA_ESCALA[escala]}</>}
            </div>
            <KpiGrid
              docsCxc={cxcSel}
              docsCxp={cxpSel}
              anticiposCxc={anticipos.cxc}
              anticiposCxp={anticipos.cxp}
              modo={modo}
              tramos={tramos}
              escala={escala}
            />
          </section>

          {/* ---------- antigüedad ---------- */}
          <section>
            <div className="section-label-row">
              <div className="section-label">Antigüedad de saldos por tramo — pulsa un tramo para filtrar el tablero</div>
              <TramoEditor umbrales={umbrales} onChange={(u) => setUmbrales(sanearUmbrales(u))} />
            </div>
            <div className="chart-grid">
              {(['CXC', 'CXP'] as Tipo[]).map((tipo) => {
                const docs = tipo === 'CXC' ? cxcSel : cxpSel;
                const base = tipo === 'CXC' ? baseCxc : baseCxp;
                if (!base.length) return null;
                return (
                  <div className="card" key={tipo}>
                    <div className="chart-title">
                      <span className="dot" style={{ background: tipo === 'CXC' ? 'var(--cxc)' : 'var(--cxp)' }} aria-hidden="true" />
                      <h3>{tipo === 'CXC' ? 'Cuentas por cobrar' : 'Cuentas por pagar'}</h3>
                      <span className="tot num">{fmtMoney(totalDe(docs), escala)}</span>
                    </div>
                    <div className="chart-scope">
                      {fmtNum(docs.length)}
                      {docs.length !== base.length && ` de ${fmtNum(base.length)}`} documentos
                    </div>
                    <AgingChart
                      tipo={tipo}
                      docs={docs}
                      tramos={tramos}
                      escala={escala}
                      tramoActivo={sel.tipo === tipo ? sel.tramo : null}
                      onTramo={alternarTramo}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------- evolución ---------- */}
          <section>
            <details className="collapsible" open>
              <summary className="collapsible-summary section-label">
                <span className="chev" aria-hidden="true">▾</span>
                Evolución mensual · {fmtNum(new Set(historial.map((h) => h.mes)).size)} mes
                {new Set(historial.map((h) => h.mes)).size === 1 ? '' : 'es'} acumulado
                {new Set(historial.map((h) => h.mes)).size === 1 ? '' : 's'}
              </summary>
              <div className="collapsible-body">
                <div className="card">
                  {/*
                    Las DOS gráficas, cada una con su propio eje. Por cobrar
                    anda en cientos de millones y por pagar en miles: un eje
                    compartido dejaría la primera pegada al piso.
                  */}
                  <EvolucionChart
                    titulo="Cuentas por cobrar"
                    serie={serieCxc}
                    color="var(--cxc)"
                    modo={modo}
                    empresasEsperadas={empresasScope.length}
                  />
                  <EvolucionChart
                    titulo="Cuentas por pagar"
                    serie={serieCxp}
                    color="var(--cxp)"
                    modo={modo}
                    empresasEsperadas={empresasScope.length}
                  />
                  <div className="historial-acciones">
                    <button type="button" className="btn small" onClick={descargarHistorial} disabled={!hayHistorial}>
                      ⤓ Exportar historial
                    </button>
                    <button type="button" className="btn small" onClick={() => importRef.current?.click()}>
                      ⇪ Importar historial
                    </button>
                    <span className="muted" style={{ fontSize: 12 }}>
                      El historial vive en este navegador. Expórtalo para verlo en otro equipo.
                    </span>
                  </div>
                </div>
              </div>
            </details>
          </section>

          {/* ---------- cuadre ---------- */}
          <section>
            <details className="collapsible">
              <summary className="collapsible-summary section-label">
                <span className="chev" aria-hidden="true">▾</span>
                Cuadre contra el balance
              </summary>
              <div className="collapsible-body">
                <div className="cuadre-grid">
                  {cortesVista.flatMap((c) =>
                    (['CXC', 'CXP'] as Tipo[]).map((tipo) => {
                      const cartera = c.carteras[tipo];
                      if (!cartera) return null;
                      return (
                        <CuadrePanel
                          key={c.id + tipo}
                          ds={cartera}
                          cuadre={calcularCuadre(cartera)}
                          escala={escala}
                          titulo={`${multiempresa ? c.empresaNombre + ' · ' : ''}${
                            tipo === 'CXC' ? 'Por cobrar' : 'Por pagar'
                          }`}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            </details>
          </section>

          {/* ---------- concentración ---------- */}
          <section>
            <details className="collapsible">
              <summary className="collapsible-summary section-label">
                <span className="chev" aria-hidden="true">▾</span>
                Mayores saldos — pulsa un tercero para compararlo
              </summary>
              <div className="collapsible-body">
                <div className="chart-grid">
                  {baseCxc.length > 0 && (
                    <TopTable tipo="CXC" docs={cxcSel} tramos={tramos} escala={escala} nitsActivos={sel.nits} onTercero={alternarTercero} />
                  )}
                  {baseCxp.length > 0 && (
                    <TopTable tipo="CXP" docs={cxpSel} tramos={tramos} escala={escala} nitsActivos={sel.nits} onTercero={alternarTercero} />
                  )}
                </div>
              </div>
            </details>
          </section>

          {/* ---------- detalle ---------- */}
          <section>
            <details className="collapsible">
              <summary className="collapsible-summary section-label">
                <span className="chev" aria-hidden="true">▾</span>
                Detalle de cartera
              </summary>
              <div className="collapsible-body">
                <DetailTable
                  tipo={sel.tipo}
                  onTipo={(t) => setSel((s) => ({ ...s, tipo: t, tramo: null }))}
                  docs={sel.tipo === 'CXC' ? cxcSel : cxpSel}
                  tramos={tramos}
                  escala={escala}
                  multiempresa={multiempresa}
                  onExportar={exportar}
                />
              </div>
            </details>
          </section>

          {avisos.length > 0 && (
            <section>
              <AvisosPanel avisos={avisos} />
            </section>
          )}

          {detalleDescartado && (
            <div className="aviso aviso-warn" style={{ marginBottom: 20 }}>
              <span className="tag">Almacenamiento</span>
              <span>
                El detalle de los cortes no cupo en este navegador, así que solo se guardó el historial mensual.
                La gráfica de evolución se conserva; para volver a ver el detalle, suelta otra vez los archivos.
              </span>
            </div>
          )}

          <footer className="pie">
            <span>
              {cortesVista.map((c) => c.archivo).join(" · ") || "—"} — procesados en este navegador, sin enviarse a ningún servidor.
            </span>
            <button type="button" className="btn-reset" onClick={borrarTodo}>
              Borrar datos e historial de este navegador
            </button>
          </footer>
        </>
      )}

      <input
        ref={importRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void cargarHistorial(f);
          e.target.value = '';
        }}
      />

      {toast && (
        <div className={`toast${toast.err ? ' err' : ''}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
