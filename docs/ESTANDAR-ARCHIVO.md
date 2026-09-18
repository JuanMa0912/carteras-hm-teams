# Estándar del archivo de cartera por edades

Este documento define qué debe traer un archivo `.xlsx` para que el tablero lo
lea. Está escrito para quien genera el reporte (contabilidad / TI), no para
quien programa.

La regla de fondo: **el tablero se adapta al archivo, no al revés**, pero
necesita poder responder sin ambigüedad cuatro preguntas — de qué empresa es, a
qué fecha, de quién es el saldo y cuánto es.

---

## 1. Requisito mínimo

Una hoja se procesa si tiene:

| Qué | Dónde | Obligatorio |
|---|---|---|
| **Nombre de la empresa** | primera columna de la franja de encabezado (celda A1 o la primera fila con texto en la columna A) | Sí |
| **Fecha de corte** | una celda con el texto `fecha corte` y la fecha a su derecha | Sí |
| **Nombre del tercero** | columna de la fila de cabecera | Sí |
| **Saldo** | columna de la fila de cabecera | Sí |

Nombres de columna aceptados:

| Concepto | Nombres aceptados |
|---|---|
| Nombre del tercero | `proveedor`, `cliente`, `tercero`, `razon social`, `nombre`, `nombre tercero`, `descripcion`, `beneficiario` |
| Saldo | `saldo`, `valor`, `saldo total`, `saldo cartera`, `saldo_total`, `valor saldo` |

Si falta cualquiera de las cuatro, la hoja **no se procesa** y el tablero
muestra un error que dice qué encontró y qué no. Nunca falla en silencio.

La comparación ignora mayúsculas, tildes y espacios de más: `Proveedor`,
`PROVEEDOR` y `proveedor ` son el mismo nombre.

> ### ⚠ El informe se mantiene a mano, no lo genera el ERP
>
> Se ve en los propios archivos: hay notas escritas a mano en el bloque de
> cuadre (`«Valor mayor en el modulo de cxp»`, `«2335 SERVICIOS PUBLICOS»`),
> columnas de verificación que solo están en algunos, y `Author: «Contadora»` en
> las propiedades del libro. **Alguien copia el archivo del mes anterior y lo
> edita.**
>
> La consecuencia es que **cualquier celda del encabezado puede venir heredada
> del mes pasado**. Dos en concreto hacen daño, y el daño no se ve:
>
> **El nombre de la empresa.** El archivo escribe «Merkmios» en la celda vecina
> a `fecha corte` en los TRES informes, sean de la empresa que sean — quedó
> pegado de la plantilla. Por eso la empresa se lee **siempre de la primera
> columna** y nunca de ahí. No hay en el archivo ningún otro identificador: las
> propiedades del libro no traen `Company` y el `Author` es la persona que lo
> editó. Esta no se puede verificar contra nada; solo confirmarla.
>
> **La fecha de corte.** Esta sí se puede desmentir con los datos. `D_venc` lo
> calculó el ERP contra el corte real, así que `Fecha_vcto + D_venc` reconstruye
> esa fecha en cada fila. Verificado el 18-sep-2026 sobre los tres informes: las
> 10.875 filas de las seis hojas dan el mismo corte, sin una sola excepción.
> **El tablero propone la fecha de los datos, no la de la celda**, y dice cuál
> traía cada una.
>
> Ninguna de las dos entra sin confirmación. Ver §8.

---

## 2. Columnas opcionales

