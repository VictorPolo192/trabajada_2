import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { construirDocumento } from '../src/pdf.js';
import { calcularPresupuestoServicios } from '../src/calculoServicios.js';

/*
 * Servidor FALSO de OpenAI: así se prueba el código real de la llamada (fetch, cabeceras,
 * errores HTTP, JSON roto…) sin gastar cuota ni depender de la red.
 * Cada prueba indica qué debe responder con `respuestaFalsa`.
 */
let falsoOpenAI;
let api;
let URL_API;
let llamadas = [];
let respuestaFalsa = null; // { status, contenido } | { status, cuerpoCrudo }

const completion = (obj) => ({ choices: [{ message: { role: 'assistant', content: JSON.stringify(obj) } }] });

before(async () => {
  falsoOpenAI = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', () => {
      llamadas.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(cuerpo) });
      const r = respuestaFalsa;
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(r.cuerpoCrudo ?? JSON.stringify(completion(r.contenido)));
    });
  });
  await new Promise((r) => falsoOpenAI.listen(0, r));
  process.env.OPENAI_BASE_URL = `http://localhost:${falsoOpenAI.address().port}/v1`;
  process.env.OPENAI_API_KEY = 'sk-prueba-ficticia';

  api = app.listen(0);
  await new Promise((r) => api.once('listening', r));
  URL_API = `http://localhost:${api.address().port}`;
});

after(() => {
  api.close();
  falsoOpenAI.close();
});

beforeEach(() => {
  llamadas = [];
  respuestaFalsa = null;
  process.env.OPENAI_API_KEY = 'sk-prueba-ficticia';
});

