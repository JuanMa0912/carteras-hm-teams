'use client';

/**
 * Pantalla inicial. El tablero no trae datos precargados a propósito: así no
 * hay cartera de ningún cliente publicada en una URL abierta, y el archivo
 * nunca sale del equipo de quien lo abre.
 */
export default function EmptyState({ onElegir }: { onElegir: () => void }) {
  return (
    <div className="empty-state">
      <h2>Carga el reporte de edades</h2>
      <p>
        Arrastra aquí el archivo <code>.xlsx</code> de cartera por edades, o búscalo en tu equipo. El tablero
        reconoce las hojas de cartera por cobrar y por pagar, las clasifica y las cruza contra el cuadre
        contable que trae el propio archivo.
      </p>
      <div className="cta">
        <button type="button" className="btn primary" onClick={onElegir}>
          ⇪ Elegir archivo .xlsx
        </button>
      </div>

      <div className="spec">
        <div className="section-label">Qué debe traer el archivo</div>
        <p style={{ margin: '0 0 12px' }}>
          Mínimo indispensable: una fila de cabecera con una columna de <strong>nombre del tercero</strong> y
          otra de <strong>saldo</strong>. Todo lo demás es opcional y mejora el análisis.
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
              <td>Fecha de vencimiento</td>
              <td>
                <code>fecha_vcto</code> <code>fecha vencimiento</code>
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
        El archivo se lee en tu navegador. No se sube a ningún servidor ni se guarda en internet.
      </div>
    </div>
  );
}
