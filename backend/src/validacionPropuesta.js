import { buscarServicio, IDS_BASE } from './catalogo.js';
import { LIMITES } from './limites.js';

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const limpiar = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const recortar = (v, max) => {
  const t = limpiar(v);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Comprueba el formulario del cliente: nombre y descripción del proyecto. */
export function validarSolicitudCliente(cuerpo) {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la petición debe ser un objeto JSON.'] };

  const errores = [];
  const cliente = limpiar(cuerpo.cliente);
  const descripcion = typeof cuerpo.descripcion === 'string' ? cuerpo.descripcion.trim() : '';

  if (typeof cuerpo.cliente !== 'string' || cliente === '') {
    errores.push('Indica el nombre del cliente o de la empresa.');
  } else if (cliente.length > LIMITES.cliente) {
    errores.push(`El nombre del cliente no puede superar los ${LIMITES.cliente} caracteres.`);
  }

  if (typeof cuerpo.descripcion !== 'string' || descripcion === '') {
    errores.push('La descripción del proyecto no puede estar vacía.');
  } else if (descripcion.length < LIMITES.descripcionMin) {
    errores.push(`La descripción es demasiado corta (mínimo ${LIMITES.descripcionMin} caracteres).`);
  } else if (descripcion.length > LIMITES.descripcion) {
    errores.push(`La descripción no puede superar los ${LIMITES.descripcion} caracteres (tiene ${descripcion.length}).`);
  }

  if (errores.length) return { ok: false, errores };
  return { ok: true, datos: { cliente, descripcion } };
}

/**
 * Normaliza la respuesta del modelo. NO se fía de ella:
 *  - descarta identificadores que no están en el catálogo (y lo anota como aclaración),
 *  - elimina duplicados y deja como mucho un tipo de web,
 *  - invalida cantidades fuera de rango (el usuario tendrá que completarlas),
 *  - ignora cualquier campo que no esperamos (precios, plazos…).
 * Lanza un Error si la estructura no es la acordada.
 */
export function normalizarPropuestaIA(bruta) {
  if (!esObjeto(bruta) || typeof bruta.resumen !== 'string' || !Array.isArray(bruta.servicios)) {
    throw new Error('La respuesta de la IA no tiene el formato esperado.');
  }

  const avisos = [];
  const servicios = [];
  let baseElegida = null;

  for (const s of bruta.servicios) {
    if (!esObjeto(s) || typeof s.id !== 'string') continue;
    const servicio = buscarServicio(s.id);
    if (!servicio) {
      avisos.push(`La IA propuso «${recortar(s.id, 60)}», que no existe en el catálogo: se ha descartado.`);
      continue;
    }
    if (servicios.some((x) => x.id === s.id)) continue;
    if (IDS_BASE.includes(s.id)) {
      if (baseElegida) {
        avisos.push(`Se propusieron dos tipos de web; se mantiene «${baseElegida}» y se descarta «${s.id}».`);
        continue;
      }
      baseElegida = s.id;
    }

    let cantidad = null;
    if (servicio.cantidad) {
      const c = s.cantidad;
      if (Number.isInteger(c) && c >= servicio.cantidad.min && c <= servicio.cantidad.max) cantidad = c;
    }
    servicios.push({ id: s.id, justificacion: recortar(s.justificacion, LIMITES.justificacion), cantidad });
  }

  const dudas = (Array.isArray(bruta.dudas) ? bruta.dudas : [])
    .map((d) => recortar(d, LIMITES.aclaracion))
    .filter(Boolean);

  const noIncluidos = (Array.isArray(bruta.noIncluidos) ? bruta.noIncluidos : [])
    .filter(esObjeto)
    .map((n) => ({ necesidad: recortar(n.necesidad, 150), motivo: recortar(n.motivo, LIMITES.aclaracion) }))
    .filter((n) => n.necesidad);

  // Datos que el usuario TIENE que completar antes de calcular (la interfaz bloquea hasta resolverlos).
  // Van aparte de las dudas para que no acaben en el PDF una vez resueltos.
  const faltanDatos = [];
  if (!baseElegida) faltanDatos.push('Falta decidir el tipo de web (landing o corporativa).');
  for (const s of servicios) {
    const def = buscarServicio(s.id);
    if (def.cantidad && s.cantidad === null) faltanDatos.push(`Hay que concretar: ${def.cantidad.etiqueta.toLowerCase()}.`);
  }

  return { resumen: recortar(bruta.resumen, LIMITES.resumen), servicios, dudas, noIncluidos, faltanDatos, avisos };
}

/**
 * Valida la selección FINAL que confirma el usuario antes de calcular.
 * Cuerpo: { cliente, resumen, servicios: [{ id, cantidad? }], aclaraciones: [string] }
 * Solo se conservan los campos conocidos; los precios que envíe el cliente se ignoran.
 */
export function validarSeleccion(cuerpo) {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la petición debe ser un objeto JSON.'] };
  const errores = [];

  const cliente = limpiar(cuerpo.cliente);
  if (!cliente) errores.push('Falta el nombre del cliente o empresa.');
  else if (cliente.length > LIMITES.cliente) errores.push(`El nombre del cliente no puede superar ${LIMITES.cliente} caracteres.`);

  const resumen = limpiar(cuerpo.resumen);
  if (resumen.length > LIMITES.resumen) errores.push(`El resumen no puede superar ${LIMITES.resumen} caracteres.`);

  if (!Array.isArray(cuerpo.servicios) || cuerpo.servicios.length === 0) {
    errores.push('Selecciona al menos un servicio.');
    return { ok: false, errores };
  }

  const servicios = [];
  for (const s of cuerpo.servicios) {
    const id = esObjeto(s) ? s.id : undefined;
    const def = typeof id === 'string' ? buscarServicio(id) : null;
    if (!def) {
      errores.push(`El servicio ${JSON.stringify(id)} no existe en el catálogo.`);
      continue;
    }
    if (servicios.some((x) => x.id === id)) {
      errores.push(`El servicio «${def.nombre}» está repetido.`);
      continue;
    }
    let cantidad = null;
    if (def.cantidad) {
      const c = s.cantidad;
      if (c === null || c === undefined || c === '') {
        errores.push(`Falta un dato para «${def.nombre}»: ${def.cantidad.etiqueta.toLowerCase()}.`);
      } else if (typeof c !== 'number' || !Number.isInteger(c)) {
        errores.push(`La cantidad de «${def.nombre}» debe ser un número entero.`);
      } else if (c < def.cantidad.min || c > def.cantidad.max) {
        errores.push(`La cantidad de «${def.nombre}» debe estar entre ${def.cantidad.min} y ${def.cantidad.max}.`);
      } else cantidad = c;
    }
    servicios.push({ id, cantidad });
  }

  const bases = servicios.filter((s) => IDS_BASE.includes(s.id));
  if (bases.length !== 1) errores.push('Debes elegir exactamente un tipo de web: landing o corporativa.');

  if (cuerpo.aclaraciones !== undefined && !Array.isArray(cuerpo.aclaraciones)) {
    errores.push('"aclaraciones" debe ser una lista de textos.');
  }
  const aclaraciones = (Array.isArray(cuerpo.aclaraciones) ? cuerpo.aclaraciones : [])
    .map((a) => limpiar(a))
    .filter(Boolean);
  if (aclaraciones.length > LIMITES.aclaraciones) errores.push(`Como máximo ${LIMITES.aclaraciones} aclaraciones.`);
  if (aclaraciones.some((a) => a.length > LIMITES.aclaracion)) {
    errores.push(`Cada aclaración puede tener como máximo ${LIMITES.aclaracion} caracteres.`);
  }

  if (errores.length) return { ok: false, errores };
  return { ok: true, datos: { cliente, resumen, servicios, aclaraciones } };
}
