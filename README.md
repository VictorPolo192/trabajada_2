# Presupuesta mi web

API REST con **Node.js + Express (JavaScript)** que calcula presupuestos de proyectos web con tarifas controladas por el servidor. Incluye una interfaz **React** que consume la API.

**Ampliación (asistente con IA):** el cliente describe su proyecto con sus palabras, la API de **OpenAI** propone servicios del catálogo con su justificación, el usuario revisa y modifica la propuesta, el **servidor** calcula los importes y se descarga el presupuesto en **PDF** tras una vista previa.

> La IA propone servicios y redacta explicaciones. El servidor valida la selección y calcula los precios.

Módulo 0613 · Desarrollo web en entorno servidor · RA7 (CE 7.4, 7.6 y 7.7).

## Requisitos

- Node.js 22.9 o superior (probado con Node 25) — se usa `--env-file-if-exists` para leer `.env`
- npm
- Una clave de la API de OpenAI (solo para el asistente; la calculadora funciona sin ella)

## Instalación

```bash
git clone <URL-del-repositorio>
cd presupuesta-mi-web
npm install
```

Ejecuta `npm install` **una sola vez, desde la carpeta raíz**. El proyecto usa *npm workspaces*: lee los archivos **`package.json`** de la raíz, de `backend/` y de `frontend/` e instala todas las dependencias (`node_modules` no se incluye en el repositorio).

## Configuración de la clave de OpenAI

```bash
cp backend/.env.example backend/.env    # y edita OPENAI_API_KEY
```

| Variable | Obligatoria | Por defecto |
|---|---|---|
| `OPENAI_API_KEY` | Sí (para el asistente) | — |
| `OPENAI_MODEL` | No | `gpt-4.1-mini` (cualquier modelo con *Structured Outputs*) |
| `OPENAI_TIMEOUT_MS` | No | `30000` |
| `PORT` | No | `3000` |

`backend/.env` está en `.gitignore`: **la clave nunca se sube al repositorio** ni llega al navegador (la llamada a OpenAI se hace desde el servidor). Si falta la clave, `/api/propuesta` responde 503 con un mensaje claro y la interfaz permite elegir los servicios manualmente.

## Ejecución (desde la carpeta raíz)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca **el backend (API, puerto 3000)** y **el frontend (React, puerto 5173)** a la vez. Abre **http://localhost:5173** |
| `npm start` | Arranca solo el backend en http://localhost:3000 (si antes se ejecutó `npm run build`, también sirve la web en ese mismo puerto) |
| `npm run build` | Compila el frontend en `frontend/dist/` |
| `npm test` | Ejecuta las pruebas automáticas del backend |

**Puertos:** API → `3000` (se puede cambiar con la variable de entorno `PORT`). Web en desarrollo → `5173`; Vite redirige las peticiones `/api` a la API.

## Despliegue en Vercel

- `vercel.json`: instala con npm, compila el frontend (`frontend/dist`) y redirige `/api/*` a la función `api/index.js`, que reutiliza la app Express del backend.
- En **Project Settings → Environment Variables** añade `OPENAI_API_KEY` (y, si quieres, `OPENAI_MODEL`) y vuelve a desplegar. La clave queda en Vercel, nunca en el repositorio.

## Rutas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/estado` | Devuelve `{ "status": "ok" }` |
| GET | `/api/tarifas` | Devuelve las tarifas que usa el servidor |
| POST | `/api/presupuesto` | Valida la solicitud y devuelve el presupuesto desglosado (calculadora rápida) |
| GET | `/api/catalogo` | Catálogo: id, nombre, descripción, precio y regla de cálculo de cada servicio |
| POST | `/api/propuesta` | `{cliente, descripcion}` → propuesta de la IA validada contra el catálogo |
| POST | `/api/presupuesto/servicios` | Selección confirmada → líneas, importes y total calculados por el servidor |
| POST | `/api/presupuesto/pdf` | Misma selección → PDF (el servidor vuelve a calcular; nunca usa importes del cliente) |

### Tarifas