async function post(ruta, cuerpo) {
  const res = await fetch(`${URL_API}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  const tipo = res.headers.get('content-type') ?? '';
  return { status: res.status, tipo, headers: res.headers, body: tipo.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}

const RESTAURANTE = {
  cliente: 'Restaurante La Brasa Ficticia S.L.',
  descripcion:
    'Necesito una web para un restaurante. Quiero mostrar la carta, tener un formulario para solicitar reservas y ofrecer el contenido en dos idiomas.'
};

// ─────────────────────────── Catálogo ───────────────────────────

test('GET /api/catalogo: cada servicio tiene id, nombre, descripción y precio/regla', async () => {
  const res = await fetch(`${URL_API}/api/catalogo`);
  const { servicios } = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(servicios.map((s) => s.id), ['landing', 'corporativa', 'paginaAdicional', 'formulario', 'segundoIdioma']);
  for (const s of servicios) {
    assert.ok(s.id && s.nombre && s.descripcion && s.regla);
    assert.equal(typeof s.precio, 'number');
  }
});

// ─────────────────── 1. Solicitud clara que encaja ───────────────────

test('Caso 1 · solicitud clara: devuelve resumen, servicios del catálogo y justificaciones', async () => {
  respuestaFalsa = {
    status: 200,
    contenido: {
      resumen: 'Web para un restaurante con carta, reservas y dos idiomas.',
      servicios: [
        { id: 'corporativa', justificacion: 'Necesita varias secciones con menú.', cantidad: null },
        { id: 'paginaAdicional', justificacion: 'Páginas de carta y reservas.', cantidad: 2 },
        { id: 'formulario', justificacion: 'Para recibir solicitudes de reserva.', cantidad: null },
        { id: 'segundoIdioma', justificacion: 'Contenido en dos idiomas.', cantidad: null }
      ],
      dudas: [],
      noIncluidos: []
    }
  };
  const r = await post('/api/propuesta', RESTAURANTE);
  assert.equal(r.status, 200);
  assert.equal(r.body.cliente, RESTAURANTE.cliente);
  assert.deepEqual(r.body.servicios.map((s) => s.id), ['corporativa', 'paginaAdicional', 'formulario', 'segundoIdioma']);
  assert.equal(r.body.servicios[1].cantidad, 2);
  assert.ok(r.body.servicios.every((s) => s.justificacion.length > 0));
  assert.deepEqual(r.body.dudas, []);

  // Lo que se envió a OpenAI: clave en cabecera, descripción, catálogo SIN precios y esquema estricto
  const [ll] = llamadas;
  assert.equal(ll.url, '/v1/chat/completions');
  assert.equal(ll.auth, 'Bearer sk-prueba-ficticia');
  const usuario = ll.body.messages.find((m) => m.role === 'user').content;
  assert.ok(usuario.includes(RESTAURANTE.descripcion));
  assert.ok(usuario.includes('"id": "paginaAdicional"'));
  assert.ok(!/precio|€/i.test(usuario), 'el catálogo enviado a la IA no debe contener precios');
  assert.equal(ll.body.response_format.json_schema.strict, true);
});

// ─────────────── 2. Solicitud ambigua que necesita aclaraciones ───────────────

test('Caso 2 · solicitud ambigua: devuelve dudas y deja la cantidad por completar', async () => {
  respuestaFalsa = {
    status: 200,
    contenido: {
      resumen: 'El cliente quiere presencia en internet y un medio de contacto.',
      servicios: [
        { id: 'formulario', justificacion: 'Quiere que le puedan escribir.', cantidad: null },
        { id: 'paginaAdicional', justificacion: 'Posibles secciones extra.', cantidad: null }
      ],
      dudas: ['¿A qué se dedica y qué quiere mostrar?', '¿Una sola página o varias?'],
      noIncluidos: []
    }
  };
  const r = await post('/api/propuesta', { cliente: 'Laura Pruebas', descripcion: 'Quiero algo para que la gente me conozca.' });
  assert.equal(r.status, 200);
  assert.equal(r.body.servicios.find((s) => s.id === 'paginaAdicional').cantidad, null);
  assert.equal(r.body.dudas.length, 2);
  // El servidor detecta por su cuenta los datos obligatorios que faltan: tipo de web y cantidad
  assert.ok(r.body.faltanDatos.some((d) => /tipo de web/.test(d)));
  assert.ok(r.body.faltanDatos.some((d) => /páginas adicionales/.test(d)));

  // Sin completar la cantidad no se puede calcular
  const calc = await post('/api/presupuesto/servicios', {
    cliente: 'Laura Pruebas',
    resumen: r.body.resumen,
    servicios: [{ id: 'landing' }, { id: 'paginaAdicional', cantidad: null }],
    aclaraciones: r.body.dudas
  });
  assert.equal(calc.status, 400);
  assert.ok(calc.body.detalles.some((d) => /Falta un dato/.test(d)));
});

// ─────────────── 3. Petición de un servicio que no ofrecemos ───────────────

test('Caso 3 · servicio no ofrecido: se descartan ids inventados y se marca como pendiente de valorar', async () => {
  respuestaFalsa = {
    status: 200,
    contenido: {
      resumen: 'Tienda online de zapatos con pago con tarjeta y blog.',
      servicios: [
        { id: 'corporativa', justificacion: 'Estructura de varias páginas.', cantidad: null },
        { id: 'tiendaOnline', justificacion: 'Para vender.', cantidad: null, precio: 1 }, // id inventado
        { id: 'formulario', justificacion: 'Página de contacto.', cantidad: null }
      ],
      dudas: [],
      noIncluidos: [
        { necesidad: 'Tienda online con carrito y pago con tarjeta', motivo: 'No forma parte del catálogo.' },
        { necesidad: 'Blog', motivo: 'No forma parte del catálogo.' }
      ]
    }
  };
  const r = await post('/api/propuesta', {
    cliente: 'Zapatería Inventada S.A.',
    descripcion: 'Queremos una tienda online para vender zapatos con pago con tarjeta y un blog.'
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.servicios.map((s) => s.id), ['corporativa', 'formulario']);
  assert.ok(r.body.avisos.some((a) => a.includes('tiendaOnline')));
  assert.equal(r.body.noIncluidos.length, 2);
  assert.ok(!('precio' in r.body.servicios[0]));

  // Y aunque el cliente intente colar ese servicio al calcular, el servidor lo rechaza
  const calc = await post('/api/presupuesto/servicios', {
    cliente: 'Zapatería Inventada S.A.',
    servicios: [{ id: 'corporativa' }, { id: 'tiendaOnline' }]
  });
  assert.equal(calc.status, 400);
});

// ─────────────────────── 4. Descripción vacía ───────────────────────

for (const [nombre, cuerpo] of [
  ['vacía', { cliente: 'Cliente de prueba', descripcion: '' }],
  ['solo espacios', { cliente: 'Cliente de prueba', descripcion: '   \n  ' }],
  ['ausente', { cliente: 'Cliente de prueba' }],
  ['demasiado larga', { cliente: 'Cliente de prueba', descripcion: 'a'.repeat(2001) }],
  ['sin cliente', { cliente: '  ', descripcion: RESTAURANTE.descripcion }]
]) {
  test(`Caso 4 · descripción ${nombre} → 400 y NO se llama a OpenAI`, async () => {
    const r = await post('/api/propuesta', cuerpo);
    assert.equal(r.status, 400);
    assert.ok(r.body.detalles.length > 0);
    assert.equal(llamadas.length, 0);
  });
}

// ─────────────────── 5. Fallo en la llamada a OpenAI ───────────────────

for (const [nombre, falso, statusEsperado] of [
  ['error 500 de OpenAI', { status: 500, cuerpoCrudo: '{"error":{"message":"server error"}}' }, 502],
  ['clave no válida (401)', { status: 401, cuerpoCrudo: '{"error":{"message":"invalid key"}}' }, 502],
  ['cuota agotada (429)', { status: 429, cuerpoCrudo: '{"error":{"message":"rate limit"}}' }, 502],
  ['respuesta que no es JSON', { status: 200, cuerpoCrudo: '<html>oops</html>' }, 502],
  ['contenido con formato inesperado', { status: 200, contenido: { hola: 'mundo' } }, 502]
]) {
  test(`Caso 5 · ${nombre} → ${statusEsperado} con mensaje y opción de reintentar`, async () => {
    respuestaFalsa = falso;
    const r = await post('/api/propuesta', RESTAURANTE);
    assert.equal(r.status, statusEsperado);
    assert.equal(typeof r.body.error, 'string');
    assert.equal(r.body.reintentar, true);
  });
}

test('Caso 5 · OpenAI inalcanzable → 502 con reintentar', async () => {
  const anterior = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1'; // puerto cerrado
  try {
    const r = await post('/api/propuesta', RESTAURANTE);
    assert.equal(r.status, 502);
    assert.equal(r.body.reintentar, true);
  } finally {
    process.env.OPENAI_BASE_URL = anterior;
  }
});

test('Caso 5 · sin OPENAI_API_KEY → 503 con mensaje claro', async () => {
  delete process.env.OPENAI_API_KEY;
  const r = await post('/api/propuesta', RESTAURANTE);
  assert.equal(r.status, 503);
  assert.match(r.body.error, /OPENAI_API_KEY/);
  assert.equal(llamadas.length, 0);
});

test('Caso 5 · reintento: tras un fallo, la siguiente llamada funciona', async () => {
  respuestaFalsa = { status: 500, cuerpoCrudo: '{}' };
  assert.equal((await post('/api/propuesta', RESTAURANTE)).status, 502);
  respuestaFalsa = {
    status: 200,
    contenido: { resumen: 'Web.', servicios: [{ id: 'landing', justificacion: 'x', cantidad: null }], dudas: [], noIncluidos: [] }
  };
  assert.equal((await post('/api/propuesta', RESTAURANTE)).status, 200);
});

// ──────────── 6. Modificación de los servicios antes del PDF ────────────

test('Caso 6 · modificar la selección cambia el cálculo y el PDF refleja la selección final', async () => {
  const original = {
    cliente: RESTAURANTE.cliente,
    resumen: 'Web para restaurante.',
    servicios: [{ id: 'corporativa' }, { id: 'paginaAdicional', cantidad: 2 }, { id: 'formulario' }, { id: 'segundoIdioma' }],
    aclaraciones: ['Reservas con disponibilidad en tiempo real: pendiente de valorar.']
  };
  const r1 = await post('/api/presupuesto/servicios', original);
  assert.equal(r1.status, 200);
  assert.equal(r1.body.total, 600 + 100 + 80 + 150); // 930

  // El usuario elimina el segundo idioma, cambia a 4 páginas adicionales e intenta colar un total falso
  const modificada = {
    ...original,
    servicios: [{ id: 'corporativa' }, { id: 'paginaAdicional', cantidad: 4, precio: 0 }, { id: 'formulario' }],
    total: 1
  };
  const r2 = await post('/api/presupuesto/servicios', modificada);
  assert.equal(r2.status, 200);
  assert.equal(r2.body.total, 600 + 200 + 80); // 880: el precio y el total enviados se ignoran
  assert.deepEqual(r2.body.lineas.map((l) => l.id), ['corporativa', 'paginaAdicional', 'formulario']);

  const pdf = await post('/api/presupuesto/pdf', modificada);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.tipo, 'application/pdf');
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdf.headers.get('content-disposition'), /presupuesto-restaurante-la-brasa-ficticia-s-l-\d{4}-\d{2}-\d{2}\.pdf/);

  // El contenido del documento corresponde a la selección final y a los importes del servidor
  const doc = JSON.stringify(construirDocumento(calcularPresupuestoServicios(modificada)));
  assert.ok(doc.includes('880,00 €'));
  assert.ok(doc.includes('Formulario de contacto'));
  assert.ok(!doc.includes('Segundo idioma'));
  assert.ok(doc.includes(RESTAURANTE.cliente));
  assert.ok(doc.includes('Reservas con disponibilidad en tiempo real'));
});

test('Caso 6 · selección incompleta o incoherente → 400 (también en el PDF)', async () => {
  const base = { cliente: 'Cliente de prueba', resumen: '' };
  for (const servicios of [
    [], // vacía
    [{ id: 'formulario' }], // sin tipo de web
    [{ id: 'landing' }, { id: 'corporativa' }], // dos tipos
    [{ id: 'landing' }, { id: 'paginaAdicional', cantidad: 20 }], // fuera de rango
    [{ id: 'landing' }, { id: 'paginaAdicional', cantidad: 2.5 }],
    [{ id: 'landing' }, { id: 'landing' }] // repetido
  ]) {
    assert.equal((await post('/api/presupuesto/servicios', { ...base, servicios })).status, 400, JSON.stringify(servicios));
    assert.equal((await post('/api/presupuesto/pdf', { ...base, servicios })).status, 400, JSON.stringify(servicios));
  }
});
