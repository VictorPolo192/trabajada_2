import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';

let servidor;
let URL_BASE;

before(async () => {
  servidor = app.listen(0);
  await new Promise((r) => servidor.once('listening', r));
  URL_BASE = `http://localhost:${servidor.address().port}`;
});

after(() => servidor.close());

const valido = { tipo: 'corporativa', paginas: 4, formulario: true, segundoIdioma: false };

async function presupuesto(cuerpo) {
  const res = await fetch(`${URL_BASE}/api/presupuesto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  return { status: res.status, body: await res.json() };
}

test('GET /api/estado devuelve {status: "ok"}', async () => {
  const res = await fetch(`${URL_BASE}/api/estado`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('GET /api/tarifas devuelve las tarifas del servidor', async () => {
  const res = await fetch(`${URL_BASE}/api/tarifas`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.tarifas.landing.precio, 300);
  assert.equal(body.tarifas.corporativa.precio, 600);
  assert.equal(body.tarifas.paginaAdicional.precio, 50);
  assert.equal(body.tarifas.formulario.precio, 80);
  assert.equal(body.tarifas.segundoIdioma.precio, 150);
});

test('Caso 1: landing, 1 página, sin extras → 300', async () => {
  const r = await presupuesto({ tipo: 'landing', paginas: 1, formulario: false, segundoIdioma: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 300);
});

test('Caso 2: corporativa, 4 páginas, formulario → 830 con desglose exacto', async () => {
  const r = await presupuesto(valido);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { base: 600, paginasAdicionales: 150, formulario: 80, segundoIdioma: 0, total: 830, moneda: 'EUR' });
});

test('Caso 3: landing, 2 páginas, ambos extras → 580', async () => {
  const r = await presupuesto({ tipo: 'landing', paginas: 2, formulario: true, segundoIdioma: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 580);
});

test('Caso 4: landing, 20 páginas, sin extras → 1250', async () => {
  const r = await presupuesto({ tipo: 'landing', paginas: 20, formulario: false, segundoIdioma: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1250);
});

for (const [n, cambio] of [
  [5, { paginas: 0 }],
  [6, { paginas: 21 }],
  [7, { paginas: 2.5 }],
  [8, { tipo: 'tienda' }],
  [9, { formulario: 'false' }]
]) {
  test(`Caso ${n}: ${JSON.stringify(cambio)} → 400`, async () => {
    const r = await presupuesto({ ...valido, ...cambio });
    assert.equal(r.status, 400);
    assert.ok(r.body.detalles.length > 0);
  });
}

test('Extra: paginas "4" (cadena) → 400', async () => {
  const r = await presupuesto({ ...valido, paginas: '4' });
  assert.equal(r.status, 400);
});

test('Extra: falta un campo obligatorio → 400', async () => {
  const { segundoIdioma, ...incompleto } = valido;
  const r = await presupuesto(incompleto);
  assert.equal(r.status, 400);
});

test('Extra: propiedades adicionales (total, precio) se ignoran', async () => {
  const r = await presupuesto({ ...valido, total: 1, precio: 1, base: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 830);
});

test('Extra: sin Content-Type application/json → 400', async () => {
  const res = await fetch(`${URL_BASE}/api/presupuesto`, { method: 'POST', body: JSON.stringify(valido) });
  assert.equal(res.status, 400);
});

test('Extra: JSON mal formado → 400', async () => {
  const res = await fetch(`${URL_BASE}/api/presupuesto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{tipo: landing'
  });
  assert.equal(res.status, 400);
});
