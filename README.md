# Cartera por edades

Tablero web para analizar cartera **por cobrar (CxC)** y **por pagar (CxP)** de
varias empresas, a partir del informe de edades en Excel.

Se sueltan los archivos y sale el análisis: antigüedad por tramo, concentración
por tercero, detalle navegable, cuadre contra el balance y evolución mensual.

> **Los archivos nunca salen del navegador.** No hay servidor de datos, no hay
> base de datos, no hay consultas SQL, no hay cuentas de usuario y no hay nada
> precargado. Todo el procesamiento ocurre en la máquina de quien abre la página.

---

## Por qué está hecho así

**No hay inicio de sesión ni datos precargados.** El despliegue es público. Si el
tablero trajera la cartera de una empresa de muestra, esa cartera quedaría en una
URL abierta. Arrancando vacío, cada quien ve solo los archivos que él mismo cargó.

**Todo se procesa en el cliente.** La plataforma de despliegue es *serverless*: un
archivo subido a una función no persiste. Como el caso de uso es *cargar y
analizar*, el navegador basta y elimina de raíz la exposición de datos.

**La ingesta es tolerante pero ruidosa.** Se aceptan sinónimos de cabecera,
tramos de cualquier corte y columnas faltantes. Lo que no ocurre nunca es que una
hoja se descarte en silencio: cada rechazo, deducción o dato que falta produce una
nota visible en pantalla.

---

## Qué muestra

| Sección | Qué responde |
|---|---|
| **Resumen** | Totales por cartera, posición neta, lo vencido a más de 180 días y los anticipos |
| **Antigüedad por tramo** | Cuánto hay en cada tramo. Es un **control**: pulsar un tramo filtra todo el tablero |
| **Evolución mensual** | Cómo se movió el saldo mes a mes, con la variación contra el mes anterior |
| **Cuadre contra el balance** | Si el informe cuadra contra la contabilidad, por empresa y cartera |
| **Mayores saldos** | Los diez terceros de mayor saldo. Pulsar uno lo agrega a la comparación (hasta 5) |
| **Detalle** | Documento a documento, agrupado por tercero, buscable y exportable a CSV |

**Una sola selección manda en todo**: qué cartera, qué tramo y qué terceros.
Tener un filtro por tarjeta los deja desincronizados y se termina viendo el tramo
de una cartera con el detalle de la otra.

### Cartera bruta vs. neta

El tablero separa la cartera real de los anticipos por el PUC, y **por defecto
muestra la bruta**. No es un detalle cosmético: en la CxP de Mercamio al
31-ago-2026 los anticipos son 6.171 millones, un 26 % del total. Un tablero que
suma todo a ciegas muestra una cifra que no es la que el contador llama «cuentas
por pagar». El interruptor está arriba, junto al selector de empresa.

### Evolución mensual y su límite

La gráfica se arma con los cortes que se hayan subido: **un informe es la foto de
un día, no una historia**. Con un solo archivo hay una columna; con doce meses,
doce. Los agregados mensuales quedan guardados en el navegador, así que la serie
crece sola a medida que se suben los informes de cada mes.

Si un mes trae menos empresas que los demás, esa columna se dibuja **rayada**:
sin esa marca, la caída se confundiría con un pago.

