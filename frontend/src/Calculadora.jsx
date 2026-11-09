import { useEffect, useState } from 'react';

const euros = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export default function Calculadora() {
  const [tarifas, setTarifas] = useState(null);
  const [form, setForm] = useState({ tipo: 'corporativa', paginas: 4, formulario: true, segundoIdioma: false });
  const [presupuesto, setPresupuesto] = useState(null);
  const [errores, setErrores] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    fetch('/api/tarifas')
      .then((r) => r.json())
      .then((d) => setTarifas(d.tarifas))
      .catch(() => {});
  }, []);

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  async function enviar(e) {
    e.preventDefault();
    setCargando(true);
    setErrores([]);
    setPresupuesto(null);
    try {
      // paginas se envía como número; el servidor rechaza decimales o valores fuera de rango
      const cuerpo = { ...form, paginas: form.paginas === '' ? null : Number(form.paginas) };
      const res = await fetch('/api/presupuesto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
      });
      const datos = await res.json();
      if (res.ok) setPresupuesto(datos);
      else setErrores(datos.detalles ?? [datos.error ?? `Error ${res.status}`]);
    } catch {
      setErrores(['No se pudo conectar con la API. ¿Está arrancado el servidor?']);
    } finally {
      setCargando(false);
    }
  }

  return (
      <main className="rejilla">
        <form className="tarjeta" onSubmit={enviar}>
          <h2>Tu proyecto</h2>

          <fieldset>
            <legend>Tipo de web</legend>
            <div className="tipos">
              {['landing', 'corporativa'].map((t) => (
                <label key={t} className={`tipo ${form.tipo === t ? 'activo' : ''}`}>
                  <input type="radio" name="tipo" value={t} checked={form.tipo === t} onChange={() => cambiar('tipo', t)} />
                  <strong>{t === 'landing' ? 'Landing' : 'Corporativa'}</strong>
                  <small>{tarifas ? `desde ${euros(tarifas[t].precio)}` : ''}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="campo">
            <span>
              Número de páginas <b>{form.paginas}</b>
            </span>
            <input
              type="range"
              min="1"
              max="20"
              value={Number(form.paginas) || 1}
              onChange={(e) => cambiar('paginas', Number(e.target.value))}
            />
            <input type="number" value={form.paginas} onChange={(e) => cambiar('paginas', e.target.value)} />
            <small>Entre 1 y 20. La primera está incluida en el precio base.</small>
          </label>

          <label className="interruptor">
            <input type="checkbox" checked={form.formulario} onChange={(e) => cambiar('formulario', e.target.checked)} />
            <span>Formulario de contacto {tarifas && <em>+{euros(tarifas.formulario.precio)}</em>}</span>
          </label>

          <label className="interruptor">
            <input type="checkbox" checked={form.segundoIdioma} onChange={(e) => cambiar('segundoIdioma', e.target.checked)} />
            <span>Segundo idioma {tarifas && <em>+{euros(tarifas.segundoIdioma.precio)}</em>}</span>
          </label>

          <button type="submit" disabled={cargando}>
            {cargando ? 'Calculando…' : 'Calcular presupuesto'}
          </button>
        </form>

        <section className="tarjeta resultado">
          <h2>Presupuesto</h2>
          {errores.length > 0 && (
            <div className="errores" role="alert">
              <strong>Hay un problema con la solicitud (400):</strong>
              <ul>
                {errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {presupuesto && (
            <>
              <dl className="desglose">
                <dt>Precio base</dt>
                <dd>{euros(presupuesto.base)}</dd>
                <dt>Páginas adicionales</dt>
                <dd>{euros(presupuesto.paginasAdicionales)}</dd>
                <dt>Formulario</dt>
                <dd>{euros(presupuesto.formulario)}</dd>
                <dt>Segundo idioma</dt>
                <dd>{euros(presupuesto.segundoIdioma)}</dd>
              </dl>
              <div className="total">
                <span>Total</span>
                <strong>{euros(presupuesto.total)}</strong>
              </div>
              <p className="nota">Calculado por el servidor · Moneda: {presupuesto.moneda} · Sin impuestos</p>
            </>
          )}
          {!presupuesto && errores.length === 0 && (
            <p className="vacio">Configura tu web y pulsa «Calcular presupuesto».</p>
          )}
        </section>
      </main>
  );
}