| Concepto | Clave | Precio |
|---|---|---|
| Landing, incluida la primera página | `landing` | 300 € |
| Web corporativa, incluida la primera página | `corporativa` | 600 € |
| Cada página adicional a la primera | `paginaAdicional` | 50 € |
| Formulario de contacto | `formulario` | 80 € |
| Segundo idioma | `segundoIdioma` | 150 € |

### POST /api/presupuesto

Cabecera obligatoria: `Content-Type: application/json`

```json
{ "tipo": "corporativa", "paginas": 4, "formulario": true, "segundoIdioma": false }
```

Respuesta `200`:

```json
{ "base": 600, "paginasAdicionales": 150, "formulario": 80, "segundoIdioma": 0, "total": 830, "moneda": "EUR" }
```

Respuesta `400` (ejemplo):

```json
{ "error": "Solicitud incorrecta", "detalles": ["\"paginas\" debe estar entre 1 y 20 (recibido: 0)."] }
```

Ejemplo con curl (en PowerShell usa `curl.exe`):

```bash
curl -X POST http://localhost:3000/api/presupuesto -H "Content-Type: application/json" -d "{\"tipo\":\"corporativa\",\"paginas\":4,\"formulario\":true,\"segundoIdioma\":false}"
```

### POST /api/propuesta

```json
{ "cliente": "Restaurante La Brasa Ficticia S.L.", "descripcion": "Necesito una web para un restaurante. Quiero mostrar la carta, tener un formulario para solicitar reservas y ofrecer el contenido en dos idiomas." }
```

Respuesta `200` (ejemplo):

```json
{
  "cliente": "Restaurante La Brasa Ficticia S.L.",
  "resumen": "Web para un restaurante con carta, formulario de reservas y contenido en dos idiomas.",
  "servicios": [
    { "id": "corporativa", "justificacion": "Necesita varias secciones con menú.", "cantidad": null },
    { "id": "paginaAdicional", "justificacion": "Páginas para la carta y las reservas.", "cantidad": 2 },
    { "id": "formulario", "justificacion": "Para recibir solicitudes de reserva.", "cantidad": null },
    { "id": "segundoIdioma", "justificacion": "Contenido en dos idiomas.", "cantidad": null }
  ],
  "dudas": ["¿Qué dos idiomas exactamente?"],
  "noIncluidos": [{ "necesidad": "Reservas con disponibilidad en tiempo real", "motivo": "El formulario solo envía la solicitud por correo." }],
  "faltanDatos": [],
  "avisos": []
}
```

Error de la IA (`502`, `503` o `504`): `{ "error": "El asistente de IA ha devuelto un error (500).", "reintentar": true }`

### POST /api/presupuesto/servicios y /api/presupuesto/pdf

```json
{
  "cliente": "Restaurante La Brasa Ficticia S.L.",
  "resumen": "Web para un restaurante…",
  "servicios": [{ "id": "corporativa" }, { "id": "paginaAdicional", "cantidad": 2 }, { "id": "formulario" }],
  "aclaraciones": ["¿Qué dos idiomas exactamente?"]
}
```

`/servicios` devuelve `{ cliente, fecha, resumen, lineas[{id, concepto, descripcion, cantidad, unidad, precioUnitario, importe}], total, moneda, aclaraciones }`. `/pdf` devuelve el documento (`application/pdf`).

## Asistente con IA

### 1. Catálogo (`backend/src/catalogo.js`)

Es el catálogo del ejercicio anterior. Los precios salen de `tarifas.js` (una sola fuente de verdad):

| id | Nombre | Regla de cálculo | Notas |
|---|---|---|---|
| `landing` | Landing page | 300 € fijo | Tipo de web: elegir **exactamente uno** |
| `corporativa` | Web corporativa | 600 € fijo | Tipo de web: elegir **exactamente uno** |
| `paginaAdicional` | Páginas adicionales | 50 € × páginas | **Requiere cantidad** (1–19) |
| `formulario` | Formulario de contacto | 80 € fijo | |
| `segundoIdioma` | Segundo idioma | 150 € fijo | |

### 2. Solicitud del cliente

`POST /api/propuesta` comprueba en el servidor que el nombre del cliente no esté vacío (máx. 100 caracteres) y que la descripción no esté vacía ni sea solo espacios (10–2000 caracteres). Si no es válida → **400 y no se llama a OpenAI**.

