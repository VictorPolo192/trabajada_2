import { TIPOS_VALIDOS, PAGINAS_MIN, PAGINAS_MAX } from './tarifas.js';

const CAMPOS_OBLIGATORIOS = ['tipo', 'paginas', 'formulario', 'segundoIdioma'];

/**
 * Valida el cuerpo de una solicitud de presupuesto.
 * Devuelve { ok: true, datos } con SOLO los cuatro campos permitidos,
 * o { ok: false, errores } con la lista de problemas encontrados.
 */
export function validarSolicitud(cuerpo) {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { ok: false, errores: ['El cuerpo de la petición debe ser un objeto JSON.'] };
  }

  const errores = [];

  for (const campo of CAMPOS_OBLIGATORIOS) {
    if (!Object.hasOwn(cuerpo, campo)) {
      errores.push(`Falta el campo obligatorio "${campo}".`);
    }
  }
  if (errores.length > 0) return { ok: false, errores };

  const { tipo, paginas, formulario, segundoIdioma } = cuerpo;

  if (!TIPOS_VALIDOS.includes(tipo)) {
    errores.push(`"tipo" debe ser "landing" o "corporativa" (recibido: ${JSON.stringify(tipo)}).`);
  }

  if (typeof paginas !== 'number' || !Number.isInteger(paginas)) {
    errores.push(`"paginas" debe ser un número entero (recibido: ${JSON.stringify(paginas)}).`);
  } else if (paginas < PAGINAS_MIN || paginas > PAGINAS_MAX) {
    errores.push(`"paginas" debe estar entre ${PAGINAS_MIN} y ${PAGINAS_MAX} (recibido: ${paginas}).`);
  }

  if (typeof formulario !== 'boolean') {
    errores.push(`"formulario" debe ser un booleano true o false (recibido: ${JSON.stringify(formulario)}).`);
  }

  if (typeof segundoIdioma !== 'boolean') {
    errores.push(`"segundoIdioma" debe ser un booleano true o false (recibido: ${JSON.stringify(segundoIdioma)}).`);
  }

  if (errores.length > 0) return { ok: false, errores };

  // Solo se devuelven los campos conocidos: cualquier propiedad extra (precio, total...) se ignora.
  return { ok: true, datos: { tipo, paginas, formulario, segundoIdioma } };
}
