/**
 * Verificador de ingesta.
 *
 *   npx tsx scripts/verificar-archivo.ts "ruta/al/reporte.xlsx"
 *
 * Lee un Excel con el mismo parser que usa el tablero e imprime lo que
 * entendio: hojas, columnas, totales, tramos y cuadre contra el balance.
 * Sirve para validar un export nuevo antes de entregarlo, sin abrir el navegador.
 *
 * No imprime datos de terceros: solo agregados y diagnostico.
 */
import { readFileSync } from 'node:fs';
import { calcularCuadre, tramosDe, totalesPorTramo, totalDe, UMBRALES_POR_DEFECTO } from '../lib/aggregate';
import { leerLibro } from '../lib/parser';
import { fmtMoney } from '../lib/format';

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: npx tsx scripts/verificar-archivo.ts "ruta/al/reporte.xlsx"');
  process.exit(1);
}

const buf = readFileSync(ruta);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const r = leerLibro(ab, ruta.split(/[\\/]/).pop() ?? ruta);
const tramos = tramosDe([...UMBRALES_POR_DEFECTO]);

console.log('\nARCHIVO: ' + r.archivo);

for (const tipo of ['CXC', 'CXP'] as const) {
  const ds = r.datasets[tipo];
  console.log('\n' + '='.repeat(66));
  if (!ds) {
    console.log(tipo + ': no reconocido');
    continue;
  }
  console.log(`${tipo}  ·  hoja "${ds.hoja}"  ·  empresa: ${ds.empresa ?? '—'}  ·  corte: ${ds.fechaCorte ?? '—'}`);
  console.log('='.repeat(66));
  console.log(`documentos: ${ds.docs.length}   terceros: ${new Set(ds.docs.map((d) => d.nit)).size}`);
  console.log(`saldo total del detalle: ${fmtMoney(totalDe(ds.docs))}`);

  console.log('\nTramos recalculados por el tablero (30/90/180/360):');
  const vals = totalesPorTramo(ds.docs, tramos);
  tramos.forEach((t, i) => {
    console.log('  ' + t.etiqueta.padEnd(18) + fmtMoney(vals[i]).padStart(22));
  });

  const c = calcularCuadre(ds);
  console.log('\nCuadre contra el balance:');
  console.log('  total saldo balance : ' + fmtMoney(c.totalBalance));
  console.log('  suma del detalle    : ' + fmtMoney(c.sumaDetalle));
  console.log('  diferencia          : ' + fmtMoney(c.diferencia) + '   [' + c.estado + ']');
  console.log('  fila "Dif" del Excel: ' + fmtMoney(c.difArchivo));

  if (c.tramos) {
    console.log('\n  Tramos del encabezado vs. suma de sus columnas en el detalle:');
    for (const t of c.tramos) {
      const marca = Math.abs(t.dif) <= 1 ? 'ok' : 'REVISAR';
      console.log(
        '   ' + t.etiqueta.padEnd(20) +
        fmtMoney(t.archivo).padStart(20) +
        fmtMoney(t.calculado).padStart(20) +
        ('  ' + marca)
      );
    }
    console.log('  => ' + (c.tramosCuadran ? 'los tramos cuadran' : 'HAY DIFERENCIAS en los tramos'));
  }
}

console.log('\n' + '='.repeat(66));
console.log('NOTAS DE LECTURA');
console.log('='.repeat(66));
for (const a of r.avisos) {
  console.log(`[${a.nivel}]${a.hoja ? ' ' + a.hoja : ''}: ${a.mensaje}`);
}
console.log('');