### 3. Llamada a OpenAI (`backend/src/ia.js`)

- Se hace desde el servidor con `fetch` a `/v1/chat/completions`; la clave va en la cabecera `Authorization` y se lee de `OPENAI_API_KEY`.
- Se envían unas instrucciones (rol de sistema), el catálogo **sin precios** (para que el modelo no pueda citarlos ni inventarlos) y la descripción del cliente entre delimitadores. Las instrucciones prohíben inventar servicios, precios, plazos o compromisos, y piden ignorar instrucciones incluidas en el texto del cliente.
- Se usa **Structured Outputs** (`response_format: json_schema`, `strict: true`): el modelo tiene que devolver JSON con `resumen`, `servicios[{id, justificacion, cantidad}]`, `dudas[]` y `noIncluidos[{necesidad, motivo}]`. El campo `id` está restringido con un `enum` a los ids del catálogo.
- **No nos fiamos de la respuesta** (`normalizarPropuestaIA`): se descartan ids que no estén en el catálogo (con un aviso), duplicados, un segundo tipo de web y cantidades fuera de rango, y se ignora cualquier campo inesperado (por ejemplo `precio`). Además se devuelven en `faltanDatos` los datos obligatorios que faltan.
- Errores: sin clave → 503; red caída, HTTP 4xx/5xx, JSON roto o formato inesperado → 502; *timeout* → 504. Siempre con `{ error, reintentar: true }`. La interfaz muestra el mensaje con los botones **«Volver a intentarlo»** y **«Elegir los servicios manualmente»**.

### 4. Revisión y cálculo

La interfaz muestra cada servicio propuesto con su justificación, lo que incluye y su regla de precio. El usuario tiene que **aceptar o eliminar** cada uno, puede **añadir** otros del catálogo y editar el resumen y las aclaraciones. El botón «Confirmar y calcular» está bloqueado mientras falten datos (servicios sin revisar, tipo de web, número de páginas adicionales). El servidor vuelve a validarlo todo (`validarSeleccion`) y calcula con las tarifas (`calcularPresupuestoServicios`). Los `precio` o `total` que envíe el cliente se ignoran.

### 5. PDF

Antes de generar el documento se muestra una **vista previa en HTML** con el mismo contenido que tendrá el PDF. Al aceptar, el servidor genera el PDF, que se muestra en un **visor integrado** con el botón **«Descargar PDF»**. El PDF incluye cliente y fecha, resumen, servicios con descripción, desglose de importes con total y las aclaraciones o aspectos pendientes. Se genera con **exactamente la selección confirmada** y el servidor vuelve a calcular los importes. Si se vuelve atrás para modificar algo, el presupuesto y el PDF anteriores se descartan.

#### Librerías PDF valoradas

| Librería | Dónde se ejecuta | Valoración |
|---|---|---|
| **pdfmake** ✅ (elegida) | Servidor y navegador | Documento **declarativo** (JSON) con tablas, columnas, estilos, saltos de página y pie con numeración. Texto real (seleccionable y nítido). Funciona en el servidor, así que el PDF sale de los importes calculados allí. Con las fuentes estándar PDF no hace falta incluir ficheros de fuentes. |
| PDFKit | Servidor | Muy sólida (pdfmake se apoya en ella), pero de **bajo nivel**: hay que posicionar cada texto y dibujar las tablas a mano. |
| jsPDF (+ jspdf-autotable) | Navegador | Muy popular, pero se genera en el cliente (los importes saldrían del navegador) y la maquetación es manual. Su método `html()` da resultados irregulares. |
| **html2pdf.js / html2canvas + jsPDF** ❌ | Navegador | **No recomendable**: hace una captura de pantalla y la mete en el PDF como **imagen**. El texto no se puede seleccionar ni buscar, se pixela, pesa más y corta mal las páginas. |
| Puppeteer / Playwright (HTML → PDF) | Servidor | Fidelidad perfecta con CSS, pero descarga un **Chromium de unos 150 MB**, consume mucha memoria y es lento para un servidor sencillo. |
| @react-pdf/renderer | Servidor y navegador | Buena opción si se quiere escribir el PDF con componentes React; añade un *runtime* propio bastante pesado. |
| pdf-lib | Servidor y navegador | Excelente para **modificar** PDFs existentes (rellenar formularios, unir páginas), no para maquetar documentos desde cero. |
| `window.print()` + CSS `@media print` | Navegador | Sin dependencias, pero el resultado depende del navegador y de la configuración de impresión del usuario. |