| Concepto | Nombres aceptados | Para qué sirve |
|---|---|---|
| Cuenta contable | `cuenta_contable`, `cuenta contable`, `cuenta`, `cta` | **Separa la cartera de los anticipos.** Ver §4 |
| NIT | `nit`, `identificacion`, `cedula`, `nit/cc`, `id tercero` | Agrupar documentos del mismo tercero y comparar terceros entre empresas |
| Centro de operación | `c.o`, `co`, `centro operacion`, `sucursal` | Referencia |
| Documento | `documento`, `doc`, `factura`, `nro documento` | Identificar cada movimiento y buscarlo |
| Fecha del documento | `fecha_dcto`, `fecha dcto`, `fecha documento` | Referencia |
| Fecha de vencimiento | `fecha_vcto`, `fecha vcto`, `fecha vencimiento` | Mostrar el vencimiento y calcular días si no vienen |
| Días vencidos | `d_venc`, `dias vencidos`, `edad`, `dias` | Clasificar cada documento en su tramo |

> **Sobre los días vencidos.** Se toman de la columna del informe: es la cifra
> con la que el propio ERP armó sus tramos, y recalcularla contra el corte daría
> diferencias de un día que nadie sabría explicar. Si la columna no existe pero
> sí hay fecha de vencimiento, se calcula contra el corte y se reporta como
> nota. Si no hay ninguna de las dos, todos los documentos caen en el primer
> tramo y el análisis de antigüedad deja de ser confiable.

---

## 3. Columnas de tramo

Se reconoce automáticamente cualquier cabecera con estas formas:

- `Hasta 1 a 30 dias` → tramo 1 a 30
- `31 a 90 dias` → tramo 31 a 90
- `Mas de 360 dias` → tramo de 361 en adelante

**No importa cuáles sean los cortes.** Si el reporte usa 15 / 45 / 90 / 180, el
tablero lee esos tramos tal cual para el cuadre.

Estas columnas se usan **solo para verificar** que el archivo es internamente
consistente. Las barras del tablero se recalculan siempre desde los días
vencidos, que es lo que permite mover los umbrales en pantalla.

---

## 4. Cartera bruta y anticipos — lo que más puede dañar las cifras

El tablero separa cada fila en dos grupos según el primer dígito de la cuenta
contable (PUC):

| Cartera | Grupo principal | Grupo anticipo |
|---|---|---|
| Por cobrar | cuentas `1x` (clientes, otras CxC) | cuentas `2x` (anticipos de clientes) |
| Por pagar | cuentas `2x` (proveedores, acreedores) | cuentas `1x` (anticipos a proveedores) |

**Por defecto el tablero muestra la cartera BRUTA**: solo el grupo principal.
Los anticipos van aparte, en su propia casilla, y hay un interruptor para
netearlos.

Por qué importa, medido sobre los informes al 31-ago-2026:

| Empresa | CxP bruta | Anticipos | CxP neta | Diferencia |
|---|---|---|---|---|
| Merkmios | 11.789 MM | −476 MM | 11.313 MM | 4,0 % |
| **Mercamio** | **23.607 MM** | **−6.171 MM** | **17.436 MM** | **26,1 %** |
| Comercializadora Floralia | 15.421 MM | −1.873 MM | 13.549 MM | 12,1 % |

Un tablero que suma todo a ciegas mostraría 6.171 millones menos de lo que el
contador llama «cuentas por pagar» en Mercamio.

**Consecuencia para quien genera el informe: si falta la columna de cuenta
contable, todo cae en el grupo principal y los anticipos dejan de separarse.**

---

## 5. Bloque de encabezado (cuadre contable)

Todo lo que esté **arriba** de la fila de cabecera se interpreta así:

- **Nombre de la empresa**: el primer valor no vacío de la primera columna.
- **Cuentas del balance**: cualquier fila con un par `(texto o código, número)`.
  Solo se toma el primer par de cada fila.
- **`Total Saldo Balance`**: se reconoce por el texto y se usa como cifra de
  control.
- **`Dif`** (o `Diferencia`): la diferencia que el propio archivo declara.
- **Fecha de corte**: celda con el texto `fecha corte` y la fecha a su derecha.
  Esa misma fila puede traer los totales por tramo, que se usan como segunda
  cifra de control.

El tablero compara el `Total Saldo Balance` contra la suma real de la columna de
saldo, y semaforiza:

