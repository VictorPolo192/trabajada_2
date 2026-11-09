import { TARIFAS, MONEDA } from './tarifas.js';

/**
 * Calcula el presupuesto a partir de datos YA validados.
 * Total = precio base + páginas adicionales + extras seleccionados.
 * Es una función pura: no depende de Express ni de la petición.
 */
export function calcularPresupuesto({ tipo, paginas, formulario, segundoIdioma }) {
  const base = TARIFAS[tipo].precio;
  const paginasAdicionales = (paginas - 1) * TARIFAS.paginaAdicional.precio;
  const costeFormulario = formulario ? TARIFAS.formulario.precio : 0;
  const costeSegundoIdioma = segundoIdioma ? TARIFAS.segundoIdioma.precio : 0;

  return {
    base,
    paginasAdicionales,
    formulario: costeFormulario,
    segundoIdioma: costeSegundoIdioma,
    total: base + paginasAdicionales + costeFormulario + costeSegundoIdioma,
    moneda: MONEDA
  };
}
