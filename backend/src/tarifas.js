// Tarifas oficiales del servidor. Están congeladas: nada de la petición puede modificarlas.
export const MONEDA = 'EUR';

export const TARIFAS = Object.freeze({
  landing: Object.freeze({ concepto: 'Landing, incluida la primera página', precio: 300 }),
  corporativa: Object.freeze({ concepto: 'Web corporativa, incluida la primera página', precio: 600 }),
  paginaAdicional: Object.freeze({ concepto: 'Cada página adicional a la primera', precio: 50 }),
  formulario: Object.freeze({ concepto: 'Formulario de contacto', precio: 80 }),
  segundoIdioma: Object.freeze({ concepto: 'Segundo idioma', precio: 150 })
});

export const TIPOS_VALIDOS = ['landing', 'corporativa'];
export const PAGINAS_MIN = 1;
export const PAGINAS_MAX = 20;