| Diferencia | Veredicto |
|---|---|
| hasta $1 | **Cuadra** (redondeo) |
| hasta $1.000 | **Diferencia menor** |
| más de $1.000 | **Descuadre** |

El cuadre se calcula siempre sobre el **total neto** de la hoja —todas las
cuentas con su signo—, porque eso es lo que declara el informe. No depende del
interruptor de anticipos.

---

## 6. Clasificación por cobrar / por pagar

Por el nombre de la hoja: `CXP`, `pagar` o `proveedor` → por pagar; `CXC`,
`cobrar` o `cliente` → por cobrar.

Si el nombre no lo dice, se decide por las cuentas del PUC ponderadas por saldo,
y **se avisa en pantalla para que alguien lo verifique**.

Las hojas que no son de cartera (auxiliares del ERP, hojas en blanco) se omiten
con una nota, no con un error.

---

## 7. Varios archivos a la vez

Se pueden soltar tantos archivos como se quiera. Cada combinación de
**(empresa, fecha de corte)** queda como un corte independiente.

- **Varias empresas del mismo mes** → se pueden ver por separado o consolidadas.
- **Varios meses de la misma empresa** → alimentan la gráfica de evolución.
- **Las dos cosas a la vez** → también.

Un corte que ya estaba se **reemplaza** por el del archivo nuevo. Es lo que se
espera al volver a subir un informe corregido, y evita que dos versiones del
mismo mes se sumen.

**El detalle y la antigüedad muestran siempre UN corte**, el que se elija en el
selector. Sumar cortes de meses distintos duplicaría los documentos que siguen
abiertos en los dos. La evolución es lo único que cruza fechas, y lo hace sobre
agregados mensuales.

---

## 8. Confirmación antes de cargar

Leer un archivo **no** es cargarlo. Al soltar los archivos aparece un panel con
lo que se entendió de cada uno —empresa, fecha de corte, totales— y nada entra
al tablero ni al historial hasta que alguien pulsa confirmar.

Los dos campos son editables, y el tablero señala:

| Situación | Qué dice |
|---|---|
| La celda de corte no coincide con los días vencidos | Propone la fecha de los datos y dice cuál traía la celda |
| Ya hay un corte de esa empresa en ese mes con otro saldo | Pregunta si es un informe corregido |
| Una empresa nueva se parece a una que ya tiene historial | Ofrece unirlas con un clic |
| Dos archivos de la misma carga quedarían iguales | **Bloquea** la confirmación |

Si aun así entró algo mal, **«Corregir o unir empresas»** renombra una empresa
o funde dos series que se partieron.

---

## 9. Cómo verificar un archivo antes de entregarlo

Sin abrir el navegador:

```bash
npx tsx scripts/verificar-archivo.ts "informe1.xlsx" "informe2.xlsx"
```

Imprime, por cada corte: empresa reconocida, fecha, cartera bruta contra
anticipos, tramos, el cuadre y todas las notas de lectura. Termina con código de
salida 1 si hubo errores, así que sirve en un script.

**No imprime datos de terceros**, solo agregados y diagnóstico: su salida se
puede pegar en un correo o un ticket sin exponer información de clientes.

Es el primer paso obligado cuando entra una empresa nueva.

---

## 10. Lo que el tablero NO hace

- **No guarda el detalle en ningún servidor.** Los archivos se leen en el
  navegador de quien los abre. Lo único que persiste es, en ese mismo navegador,
  el historial mensual (agregados) y el detalle de los cortes más recientes si
  cabe.
- **No reconstruye meses que no se hayan subido.** Un informe es la foto de un
  día. La gráfica de evolución solo tiene las columnas de los cortes cargados; si
  un mes trae menos empresas que los demás, esa columna se dibuja rayada para que
  la caída no se confunda con un pago.
- **No corrige el archivo.** Si el informe viene descuadrado, el tablero lo
  señala; no lo ajusta.
