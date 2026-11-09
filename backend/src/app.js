import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TARIFAS, MONEDA } from './tarifas.js';
import { validarSolicitud } from './validacion.js';
import { calcularPresupuesto } from './calculo.js';
import { CATALOGO, MONEDA as MONEDA_CATALOGO } from './catalogo.js';
import { LIMITES } from './limites.js';
import { validarSolicitudCliente, validarSeleccion } from './validacionPropuesta.js';
import { calcularPresupuestoServicios } from './calculoServicios.js';
import { proponerServicios, ErrorIA } from './ia.js';
import { generarPdf, nombreArchivo } from './pdf.js';

export const app = express();

app.use(express.json({ limit: '50kb' }));

const exigirJson = (req, res, next) =>
  req.is('application/json')
    ? next()
    : res.status(400).json({
        error: 'Solicitud incorrecta',
        detalles: ['La petición debe usar la cabecera Content-Type: application/json.']
      });

// GET /api/estado → comprueba que el servicio funciona
app.get('/api/estado', (req, res) => {
  res.json({ status: 'ok' });
});

// GET /api/tarifas → tarifas que usa el servidor
app.get('/api/tarifas', (req, res) => {
  res.json({ moneda: MONEDA, tarifas: TARIFAS });
});

// POST /api/presupuesto → valida y calcula
app.post('/api/presupuesto', (req, res) => {
  if (!req.is('application/json')) {
    return res.status(400).json({
      error: 'Solicitud incorrecta',
      detalles: ['La petición debe usar la cabecera Content-Type: application/json.']
    });
  }

  const resultado = validarSolicitud(req.body);
  if (!resultado.ok) {
    return res.status(400).json({ error: 'Solicitud incorrecta', detalles: resultado.errores });
  }

  res.status(200).json(calcularPresupuesto(resultado.datos));
});

// GET /api/catalogo → servicios, descripciones, reglas de cálculo y límites
app.get('/api/catalogo', (req, res) => {
  res.json({ moneda: MONEDA_CATALOGO, servicios: CATALOGO, limites: LIMITES });
});

// POST /api/propuesta → { cliente, descripcion } → propuesta de la IA validada contra el catálogo
app.post('/api/propuesta', exigirJson, async (req, res, next) => {
  const v = validarSolicitudCliente(req.body);
  if (!v.ok) return res.status(400).json({ error: 'Solicitud incorrecta', detalles: v.errores });
  try {
    const propuesta = await proponerServicios(v.datos);
    res.json({ cliente: v.datos.cliente, ...propuesta });
  } catch (e) {
    if (!(e instanceof ErrorIA)) return next(e);
    console.error('[IA]', e.message, e.causa ?? '');
    res.status(e.status).json({ error: e.message, reintentar: true });
  }
});

// POST /api/presupuesto/servicios → selección confirmada → importes calculados por el servidor
app.post('/api/presupuesto/servicios', exigirJson, (req, res) => {
  const v = validarSeleccion(req.body);
  if (!v.ok) return res.status(400).json({ error: 'Solicitud incorrecta', detalles: v.errores });
  res.json(calcularPresupuestoServicios(v.datos));
});

// POST /api/presupuesto/pdf → misma selección → PDF (se recalcula: nunca se usan importes del cliente)
app.post('/api/presupuesto/pdf', exigirJson, async (req, res, next) => {
  const v = validarSeleccion(req.body);
  if (!v.ok) return res.status(400).json({ error: 'Solicitud incorrecta', detalles: v.errores });
  try {
    const presupuesto = calcularPresupuestoServicios(v.datos);
    const pdf = await generarPdf(presupuesto);
    res
      .type('application/pdf')
      .set('Content-Disposition', `inline; filename="${nombreArchivo(presupuesto)}"`)
      .send(pdf);
  } catch (e) {
    next(e);
  }
});

// Rutas /api inexistentes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// Si existe el frontend compilado (npm run build), se sirve desde aquí
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
}

// JSON mal formado u otros errores
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La petición es demasiado grande.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Solicitud incorrecta',
      detalles: ['El cuerpo no es un JSON válido.']
    });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