El historial se puede **exportar e importar** como archivo, que es la única forma
de que la serie armada en un equipo se vea en otro. El archivo lleva solo
agregados por mes, empresa y cartera: ni un NIT ni un documento.

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
npx tsx scripts/verificar-archivo.ts "informe1.xlsx" "informe2.xlsx"
```

El último lee los informes con el **mismo código** que el tablero e imprime lo
que entendió: empresa, corte, cartera bruta contra anticipos, tramos, cuadre y
notas. Es el primer paso obligado cuando entra una empresa nueva. No imprime
datos de terceros, así que su salida se puede pegar en un ticket.

---

## Despliegue

Pensado para Vercel. Es una aplicación estática de Next.js sin rutas de API:
importar el repositorio y aceptar los valores por defecto. No hay variables de
entorno que configurar.

Las cabeceras de seguridad (`noindex`, `X-Frame-Options`, `Referrer-Policy`) se
definen en [`next.config.mjs`](next.config.mjs).

---

## Qué debe traer el archivo

El contrato completo está en **[docs/ESTANDAR-ARCHIVO.md](docs/ESTANDAR-ARCHIVO.md)**.

Lo mínimo: el nombre de la empresa en la primera columna, la etiqueta
`fecha corte` con su fecha, y una fila de cabecera con **nombre del tercero** y
**saldo**. La columna de cuenta contable no es obligatoria pero sin ella los
anticipos dejan de separarse.

> **Trampa conocida del ERP:** el generador escribe «Merkmios» junto a la
> etiqueta `fecha corte` en **todos** los informes, sean de la empresa que sean.
> Por eso la empresa se lee de la primera columna y nunca de ahí. Está comentado
> en [`lib/empresa.ts`](lib/empresa.ts) para que no se deshaga por accidente.

---

## Estructura

```
app/
  layout.tsx        tipografías, metadatos, tema
  page.tsx          orquestador: estado, carga de archivos, selección compartida
  globals.css       tokens de diseño y estilos
components/
  KpiGrid.tsx       cifras de cabecera
  AgingChart.tsx    barras de antigüedad — son un control, no un dibujo
  EvolucionChart.tsx  columnas mensuales en SVG
  CuadrePanel.tsx   cuadre contra el balance
  TopTable.tsx      concentración por tercero
  DetailTable.tsx   detalle navegable, búsqueda, exportación
  TramoEditor.tsx   umbrales de los tramos
  AvisosPanel.tsx   bitácora de lectura de los archivos
  Chip.tsx          distintivo de severidad
lib/
  parser.ts         ingesta del Excel — el estándar vive aquí
  empresa.ts        identificación de la empresa dueña del informe
  aggregate.ts      tramos, grupos, agrupaciones, cuadre, serie mensual, CSV
  almacen.ts        persistencia en el navegador, exportación del historial
  escala.ts         escala del eje con marcas en cifras redondas
  format.ts         moneda, fechas y normalización de texto
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
ΔE 13,6 en visión normal (el piso es 15) y el amarillo da 1,79:1 de contraste
contra el fondo claro.

En su lugar, cada gráfico usa una **rampa ordinal de un solo tono** —azul para
por cobrar, naranja para por pagar— donde el contraste contra el fondo aumenta
con la mora. Las cuatro rampas (dos tonos × dos temas) pasan monotonía de
luminosidad, separación entre pasos y contraste mínimo.

Los colores de estado (verde / ámbar / naranja / rojo) se conservan en los
distintivos de las tablas, donde siempre van acompañados del texto del tramo, de
modo que el color nunca carga el significado por sí solo.

En la evolución mensual, la variación contra el mes anterior va en tinta apagada
con una flecha y **no** en verde/rojo: que la cartera suba no es bueno ni malo por
sí mismo —en CxC puede ser más venta y en CxP más plazo— y pintarlo de color
sería opinar, no informar.

Cada gráfico tiene además vista de tabla o descripción para lectores de pantalla,
y las barras de antigüedad se recorren con el teclado.

---

## Limitaciones conocidas

- **El historial vive en cada navegador.** No se comparte entre personas ni entre
  equipos, y se pierde si se limpian los datos del sitio. Para eso está la
  exportación.
- **El detalle puede no persistir.** Tres empresas son unas 19.000 filas por
  corte y el almacenamiento local son unos 5 MB. Cuando no cabe, se conserva solo
  el historial mensual —la gráfica sobrevive— y hay que volver a soltar los
  archivos para ver el detalle. El tablero lo dice cuando pasa.
- **Un corte por vez en el detalle.** La antigüedad y el detalle muestran una
  sola fecha; cruzar meses ahí duplicaría documentos.

---

Desarrollado para **Teams** — Henry Morales.
