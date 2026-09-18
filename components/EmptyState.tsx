'use client';

/**
 * Pantalla inicial. El tablero no trae datos precargados a propósito: así no
 * hay cartera de ningún cliente publicada en una URL abierta, y el archivo
 * nunca sale del equipo de quien lo abre.
 */
export default function EmptyState({
  onElegir,
  onImportarHistorial,
  hayHistorial,
}: {
  onElegir: () => void;
  onImportarHistorial: () => void;
  hayHistorial: boolean;
}) {
  return (
    <div className="empty-state">
      <h2>Carga los informes de edades</h2>
      <p>
        Arrastra aquí los archivos <code>.xlsx</code> de cartera por edades. Puedes soltar varios a la vez:
        una empresa por archivo, o varios meses de la misma empresa. Cada combinación de empresa y fecha de
        corte queda como un corte independiente.
      </p>
      <p>
        El tablero reconoce las hojas de cartera por cobrar y por pagar, separa los anticipos de la cartera
        real y cruza cada corte contra el cuadre contable que trae el propio archivo.
      </p>
      <div className="cta">
        <button type="button" className="btn primary" onClick={onElegir}>
          ⇪ Elegir archivos .xlsx
        </button>
        <button type="button" className="btn" onClick={onImportarHistorial}>
          ⇪ Importar historial
        </button>
      </div>
      {hayHistorial && (
        <p style={{ marginTop: 14, fontSize: 12.5 }}>
          Hay historial mensual guardado en este navegador, pero no el detalle. Suelta un archivo para volver
          a ver la antigüedad y el detalle.
        </p>
      )}

      <div className="spec">
        <div className="section-label">Qué debe traer cada archivo</div>
        <p style={{ margin: '0 0 12px' }}>
          Mínimo indispensable: una fila de cabecera con una columna de <strong>nombre del tercero</strong> y
          otra de <strong>saldo</strong>, y la etiqueta <code>fecha corte</code> en el encabezado. El nombre de
          la empresa se lee de la primera columna.
        </p>
        <table>
          <thead>
            <tr>
              <th>Columna</th>
              <th>Nombres aceptados</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Tercero <strong>(obligatoria)</strong>
              </td>
              <td>
                <code>proveedor</code> <code>cliente</code> <code>tercero</code> <code>razon social</code>{' '}
                <code>nombre</code>
              </td>
            </tr>
            <tr>
              <td>
                Saldo <strong>(obligatoria)</strong>
              </td>
              <td>
                <code>saldo</code> <code>valor</code> <code>saldo total</code>
              </td>
            </tr>
            <tr>
              <td>Cuenta contable</td>
              <td>
                <code>cuenta_contable</code> <code>cuenta</code> — decide qué es cartera y qué es anticipo
              </td>
            </tr>
            <tr>
              <td>NIT</td>
              <td>
                <code>nit</code> <code>identificacion</code> <code>cedula</code>
              </td>
            </tr>
            <tr>
              <td>Días vencidos</td>
              <td>
                <code>d_venc</code> <code>dias vencidos</code> <code>edad</code>
              </td>
            </tr>
            <tr>
              <td>Tramos</td>
              <td>
                Cualquier cabecera con la forma <code>31 a 90 dias</code> o <code>Mas de 360 dias</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: 12 }}>
          Si falta una columna obligatoria, el tablero lo dice y muestra qué encontró en su lugar. Ninguna hoja
          se descarta en silencio.
        </p>
      </div>

      <div className="privacy">
        <span aria-hidden="true">🔒</span>
        Los archivos se leen en tu navegador. No se suben a ningún servidor ni se guardan en internet.
      </div>
    </div>
  );
}