## Estructura del código

```
package.json             Raíz: workspaces y scripts (npm run dev arranca los dos)
backend/                 API con Node.js + Express
  package.json           Dependencias del backend (express, pdfmake)
  .env.example           Plantilla de configuración (copiar a .env, que NO se sube)
  src/
    tarifas.js           Tarifas congeladas (Object.freeze): solo las controla el servidor
    catalogo.js          Catálogo de servicios (id, nombre, descripción, regla) a partir de las tarifas
    limites.js           Límites de longitud
    ia.js                Llamada a OpenAI (instrucciones, esquema JSON, errores)
    validacionPropuesta.js  Valida la solicitud, normaliza la respuesta de la IA y valida la selección final
    calculoServicios.js  Calcula líneas e importes de la selección confirmada
    pdf.js               Documento PDF con pdfmake
    validacion.js        validarSolicitud() de la calculadora rápida
    calculo.js           calcularPresupuesto() de la calculadora rápida
    app.js               Aplicación Express y rutas
    server.js            Arranque del servidor (puerto)
  tests/api.test.js        Pruebas de la calculadora (node:test)
  tests/propuesta.test.js  Pruebas del asistente con un servidor FALSO de OpenAI
frontend/                Interfaz React (Vite)
  package.json           Dependencias del frontend (react, vite)
  vite.config.js         Proxy /api → http://localhost:3000
  index.html
  src/                   main.jsx, App.jsx (pestañas), Asistente.jsx (flujo IA → revisión → PDF),
                         Calculadora.jsx (calculadora del ejercicio anterior), styles.css
```

### Ejemplo de validación

`paginas` se comprueba con `typeof paginas === 'number' && Number.isInteger(paginas)` y después el rango 1–20. Por eso `"4"` (cadena), `2.5`, `0` y `21` se rechazan con 400. Los booleanos se comprueban con `typeof x === 'boolean'`, así que `"false"` no se acepta.

Las propiedades adicionales (por ejemplo `"total": 1`) se ignoran: el validador devuelve un objeto nuevo con solo `tipo`, `paginas`, `formulario` y `segundoIdioma`.

### Ejemplo de cálculo (caso 2)

`Total = precio base + páginas adicionales + extras`

- Base corporativa: **600**
- Páginas adicionales: (4 − 1) × 50 = **150**
- Formulario: **80**
- Segundo idioma: **0**
- **Total = 830 €**

## Tabla de pruebas

### Calculadora rápida (`backend/tests/api.test.js`)

En los casos inválidos, el resto de campos es el del caso 2.

