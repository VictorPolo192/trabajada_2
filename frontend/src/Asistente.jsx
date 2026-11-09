import { useEffect, useMemo, useRef, useState } from 'react';

const euros = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
const fechaLarga = (iso) =>
  new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`)
  );

// Datos FICTICIOS para probar los distintos casos.
const EJEMPLOS = [
  {
    etiqueta: 'Solicitud clara',
    cliente: 'Restaurante La Brasa Ficticia S.L.',
    descripcion:
      'Necesito una web para un restaurante. Quiero mostrar la carta, tener un formulario para solicitar reservas y ofrecer el contenido en dos idiomas (español e inglés). Las páginas serían: inicio, carta y reservas.'
  },
  {
    etiqueta: 'Solicitud ambigua',
    cliente: 'Laura Pruebas',
    descripcion: 'Quiero algo para que la gente me conozca en internet y pueda escribirme. No sé muy bien qué necesito.'
  },
  {
    etiqueta: 'Fuera de catálogo',
    cliente: 'Zapatería Inventada S.A.',
    descripcion:
      'Queremos una tienda online para vender zapatos con pago con tarjeta, carrito de la compra y un blog. También una página de contacto.'
  }
];

const ETIQUETAS_PASO = ['Tu solicitud', 'Revisa la propuesta', 'Presupuesto y PDF'];

/** Petición JSON al servidor. Devuelve { ok, status, datos } y nunca lanza por errores HTTP. */
async function pedir(url, cuerpo) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    const datos = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, datos };
  } catch {
    return { ok: false, status: 0, datos: { error: 'No se pudo conectar con el servidor. ¿Está arrancado?', reintentar: true } };
  }
}

export default function Asistente() {
  const [catalogo, setCatalogo] = useState([]);
  const [limites, setLimites] = useState({ cliente: 100, descripcion: 2000 });
  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState({ cliente: '', descripcion: '' });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null); // { mensaje, detalles?, reintentar? }

  // Revisión
  const [resumen, setResumen] = useState('');
  const [avisos, setAvisos] = useState([]);
  const [items, setItems] = useState([]); // { id, justificacion, cantidad, estado: 'pendiente'|'aceptado'|'eliminado', origen }
  const [aclaraciones, setAclaraciones] = useState([]);
  const [nuevaAclaracion, setNuevaAclaracion] = useState('');
  const [servicioParaAnadir, setServicioParaAnadir] = useState('');

  // Presupuesto
  const [presupuesto, setPresupuesto] = useState(null);
  const [seleccionEnviada, setSeleccionEnviada] = useState(null);
  const [pdf, setPdf] = useState(null); // { url, nombre }
  const pdfUrlRef = useRef(null);

  useEffect(() => {
    fetch('/api/catalogo')
      .then((r) => r.json())
      .then((d) => {
        setCatalogo(d.servicios);
        setLimites(d.limites);
      })
      .catch(() => setError({ mensaje: 'No se pudo cargar el catálogo de servicios.' }));
    return () => pdfUrlRef.current && URL.revokeObjectURL(pdfUrlRef.current);
  }, []);

  const def = (id) => catalogo.find((s) => s.id === id);

  function limpiarPdf() {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = null;
    setPdf(null);
  }

  // ───────────── Paso 1: pedir propuesta a la IA ─────────────
  async function pedirPropuesta(e) {
    e?.preventDefault();
    setCargando(true);
    setError(null);
    const r = await pedir('/api/propuesta', form);
    setCargando(false);
    if (!r.ok) {
      setError({
        mensaje: r.datos.error ?? `Error ${r.status}`,
        detalles: r.datos.detalles,
        reintentar: r.datos.reintentar ?? r.status >= 500
      });
      return;
    }
    const p = r.datos;
    setResumen(p.resumen);
    setAvisos(p.avisos ?? []);
    setItems(p.servicios.map((s) => ({ ...s, estado: 'pendiente', origen: 'ia' })));
    setAclaraciones([
      ...p.dudas,
      ...p.noIncluidos.map((n) => `${n.necesidad}: no incluido en el catálogo, pendiente de valorar. ${n.motivo}`.trim())
    ]);
    setPresupuesto(null);
    limpiarPdf();
    setPaso(1);
  }

  function seguirSinIA() {
    setError(null);
    setResumen('');
    setAvisos(['Propuesta creada manualmente, sin asistente de IA.']);
    setItems([]);
    setAclaraciones([]);
    setPresupuesto(null);
    limpiarPdf();
    setPaso(1);
  }

  // ───────────── Paso 2: revisar ─────────────
  const cambiarItem = (id, cambios) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
  const activos = items.filter((x) => x.estado !== 'eliminado');
  const disponibles = catalogo.filter((s) => !activos.some((x) => x.id === s.id));

  function anadirServicio() {
    if (!servicioParaAnadir) return;
    const existente = items.find((x) => x.id === servicioParaAnadir);
    if (existente) cambiarItem(servicioParaAnadir, { estado: 'aceptado' });
    else
      setItems((xs) => [
        ...xs,
        { id: servicioParaAnadir, justificacion: 'Añadido por el usuario.', cantidad: null, estado: 'aceptado', origen: 'manual' }
      ]);
    setServicioParaAnadir('');
  }

  const problemas = useMemo(() => {
    const p = [];
    const pendientes = items.filter((x) => x.estado === 'pendiente');
    if (pendientes.length) p.push(`Acepta o elimina los servicios propuestos (${pendientes.length} sin revisar).`);
    const aceptados = items.filter((x) => x.estado === 'aceptado');
    if (!pendientes.length) {
      if (!aceptados.length) p.push('Selecciona al menos un servicio.');
      const bases = aceptados.filter((x) => def(x.id)?.grupo === 'base');
      if (bases.length !== 1) p.push('Debes elegir exactamente un tipo de web: landing o corporativa.');
    }
    for (const x of aceptados) {
      const d = def(x.id);
      if (!d?.cantidad) continue;
      const c = x.cantidad;
      if (!Number.isInteger(c) || c < d.cantidad.min || c > d.cantidad.max)
        p.push(`Completa «${d.nombre}»: ${d.cantidad.etiqueta.toLowerCase()} (entre ${d.cantidad.min} y ${d.cantidad.max}).`);
    }
    return p;
  }, [items, catalogo]);

  function cuerpoSeleccion() {
    return {
      cliente: form.cliente,
      resumen,
      servicios: items.filter((x) => x.estado === 'aceptado').map(({ id, cantidad }) => ({ id, cantidad })),
      aclaraciones
    };
  }

  async function calcular() {
    setCargando(true);
    setError(null);
    limpiarPdf();
    const cuerpo = cuerpoSeleccion();
    const r = await pedir('/api/presupuesto/servicios', cuerpo);
    setCargando(false);
    if (!r.ok) {
      setError({ mensaje: r.datos.error ?? `Error ${r.status}`, detalles: r.datos.detalles });
      return;
    }
    setPresupuesto(r.datos);
    setSeleccionEnviada(cuerpo); // el PDF se genera con EXACTAMENTE esta selección
    setPaso(2);
  }

  // ───────────── Paso 3: PDF ─────────────
  async function generarPdf() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/presupuesto/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seleccionEnviada)
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError({ mensaje: d.error ?? `Error ${res.status} al generar el PDF`, detalles: d.detalles, reintentar: true });
        return;
      }
      const blob = await res.blob();
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'presupuesto.pdf';
      limpiarPdf();
      pdfUrlRef.current = URL.createObjectURL(blob);
      setPdf({ url: pdfUrlRef.current, nombre });
    } catch {
      setError({ mensaje: 'No se pudo conectar con el servidor para generar el PDF.', reintentar: true });
    } finally {
      setCargando(false);
    }
  }

  function volverARevisar() {
    setPresupuesto(null);
    limpiarPdf();
    setError(null);
    setPaso(1);
  }

  // ───────────── Render ─────────────
  return (
    <div className="asistente">
      <ol className="pasos">
        {ETIQUETAS_PASO.map((t, i) => (
          <li key={t} className={i === paso ? 'actual' : i < paso ? 'hecho' : ''}>
            <span>{i + 1}</span> {t}
          </li>
        ))}
      </ol>

      {error && (
        <div className="errores" role="alert">
          <strong>{error.mensaje}</strong>
          {error.detalles?.length > 0 && (
            <ul>
              {error.detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {error.reintentar && paso === 0 && (
            <div className="acciones">
              <button type="button" onClick={pedirPropuesta} disabled={cargando}>
                {cargando ? 'Reintentando…' : 'Volver a intentarlo'}
              </button>
              <button type="button" className="secundario" onClick={seguirSinIA} disabled={!form.cliente.trim()}>
                Elegir los servicios manualmente
              </button>
            </div>
          )}
        </div>
      )}

      {paso === 0 && (
        <form className="tarjeta" onSubmit={pedirPropuesta}>
          <h2>Cuéntanos tu proyecto</h2>
          <div className="ejemplos">
            <small>Probar con datos ficticios:</small>
            {EJEMPLOS.map((ej) => (
              <button
                type="button"
                key={ej.etiqueta}
                className="chip"
                onClick={() => setForm({ cliente: ej.cliente, descripcion: ej.descripcion })}
              >
                {ej.etiqueta}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setForm({ cliente: 'Cliente de prueba', descripcion: '' })}>
              Descripción vacía
            </button>
          </div>
          <label className="campo">
            <span>Nombre del cliente o empresa</span>
            <input
              type="text"
              value={form.cliente}
              maxLength={limites.cliente}
              onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              placeholder="Ej.: Restaurante La Brasa Ficticia S.L."
            />
          </label>
          <label className="campo">
            <span>¿Qué necesitas?</span>
            <textarea
              rows={7}
              value={form.descripcion}
              maxLength={limites.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej.: Necesito una web para un restaurante. Quiero mostrar la carta, tener un formulario para solicitar reservas y ofrecer el contenido en dos idiomas."
            />
            <small>
              {form.descripcion.length} / {limites.descripcion} caracteres
            </small>
          </label>
          {/* Sin validación en el navegador a propósito: la comprueba el servidor (400 si está vacía). */}
          <button type="submit" disabled={cargando}>
            {cargando ? 'Analizando tu solicitud…' : 'Obtener propuesta'}
          </button>
        </form>
      )}

      {paso === 1 && (
        <div className="rejilla rejilla-revision">
          <section className="tarjeta">
            <h2>Servicios propuestos</h2>
            {avisos.map((a) => (
              <p className="aviso" key={a}>
                ⚠ {a}
              </p>
            ))}
            {items.length === 0 && <p className="vacio">No hay servicios. Añade alguno del catálogo.</p>}
            <ul className="servicios">
              {items.map((x) => {
                const d = def(x.id);
                if (!d) return null;
                return (
                  <li key={x.id} className={`servicio ${x.estado}`}>
                    <div className="servicio-cab">
                      <div>
                        <strong>{d.nombre}</strong>
                        <small className="regla">{d.regla}</small>
                      </div>
                      <div className="botones">
                        {x.estado !== 'aceptado' && (
                          <button type="button" className="mini ok" onClick={() => cambiarItem(x.id, { estado: 'aceptado' })}>
                            {x.estado === 'eliminado' ? 'Recuperar' : 'Aceptar'}
                          </button>
                        )}
                        {x.estado !== 'eliminado' && (
                          <button type="button" className="mini ko" onClick={() => cambiarItem(x.id, { estado: 'eliminado' })}>
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="justificacion">
                      {x.origen === 'ia' ? <em>Por qué: </em> : null}
                      {x.justificacion}
                    </p>
                    <p className="incluye">{d.descripcion}</p>
                    {d.cantidad && x.estado !== 'eliminado' && (
                      <label className="cantidad">
                        {d.cantidad.etiqueta}:
                        <input
                          type="number"
                          min={d.cantidad.min}
                          max={d.cantidad.max}
                          value={x.cantidad ?? ''}
                          className={Number.isInteger(x.cantidad) ? '' : 'falta'}
                          placeholder="Falta"
                          onChange={(e) =>
                            cambiarItem(x.id, { cantidad: e.target.value === '' ? null : Number(e.target.value) })
                          }
                        />
                      </label>
                    )}
                    <span className={`etiqueta-estado ${x.estado}`}>
                      {{ pendiente: 'Pendiente de revisar', aceptado: 'Aceptado', eliminado: 'Eliminado' }[x.estado]}
                    </span>
                  </li>
                );
              })}
            </ul>
            {items.some((x) => x.estado === 'pendiente') && (
              <button
                type="button"
                className="secundario"
                onClick={() => setItems((xs) => xs.map((x) => (x.estado === 'pendiente' ? { ...x, estado: 'aceptado' } : x)))}
              >
                Aceptar todos los pendientes
              </button>
            )}
            <div className="anadir">
              <select value={servicioParaAnadir} onChange={(e) => setServicioParaAnadir(e.target.value)}>
                <option value="">Añadir un servicio del catálogo…</option>
                {disponibles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {s.regla}
                  </option>
                ))}
              </select>
              <button type="button" className="secundario" onClick={anadirServicio} disabled={!servicioParaAnadir}>
                Añadir
              </button>
            </div>
          </section>

          <section className="tarjeta">
            <h2>Resumen del proyecto</h2>
            <textarea rows={5} value={resumen} maxLength={1500} onChange={(e) => setResumen(e.target.value)} />

            <h2 className="separado">Aclaraciones y aspectos pendientes</h2>
            {aclaraciones.length === 0 && <p className="vacio">No hay aclaraciones.</p>}
            <ul className="aclaraciones">
              {aclaraciones.map((a, i) => (
                <li key={i}>
                  <textarea
                    rows={Math.min(6, Math.max(2, Math.ceil(a.length / 38)))}
                    value={a}
                    maxLength={400}
                    onChange={(e) => setAclaraciones((xs) => xs.map((y, j) => (j === i ? e.target.value : y)))}
                  />
                  <button
                    type="button"
                    className="mini ko"
                    aria-label="Quitar aclaración"
                    onClick={() => setAclaraciones((xs) => xs.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="anadir">
              <input
                type="text"
                value={nuevaAclaracion}
                maxLength={400}
                placeholder="Añadir una aclaración…"
                onChange={(e) => setNuevaAclaracion(e.target.value)}
              />
              <button
                type="button"
                className="secundario"
                disabled={!nuevaAclaracion.trim()}
                onClick={() => {
                  setAclaraciones((xs) => [...xs, nuevaAclaracion.trim()]);
                  setNuevaAclaracion('');
                }}
              >
                Añadir
              </button>
            </div>

            {problemas.length > 0 && (
              <div className="pendientes">
                <strong>Antes de continuar:</strong>
                <ul>
                  {problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="acciones">
              <button type="button" className="secundario" onClick={() => setPaso(0)}>
                ← Cambiar la solicitud
              </button>
              <button type="button" onClick={calcular} disabled={cargando || problemas.length > 0}>
                {cargando ? 'Calculando…' : 'Confirmar y calcular'}
              </button>
            </div>
          </section>
        </div>
      )}

      {paso === 2 && presupuesto && (
        <section className="tarjeta">
          {!pdf ? (
            <>
              <h2>Revisa el contenido del presupuesto</h2>
              <p className="nota">Así quedará el documento. Los importes los ha calculado el servidor.</p>
              <article className="documento">
                <header className="doc-cab">
                  <strong>Presupuesta mi web</strong>
                  <span>PRESUPUESTO</span>
                </header>
                <div className="doc-datos">
                  <span>
                    <b>Cliente:</b> {presupuesto.cliente}
                  </span>
                  <span>
                    <b>Fecha:</b> {fechaLarga(presupuesto.fecha)}
                  </span>
                </div>
                <h3>Resumen del proyecto</h3>
                <p>{presupuesto.resumen || '—'}</p>
                <h3>Servicios y desglose de importes</h3>
                <div className="tabla-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Servicio</th>
                        <th>Cant.</th>
                        <th>Precio</th>
                        <th>Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presupuesto.lineas.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <b>{l.concepto}</b>
                            <small>{l.descripcion}</small>
                          </td>
                          <td>{l.unidad === 'página' ? `${l.cantidad} pág.` : 1}</td>
                          <td>{euros(l.precioUnitario)}</td>
                          <td>{euros(l.importe)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>TOTAL</td>
                        <td>{euros(presupuesto.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <h3>Aclaraciones y aspectos pendientes de concretar</h3>
                {presupuesto.aclaraciones.length ? (
                  <ul>
                    {presupuesto.aclaraciones.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    <i>No hay aspectos pendientes.</i>
                  </p>
                )}
              </article>
              <div className="acciones">
                <button type="button" className="secundario" onClick={volverARevisar}>
                  ← Modificar servicios
                </button>
                <button type="button" onClick={generarPdf} disabled={cargando}>
                  {cargando ? 'Generando PDF…' : 'Todo correcto: generar PDF'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>Vista previa del PDF</h2>
              <iframe className="visor-pdf" src={pdf.url} title="Vista previa del presupuesto en PDF" />
              <div className="acciones">
                <button type="button" className="secundario" onClick={volverARevisar}>
                  ← Modificar servicios
                </button>
                <a className="boton" href={pdf.url} download={pdf.nombre}>
                  Descargar PDF
                </a>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
