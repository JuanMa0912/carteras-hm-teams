/**
 * Escala del eje: techo con aire y marcas en cifras redondas.
 *
 * Portado del visor de productividad, donde ya estaba resuelto. Dos cosas a la
 * vez, y por eso no basta redondear hacia arriba:
 *
 * 1. La barra mas alta NO debe tocar el techo. Se busca cubrir el maximo con
 *    un 8% de aire para que la columna del mes pico respire.
 * 2. Las marcas tienen que ser numeros que alguien lea. Se prueban pasos
 *    limpios (1, 2, 2.5, 5 por potencia de diez) con 3, 4 o 5 divisiones y se
 *    queda el techo MAS BAJO que cumpla las dos: asi 13.166 millones no salta
 *    a 20.000 sino a 15.000, con marcas en 0 / 5.000 / 10.000 / 15.000.
 */
export function escalaDeEje(max: number): { techo: number; paso: number } {
  if (max <= 0) return { techo: 1, paso: 1 };
  const objetivo = max * 1.08;
  let mejor: { techo: number; paso: number } | null = null;
  for (const divisiones of [3, 4, 5]) {
    const minimo = objetivo / divisiones;
    const exp = Math.floor(Math.log10(minimo));
    for (const e of [exp, exp + 1]) {
      const base = 10 ** e;
      for (const p of [1, 2, 2.5, 5]) {
        const paso = p * base;
        if (paso < minimo) continue;
        const techo = paso * divisiones;
        if (!mejor || techo < mejor.techo) mejor = { techo, paso };
        break;
      }
    }
  }
  return mejor ?? { techo: objetivo, paso: objetivo / 4 };
}