| Caso | Solicitud | Resultado esperado | Resultado obtenido |
|---|---|---|---|
| — | `GET /api/estado` | 200 · `{"status":"ok"}` | 200 · `{"status":"ok"}` ✅ |
| — | `GET /api/tarifas` | 200 · tarifas | 200 · 300 / 600 / 50 / 80 / 150 ✅ |
| 1 | `{"tipo":"landing","paginas":1,"formulario":false,"segundoIdioma":false}` | 200 · Total 300 € | 200 · base 300, total **300** ✅ |
| 2 | `{"tipo":"corporativa","paginas":4,"formulario":true,"segundoIdioma":false}` | 200 · Total 830 € | 200 · 600 + 150 + 80 + 0 = **830** ✅ |
| 3 | `{"tipo":"landing","paginas":2,"formulario":true,"segundoIdioma":true}` | 200 · Total 580 € | 200 · 300 + 50 + 80 + 150 = **580** ✅ |
| 4 | `{"tipo":"landing","paginas":20,"formulario":false,"segundoIdioma":false}` | 200 · Total 1.250 € | 200 · 300 + 950 = **1250** ✅ |
| 5 | `{"tipo":"corporativa","paginas":0,"formulario":true,"segundoIdioma":false}` | 400 | 400 · "paginas" debe estar entre 1 y 20 ✅ |
| 6 | `{"tipo":"corporativa","paginas":21,"formulario":true,"segundoIdioma":false}` | 400 | 400 · "paginas" debe estar entre 1 y 20 ✅ |
| 7 | `{"tipo":"corporativa","paginas":2.5,"formulario":true,"segundoIdioma":false}` | 400 | 400 · "paginas" debe ser un número entero ✅ |
| 8 | `{"tipo":"tienda","paginas":4,"formulario":true,"segundoIdioma":false}` | 400 | 400 · "tipo" debe ser "landing" o "corporativa" ✅ |
| 9 | `{"tipo":"corporativa","paginas":4,"formulario":"false","segundoIdioma":false}` | 400 | 400 · "formulario" debe ser un booleano ✅ |
| Extra | `paginas: "4"` (cadena) | 400 | 400 ✅ |
| Extra | Falta `segundoIdioma` | 400 | 400 ✅ |
| Extra | Caso 2 + `"total":1,"precio":1,"base":0` | 200 · Total 830 € | 200 · **830** (se ignoran) ✅ |
| Extra | Sin `Content-Type: application/json` | 400 | 400 ✅ |
| Extra | JSON mal formado | 400 | 400 ✅ |

### Asistente con IA (`backend/tests/propuesta.test.js`)

Las pruebas usan un **servidor falso de OpenAI** (variable `OPENAI_BASE_URL`). Así se prueba el código real de la llamada (cabeceras, errores HTTP, JSON roto…) sin gastar cuota y con resultados reproducibles. Todos los datos son ficticios.

| Situación | Prueba | Resultado esperado | Obtenido |
|---|---|---|---|
| 1. Solicitud clara | Restaurante: carta, reservas, 2 idiomas | 200 · corporativa + 2 páginas + formulario + 2.º idioma, con justificaciones. A OpenAI se envían la clave, la descripción, el catálogo **sin precios** y un esquema estricto | ✅ |
| 2. Solicitud ambigua | «Quiero algo para que la gente me conozca…» | 200 · `dudas` y `faltanDatos` (tipo de web, n.º de páginas). Calcular sin completar la cantidad → 400 «Falta un dato» | ✅ |
| 3. Servicio no ofrecido | Tienda online + pagos + blog | El id inventado `tiendaOnline` se descarta con aviso; tienda y blog aparecen en `noIncluidos` (pendiente de valorar); intentar calcular con `tiendaOnline` → 400 | ✅ |
| 4. Descripción vacía | `""`, solo espacios, ausente, > 2000 caracteres, sin cliente | 400 con detalle y **0 llamadas** a OpenAI | ✅ |
| 5. Fallo de OpenAI | HTTP 500, 401, 429, respuesta no JSON, JSON con otro formato, servidor inalcanzable | 502 · `{error, reintentar: true}` | ✅ |
| 5. Sin clave | Sin `OPENAI_API_KEY` | 503 con mensaje claro | ✅ |
| 5. Reintento | Fallo y después éxito | 502 → 200 | ✅ |
| 6. Modificación antes del PDF | Se quita el 2.º idioma, se pasa a 4 páginas y se intenta colar `precio: 0` y `total: 1` | Total 930 → **880** (calculado por el servidor). El PDF devuelve `application/pdf`, empieza por `%PDF-`, y su contenido tiene 880,00 €, sin «Segundo idioma» y con las aclaraciones | ✅ |
| 6. Selección incoherente | Vacía, sin tipo de web, dos tipos, cantidad 20 o 2,5, servicio repetido | 400 tanto al calcular como al pedir el PDF | ✅ |

También se ha probado la interfaz de principio a fin en Edge (Playwright): error por descripción vacía, fallo de la IA y «Volver a intentarlo», bloqueo de «Confirmar» con servicios sin revisar y cantidad pendiente, eliminar «Segundo idioma» → total de 780 €, vista previa, generación del PDF y enlace de descarga.

Resultado de `npm test`: **35 pruebas superadas, 0 fallidas.**

Los presupuestos no se guardan en ninguna base de datos.
