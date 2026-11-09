import pdfmake from 'pdfmake';

// Fuentes estándar de PDF (no hace falta incluir ficheros de fuentes).
const FUENTES = { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' };
pdfmake.setFonts({ Helvetica: FUENTES });
// El documento no carga recursos externos ni ficheros locales (solo los nombres de las fuentes estándar).
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((ruta) => Object.values(FUENTES).includes(ruta));

const euros = (n) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(n)} €`;
const fechaLarga = (iso) =>
  new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

const COLOR = '#4b3bbf';

/** Construye la definición del documento (función pura: se puede probar sin generar el PDF). */
export function construirDocumento(p) {
  const filas = p.lineas.map((l) => [
    { stack: [{ text: l.concepto, bold: true }, { text: l.descripcion, fontSize: 8, color: '#555555', margin: [0, 2, 0, 0] }] },
    { text: l.unidad === 'página' ? `${l.cantidad} pág.` : '1', alignment: 'center' },
    { text: euros(l.precioUnitario), alignment: 'right' },
    { text: euros(l.importe), alignment: 'right' }
  ]);

  return {
    info: { title: `Presupuesto - ${p.cliente}`, author: 'Presupuesta mi web' },
    pageSize: 'A4',
    pageMargins: [50, 60, 50, 60],
    defaultStyle: { font: 'Helvetica', fontSize: 10, lineHeight: 1.2 },
    footer: (pagina, total) => ({
      text: `Presupuesta mi web · Página ${pagina} de ${total}`,
      alignment: 'center', fontSize: 8, color: '#888888', margin: [0, 20, 0, 0]
    }),
    content: [
      {
        columns: [
          { text: 'Presupuesta mi web', fontSize: 18, bold: true, color: COLOR },
          { text: 'PRESUPUESTO', alignment: 'right', fontSize: 14, bold: true, color: '#333333' }
        ]
      },
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 495, y2: 6, lineWidth: 1.5, lineColor: COLOR }], margin: [0, 0, 0, 14] },
      {
        columns: [
          { text: [{ text: 'Cliente: ', bold: true }, p.cliente] },
          { text: [{ text: 'Fecha: ', bold: true }, fechaLarga(p.fecha)], alignment: 'right' }
        ],
        margin: [0, 0, 0, 18]
      },

      { text: 'Resumen del proyecto', style: 'titulo' },
      { text: p.resumen || '—', margin: [0, 0, 0, 16] },

      { text: 'Servicios y desglose de importes', style: 'titulo' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 50, 70, 75],
          body: [
            [
              { text: 'Servicio', style: 'cabecera' },
              { text: 'Cant.', style: 'cabecera', alignment: 'center' },
              { text: 'Precio', style: 'cabecera', alignment: 'right' },
              { text: 'Importe', style: 'cabecera', alignment: 'right' }
            ],
            ...filas,
            [
              { text: 'TOTAL', bold: true, colSpan: 3, alignment: 'right', fontSize: 11 }, {}, {},
              { text: euros(p.total), bold: true, alignment: 'right', fontSize: 11, color: COLOR }
            ]
          ]
        },
        layout: {
          fillColor: (i) => (i === 0 ? COLOR : null),
          hLineColor: () => '#dddddd',
          vLineWidth: () => 0,
          paddingTop: () => 6,
          paddingBottom: () => 6
        }
      },
      { text: 'Importes en euros, impuestos no incluidos. Calculados con las tarifas vigentes del servidor.', fontSize: 8, color: '#777777', margin: [0, 4, 0, 16] },

      { text: 'Aclaraciones y aspectos pendientes de concretar', style: 'titulo' },
      p.aclaraciones.length
        ? { ul: p.aclaraciones, margin: [0, 0, 0, 10] }
        : { text: 'No hay aspectos pendientes.', italics: true, color: '#555555' },
      {
        text: 'Los aspectos pendientes no están incluidos en el importe total y se valorarán por separado.',
        fontSize: 8, color: '#777777', margin: [0, 6, 0, 0]
      }
    ],
    styles: {
      titulo: { fontSize: 12, bold: true, color: COLOR, margin: [0, 0, 0, 6] },
      cabecera: { bold: true, color: 'white' }
    }
  };
}

export async function generarPdf(presupuesto) {
  return pdfmake.createPdf(construirDocumento(presupuesto)).getBuffer();
}

export function nombreArchivo(p) {
  const base = p.cliente
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40);
  return `presupuesto-${base || 'cliente'}-${p.fecha}.pdf`;
}
