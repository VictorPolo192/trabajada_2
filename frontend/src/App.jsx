import { useEffect, useState } from 'react';
import Asistente from './Asistente.jsx';
import Calculadora from './Calculadora.jsx';

export default function App() {
  const [estado, setEstado] = useState('comprobando');
  const [vista, setVista] = useState('asistente');

  useEffect(() => {
    fetch('/api/estado')
      .then((r) => r.json())
      .then((d) => setEstado(d.status === 'ok' ? 'ok' : 'error'))
      .catch(() => setEstado('error'));
  }, []);

  return (
    <div className="pagina">
      <header>
        <h1>Presupuesta mi web</h1>
        <p className="sub">Cuéntanos qué necesitas y te proponemos los servicios y el presupuesto</p>
        <span className={`estado estado-${estado}`}>
          API: {estado === 'ok' ? 'en línea' : estado === 'error' ? 'sin conexión' : 'comprobando…'}
        </span>
        <nav className="pestanas">
          <button className={vista === 'asistente' ? 'activa' : ''} onClick={() => setVista('asistente')}>
            Asistente con IA
          </button>
          <button className={vista === 'calculadora' ? 'activa' : ''} onClick={() => setVista('calculadora')}>
            Calculadora rápida
          </button>
        </nav>
      </header>
      {vista === 'asistente' ? <Asistente /> : <Calculadora />}
    </div>
  );
}
