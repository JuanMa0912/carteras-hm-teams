# Cartera por edades

Tablero web para analizar cartera **por cobrar (CxC)** y **por pagar (CxP)** a
partir del reporte de edades en Excel.

Se arrastra el archivo, y sale el análisis: antigüedad por tramo, concentración
por tercero, detalle navegable y el cuadre contra el balance que el propio
reporte trae.

> **El archivo nunca sale del navegador.** No hay servidor de datos, no hay base
> de datos, no hay cuentas de usuario y no hay nada precargado. Todo el
> procesamiento ocurre en la máquina de quien abre la página.

---

## Por qué está hecho así

Tres decisiones que explican el resto del diseño:

**No hay inicio de sesión ni datos precargados.** El despliegue es público. Si el
tablero trajera la cartera de una empresa de muestra, esa cartera quedaría en una
URL abierta. Arrancando vacío, el problema desaparece: cada quien ve solo el
archivo que él mismo cargó.

**Todo se procesa en el cliente.** La plataforma de despliegue es *serverless*: un
archivo subido a una función no persiste, existe mientras dura la invocación. Un
"subidor de archivos" real necesitaría almacenamiento de objetos y base de datos.
Como el caso de uso es *cargar y analizar ahora*, el navegador basta y elimina de
raíz la exposición de datos.

**La ingesta es tolerante pero ruidosa.** El tablero acepta sinónimos de
cabecera, tramos de cualquier corte y columnas faltantes. Lo que no hace nunca es
descartar una hoja en silencio: cada rechazo, deducción o dato faltante produce
una nota visible en pantalla.

---

## Puesta en marcha

```bash
npm install
npm run dev      # http://localhost:3000
```

Otros comandos:

```bash
npm run build      # build de producción
npm run typecheck  # tsc --noEmit
npx tsx scripts/verificar-archivo.ts "ruta/al/reporte.xlsx"
```

El último lee un Excel con el mismo parser que el tablero e imprime lo que
entendió — hojas, totales, tramos, cuadre y notas. Útil para validar un export
nuevo sin abrir el navegador. No imprime datos de terceros.

---

## Despliegue

Pensado para Vercel. Al ser una aplicación estática de Next.js sin rutas de API,
el despliegue es directo: importar el repositorio y aceptar los valores por
defecto. No hay variables de entorno que configurar.

Las cabeceras de seguridad (`noindex`, `X-Frame-Options`, `Referrer-Policy`) se
definen en [`next.config.mjs`](next.config.mjs).

---

## Qué debe traer el archivo

El contrato completo está en **[docs/ESTANDAR-ARCHIVO.md](docs/ESTANDAR-ARCHIVO.md)**.

Resumen: una fila de cabecera con una columna de **nombre del tercero** y otra de
**saldo**. Todo lo demás es opcional. Los tramos se detectan solos a partir de
cabeceras como `31 a 90 dias` o `Mas de 360 dias`, sean cuales sean los cortes.

---

## Estructura

```
app/
  layout.tsx        tipografías, metadatos, tema
  page.tsx          orquestador: estado, carga de archivo, disposición
  globals.css       tokens de diseño y estilos
components/
  KpiGrid.tsx       cifras de cabecera
  AgingChart.tsx    barras de antigüedad por tramo
  CuadrePanel.tsx   cuadre contra el balance
  TopTable.tsx      concentración por tercero
  DetailTable.tsx   detalle navegable, filtros, exportación
  TramoEditor.tsx   umbrales de los tramos
  AvisosPanel.tsx   bitácora de lectura del archivo
  Chip.tsx          distintivo de severidad
lib/
  parser.ts         ingesta del Excel — el estándar vive aquí
  aggregate.ts      tramos, agrupaciones, cuadre, exportación CSV
  format.ts         formato de moneda, fechas y normalización de texto
  types.ts          contratos de datos
scripts/
  verificar-archivo.ts  verificador de ingesta por línea de comandos
docs/
  ESTANDAR-ARCHIVO.md   contrato del archivo de entrada
```

---

## Sobre los colores

Los tramos de antigüedad no usan la rampa verde → amarillo → rojo habitual. Esa
combinación falla las pruebas de accesibilidad: el par amarillo/naranja queda a
ΔE 13.6 en visión normal (el piso es 15) y el amarillo da 1.79:1 de contraste
contra el fondo claro — invisible para varias personas y en impresión a escala de
grises.

En su lugar, cada gráfico usa una **rampa ordinal de un solo tono** — azul para
por cobrar, naranja para por pagar — donde el contraste contra el fondo aumenta
con la mora. Las cuatro rampas (dos tonos × dos temas) pasan monotonía de
luminosidad, separación entre pasos y contraste mínimo.

Los colores de estado (verde / ámbar / naranja / rojo) se conservan en los
distintivos de las tablas, donde siempre van acompañados del texto del tramo, de
modo que el color nunca carga el significado por sí solo.

Cada gráfico tiene además vista de tabla, barras navegables por teclado y
descripción para lectores de pantalla. Los saldos a favor (anticipos, notas
crédito) se dibujan con textura diagonal, porque su longitud representa magnitud,
no deuda.

---

## Limitaciones conocidas

- **Sin histórico.** Cada carga reemplaza a la anterior; no hay comparación entre
  periodos.
- **Un archivo a la vez.** No consolida varias empresas en una sola vista.
- **La copia local puede no guardarse.** El último archivo cargado se conserva en
  el almacenamiento del navegador para sobrevivir a un refresco, pero si el
  archivo es muy grande o el almacenamiento está lleno, simplemente no persiste.
  Hay un botón para borrarla.

---

Desarrollado para **Teams** — Henry Morales.
