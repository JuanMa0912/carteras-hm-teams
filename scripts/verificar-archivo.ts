/**
 * Verificador de ingesta.
 *
 *   npx tsx scripts/verificar-archivo.ts "informe1.xlsx" "informe2.xlsx" ...
 *
 * Lee uno o varios informes con el MISMO código que usa el tablero e imprime
 * lo que entendió: empresa, corte, cartera bruta contra anticipos, tramos y
 * cuadre contra el balance. Sirve para validar un export nuevo —o el de una
 * empresa que entra por primera vez— sin abrir el navegador.
 *
 * No imprime datos de terceros: solo agregados y diagnóstico, así que su
 * salida se puede pegar en un correo sin exponer información de clientes.
 */
import { readFileSync } from 'node:fs';
import {
  calcularCuadre, resumirCorte, totalDeGrupo, totalesPorTramo, tramosDe, UMBRALES_POR_DEFECTO,
} from '../lib/aggregate';
import { leerBuffers, type EntradaLibro } from '../lib/parser';
import { fmtMoney } from '../lib/format';
import type { Tipo } from '../lib/types';

const rutas = process.argv.slice(2);
if (!rutas.length) {
  console.error('Uso: npx tsx scripts/verificar-archivo.ts "informe.xlsx" [otro.xlsx ...]');
  process.exit(1);
}

const entradas: EntradaLibro[] = rutas.map((ruta) => {
  const buf = readFileSync(ruta);
  return {
    nombre: ruta.split(/[\\/]/).pop() ?? ruta,
    buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  };
});

const r = leerBuffers(entradas);
const tramos = tramosDe([...UMBRALES_POR_DEFECTO]);
const linea = '='.repeat(74);

console.log(`\nArchivos leídos: ${rutas.length}   Cortes reconocidos: ${r.cortes.length}`);

for (const corte of r.cortes) {
  console.log('\n' + linea);
  console.log(`${corte.empresaNombre}   ·   corte ${corte.fecha}   ·   ${corte.archivo}`);
  console.log(`id interno: ${corte.id}`);
  console.log(linea);

  for (const tipo of ['CXC', 'CXP'] as Tipo[]) {
    const c = corte.carteras[tipo];
    if (!c) {
      console.log(`\n  ${tipo}: no viene en este archivo`);
      continue;
    }
    const bruta = totalDeGrupo(c.docs, 'principal');
    const anticipo = totalDeGrupo(c.docs, 'anticipo');
    const nPr = c.docs.filter((d) => d.grupo === 'principal').length;
    const nAn = c.docs.length - nPr;

    console.log(`\n  ${tipo === 'CXC' ? 'POR COBRAR' : 'POR PAGAR'}  (hoja "${c.hoja}")`);
    console.log(`    documentos           ${c.docs.length}   ·   terceros ${new Set(c.docs.map((d) => d.nit)).size}`);
    console.log(`    cartera bruta        ${fmtMoney(bruta).padStart(24)}   (${nPr} docs)`);
    console.log(`    anticipos            ${fmtMoney(anticipo).padStart(24)}   (${nAn} docs)`);
    console.log(`    neta                 ${fmtMoney(bruta + anticipo).padStart(24)}`);
    if (nAn > 0 && Math.abs(bruta) > 0) {
      console.log(`    -> netear cambia el total en ${((Math.abs(anticipo) / Math.abs(bruta)) * 100).toFixed(1)} %`);
    }

    console.log('\n    Tramos sobre la cartera BRUTA (30/90/180/360):');
    const soloPrincipal = c.docs.filter((d) => d.grupo === 'principal');
    const vals = totalesPorTramo(soloPrincipal, tramos);
    tramos.forEach((t, i) => console.log('      ' + t.etiqueta.padEnd(18) + fmtMoney(vals[i]).padStart(22)));

    const q = calcularCuadre(c);
    console.log('\n    Cuadre contra el balance (sobre el total neto de la hoja):');
    console.log('      total saldo balance : ' + fmtMoney(q.totalBalance));
    console.log('      suma del detalle    : ' + fmtMoney(q.sumaDetalle));
    console.log('      diferencia          : ' + fmtMoney(q.diferencia) + '   [' + q.estado + ']');
    console.log('      fila "Dif" del Excel: ' + fmtMoney(q.difArchivo));
    if (q.tramos) {
      const malos = q.tramos.filter((t) => Math.abs(t.dif) > 1);
      console.log(
        '      tramos del encabezado: ' +
          (q.tramosCuadran ? 'cuadran con el detalle' : `REVISAR — ${malos.map((t) => t.etiqueta).join(', ')}`)
      );
    }
  }

  console.log('\n  Resumen que iría al historial mensual:');
  for (const p of resumirCorte(corte)) {
    console.log(
      `    ${p.mes}  ${p.tipo}  bruta ${fmtMoney(p.principal).padStart(22)}  anticipos ${fmtMoney(p.anticipo).padStart(18)}`
    );
  }
}

console.log('\n' + linea);
console.log('NOTAS DE LECTURA');
console.log(linea);
if (!r.avisos.length) console.log('(sin novedades)');
for (const a of r.avisos) {
  console.log(`[${a.nivel}]${a.archivo ? ' ' + a.archivo : ''}${a.hoja ? ' › ' + a.hoja : ''}: ${a.mensaje}`);
}
console.log('');

if (r.avisos.some((a) => a.nivel === 'error')) process.exitCode = 1;
