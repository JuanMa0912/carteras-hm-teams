# Estándar del archivo de cartera por edades

Este documento define qué debe traer un archivo `.xlsx` para que el tablero lo
lea. Está escrito para quien genera el reporte (contabilidad / TI), no para quien
programa.

La regla de fondo es una sola: **el tablero se adapta al archivo, no al revés**,
pero necesita poder identificar dos cosas sin ambigüedad — de quién es el saldo y
cuánto es.

---

## 1. Requisito mínimo

Una hoja se procesa si tiene una fila de cabecera con, al menos:

| Concepto | Nombres de columna aceptados |
|---|---|
| **Nombre del tercero** | `proveedor`, `cliente`, `tercero`, `razon social`, `nombre`, `nombre tercero`, `descripcion`, `beneficiario` |
| **Saldo** | `saldo`, `valor`, `saldo total`, `saldo cartera`, `saldo_total`, `valor saldo` |

Si falta cualquiera de las dos, la hoja **no se procesa** y el tablero muestra un
error que dice qué columnas sí encontró y cuáles no reconoció. Nunca falla en
silencio.

La comparación ignora mayúsculas, tildes y espacios de más: `Proveedor`,
`PROVEEDOR` y `proveedor ` son el mismo nombre.

---

## 2. Columnas opcionales

Cada una mejora el análisis; ninguna es obligatoria.

| Concepto | Nombres aceptados | Para qué sirve |
|---|---|---|
| Cuenta contable | `cuenta_contable`, `cuenta contable`, `cuenta`, `cta` | Deducir si la hoja es por cobrar o por pagar cuando el nombre de la hoja no lo dice |
| NIT | `nit`, `identificacion`, `cedula`, `nit/cc`, `id tercero` | Agrupar documentos del mismo tercero y permitir la búsqueda |
| Centro de operación | `c.o`, `co`, `centro operacion`, `sucursal` | Referencia |
| Documento | `documento`, `doc`, `factura`, `nro documento` | Identificar cada movimiento y buscarlo |
| Fecha del documento | `fecha_dcto`, `fecha dcto`, `fecha documento` | Referencia |
| Fecha de vencimiento | `fecha_vcto`, `fecha vcto`, `fecha vencimiento` | Mostrar el vencimiento y calcular días si no vienen |
| Días vencidos | `d_venc`, `dias vencidos`, `edad`, `dias` | Clasificar cada documento en su tramo |

> **Sobre los días vencidos.** Si la columna no existe pero sí hay fecha de
> vencimiento *y* fecha de corte, el tablero calcula los días contra el corte y lo
> reporta como nota. Si no hay ninguna de las dos, todos los documentos caen en el
> primer tramo y el análisis de antigüedad deja de ser confiable.

---

## 3. Columnas de tramo

El tablero reconoce automáticamente cualquier cabecera con estas formas:

- `Hasta 1 a 30 dias` → tramo 1 a 30
- `31 a 90 dias` → tramo 31 a 90
- `Mas de 360 dias` → tramo de 361 en adelante

Es decir: **no importa cuáles sean los cortes**. Si el reporte usa 15 / 45 / 90 /
180, el tablero lee esos tramos tal cual para el cuadre.

Estas columnas se usan **solo para verificar** que el archivo es internamente
consistente. Las barras del tablero se recalculan siempre desde los días
vencidos, que es lo que permite mover los umbrales en pantalla.

---

## 4. Bloque de encabezado (cuadre contable)

Todo lo que esté **arriba** de la fila de cabecera se interpreta así:

- **Nombre de la empresa**: el primer valor no vacío de la primera columna.
- **Cuentas del balance**: cualquier fila con un par `(texto o código, número)`.
  Solo se toma el primer par de cada fila.
- **`Total Saldo Balance`**: se reconoce por el texto y se usa como cifra de
  control.
- **`Dif`** (o `Diferencia`): la diferencia que el propio archivo declara.
- **Fecha de corte**: una celda con el texto `fecha corte` y, a su derecha, la
  fecha. Esa misma fila puede traer los totales por tramo, que se usan como
  segunda cifra de control.

El tablero compara el `Total Saldo Balance` contra la suma real de la columna de
saldo del detalle, y semaforiza:

| Diferencia | Veredicto |
|---|---|
| hasta $1 | **Cuadra** (redondeo) |
| hasta $1.000 | **Diferencia menor** |
| más de $1.000 | **Descuadre** |

---

## 5. Clasificación por cobrar / por pagar

En este orden:

1. **Nombre de la hoja** — `CXP`, `pagar` o `proveedor` → por pagar; `CXC`,
   `cobrar` o `cliente` → por cobrar.
2. **Cuenta contable (PUC)** — si la mayoría del saldo está en cuentas que
   empiezan por `2`, es por pagar; por `1`, por cobrar.
3. **Signo del saldo total** — negativo → por pagar.

El tablero siempre informa en las notas de lectura qué criterio aplicó. Si dos
hojas resultan del mismo tipo, sus documentos se suman.

---

## 6. Cómo verificar un archivo antes de entregarlo

Sin abrir el navegador:

```bash
npx tsx scripts/verificar-archivo.ts "ruta/al/reporte.xlsx"
```

Imprime hojas reconocidas, totales, tramos, el cuadre y todas las notas de
lectura. **No imprime datos de terceros**, solo agregados y diagnóstico, así que
su salida se puede pegar en un ticket sin exponer información de clientes.

---

## 7. Lo que el tablero NO hace

Conviene tenerlo claro para no esperar algo que no ocurre:

- **No guarda nada.** El archivo se lee en el navegador de quien lo abre. No se
  sube, no queda en un servidor y no lo ve nadie más. La única copia que persiste
  es en el almacenamiento local de ese navegador, y hay un botón para borrarla.
- **No consolida periodos.** Cada carga reemplaza a la anterior. No hay histórico
  ni comparación mes contra mes.
- **No corrige el archivo.** Si el reporte viene descuadrado, el tablero lo
  señala; no lo ajusta.
