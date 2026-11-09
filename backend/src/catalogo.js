import { TARIFAS, MONEDA, PAGINAS_MAX } from './tarifas.js';

/**
 * Catálogo de servicios que se ofrece a la IA y al cliente.
 * Los PRECIOS salen siempre de TARIFAS (una sola fuente de verdad); aquí solo se
 * añaden el identificador, el nombre, la descripción y la regla de cálculo.
 *
 * - grupo 'base'  → hay que elegir exactamente UNO (landing o corporativa).
 * - cantidad      → si no es null, el servicio necesita una cantidad entera en [min, max]
 *                   para poder calcularse (importe = precio × cantidad).
 */
const definiciones = [
  {
    id: 'landing',
    nombre: 'Landing page',
    descripcion:
      'Página única de presentación (una sola página con varias secciones): diseño adaptado a móvil, maquetación y publicación. Incluye la primera página.',
    grupo: 'base',
    cantidad: null
  },
  {
    id: 'corporativa',
    nombre: 'Web corporativa',
    descripcion:
      'Sitio web de empresa con menú de navegación y estructura de varias páginas: diseño adaptado a móvil, maquetación y publicación. Incluye la primera página (inicio).',
    grupo: 'base',
    cantidad: null
  },
  {
    id: 'paginaAdicional',
    nombre: 'Páginas adicionales',
    descripcion:
      'Cada página adicional a la primera (por ejemplo: carta, quiénes somos, servicios, galería, contacto). Se cobra por página.',
    grupo: null,
    cantidad: { min: 1, max: PAGINAS_MAX - 1, etiqueta: 'Número de páginas adicionales' }
  },
  {
    id: 'formulario',
    nombre: 'Formulario de contacto',
    descripcion:
      'Formulario que envía por correo electrónico los datos que rellena el visitante (consultas, solicitudes de reserva o de presupuesto). No incluye gestión de disponibilidad ni pagos.',
    grupo: null,
    cantidad: null
  },
  {
    id: 'segundoIdioma',
    nombre: 'Segundo idioma',
    descripcion:
      'Versión completa del sitio en un segundo idioma con selector de idioma. La traducción de los textos la aporta el cliente.',
    grupo: null,
    cantidad: null
  }
];

export const CATALOGO = Object.freeze(
  definiciones.map((s) =>
    Object.freeze({
      ...s,
      precio: TARIFAS[s.id].precio,
      unidad: s.cantidad ? 'página' : 'servicio',
      regla: s.cantidad ? `${TARIFAS[s.id].precio} € por página` : `${TARIFAS[s.id].precio} € precio fijo`
    })
  )
);

export const IDS_CATALOGO = CATALOGO.map((s) => s.id);
export const IDS_BASE = CATALOGO.filter((s) => s.grupo === 'base').map((s) => s.id);
export { MONEDA };

export function buscarServicio(id) {
  return CATALOGO.find((s) => s.id === id) ?? null;
}

/** Versión del catálogo que se envía a la IA: sin precios, para que no pueda citarlos ni inventarlos. */
export function catalogoParaIA() {
  return CATALOGO.map(({ id, nombre, descripcion, grupo, cantidad }) => ({
    id,
    nombre,
    descripcion,
    seleccion: grupo === 'base' ? 'Tipo de web: elegir exactamente uno entre landing y corporativa' : 'Opcional',
    cantidad: cantidad ? `Requiere cantidad entera entre ${cantidad.min} y ${cantidad.max}` : 'No requiere cantidad'
  }));
}
