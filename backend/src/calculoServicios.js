import { buscarServicio, CATALOGO, MONEDA } from './catalogo.js';

/**
 * Calcula el presupuesto a partir de una selección YA validada (validarSeleccion).
 * Los importes salen exclusivamente de las tarifas del servidor.
 * Las líneas se ordenan según el catálogo para que el documento sea siempre coherente.
 */
export function calcularPresupuestoServicios({ cliente, resumen, servicios, aclaraciones }, fecha = new Date()) {
  const orden = (id) => CATALOGO.findIndex((s) => s.id === id);
  const lineas = [...servicios]
    .sort((a, b) => orden(a.id) - orden(b.id))
    .map(({ id, cantidad }) => {
      const def = buscarServicio(id);
      const unidades = def.cantidad ? cantidad : 1;
      return {
        id,
        concepto: def.nombre,
        descripcion: def.descripcion,
        cantidad: unidades,
        unidad: def.unidad,
        precioUnitario: def.precio,
        importe: def.precio * unidades
      };
    });

  return {
    cliente,
    fecha: fecha.toISOString().slice(0, 10),
    resumen,
    lineas,
    total: lineas.reduce((suma, l) => suma + l.importe, 0),
    moneda: MONEDA,
    aclaraciones
  };
}
