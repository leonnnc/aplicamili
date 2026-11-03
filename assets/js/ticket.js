/*
 * Impresión para impresoras térmicas de 58 mm y 80 mm.
 * El ticket se arma en un iframe aparte con su propia hoja de estilos: el
 * navegador lo manda al driver de la impresora con el ancho correcto, sin
 * imprimir la aplicación ni una página en blanco antes.
 */
window.Ticket = (function () {
  'use strict';

  const CLAVE = 'lavamili.v1.impresion';
  const ANCHOS = [58, 80];

  /* `papel` es el ancho del rollo y `util` la zona imprimible del cabezal:
     48 mm en rollos de 58 y 72 mm en los de 80. */
  const MEDIDAS = {
    58: { papel: 58, util: 48, fuente: 10.5, titulo: 14, pequena: 9, total: 12.5 },
    80: { papel: 80, util: 72, fuente: 12, titulo: 16, pequena: 10.5, total: 14 }
  };

  function leerPreferencia() {
    let guardado = {};
    try {
      guardado = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {};
    } catch (error) {
      guardado = {};
    }
    const pedido = Number(guardado.ancho);
    const base = Number((CONFIG.impresion || {}).ancho);
    const ancho = ANCHOS.includes(pedido) ? pedido : ANCHOS.includes(base) ? base : 80;
    return { ancho };
  }

  function guardar(cambios) {
    const actual = leerPreferencia();
    const siguiente = { ...actual, ...cambios };
    if (ANCHOS.includes(Number(siguiente.ancho))) siguiente.ancho = Number(siguiente.ancho);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(siguiente));
    } catch (error) {
      /* sin espacio o sin permisos: se queda en memoria para esta sesión */
    }
    return siguiente;
  }

  function documento(html, ancho) {
    const m = MEDIDAS[ancho] || MEDIDAS[80];
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Ticket</title>
<style>
  @page { size: ${m.papel}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html { margin: 0; padding: 0; background: #fff; color: #000; width: ${m.papel}mm; }
  /* Se limita al ancho imprimible del cabezal para que no corte el lado derecho. */
  body {
    margin: 0 auto;
    padding: 3mm 0 6mm;
    background: #fff;
    color: #000;
    width: ${m.util}mm;
  }
  body {
    font-family: "Consolas", "Lucida Console", "Courier New", monospace;
    font-size: ${m.fuente}px;
    line-height: 1.34;
  }
  .tk { width: 100%; }
  h1 {
    font-size: ${m.titulo}px;
    text-align: center;
    margin: 0 0 2px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  p { margin: 2px 0; }
  .tk-sub { text-align: center; font-size: ${m.pequena}px; margin: 0 0 6px; }
  .tk-sep { border-top: 1px dashed #000; margin: 5px 0; }
  .tk-row { display: flex; justify-content: space-between; gap: 6px; }
  .tk-row span:last-child { text-align: right; white-space: nowrap; }
  .tk-code {
    text-align: center;
    font-size: ${m.titulo}px;
    font-weight: 700;
    letter-spacing: 0.06em;
    margin: 4px 0;
  }
  table { width: 100%; border-collapse: collapse; font-size: ${m.pequena}px; }
  table td { padding: 1px 0; vertical-align: top; }
  table td:last-child { text-align: right; white-space: nowrap; padding-left: 6px; }
  .tk-total {
    font-size: ${m.total}px;
    font-weight: 700;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 2px 0;
    margin: 3px 0;
  }
  .tk-aviso { border: 1px solid #000; padding: 4px; margin-top: 5px; font-size: ${m.pequena}px; }
  .tk-foot { text-align: center; margin-top: 6px; font-size: ${m.pequena}px; }
  .tk-regla { white-space: nowrap; overflow: hidden; font-size: ${m.pequena}px; }
</style>
</head>
<body><div class="tk">${html}</div></body>
</html>`;
  }

  function limpiar(marco) {
    if (marco && marco.parentNode) marco.parentNode.removeChild(marco);
  }

  /** Manda el HTML al diálogo de impresión con el ancho elegido. */
  function imprimir(html) {
    const { ancho } = leerPreferencia();

    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.setAttribute('title', 'Ticket');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(marco);

    const doc = marco.contentDocument || (marco.contentWindow && marco.contentWindow.document);
    if (!doc) {
      limpiar(marco);
      return false;
    }

    doc.open();
    doc.write(documento(html, ancho));
    doc.close();

    let impreso = false;
    const lanzar = () => {
      if (impreso) return;
      impreso = true;
      try {
        marco.contentWindow.focus();
        marco.contentWindow.print();
      } catch (error) {
        /* el usuario verá el diálogo del navegador igual */
      }
      setTimeout(() => limpiar(marco), 2000);
    };

    setTimeout(lanzar, 350);
    return true;
  }

  /** Ticket de calibración: sirve para probar el ancho y el corte del papel. */
  function prueba() {
    const { ancho } = leerPreferencia();
    const ahora = new Date();
    const fecha = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()}`;
    const hora = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

    return imprimir(`
      <h1>${CONFIG.negocio.nombre}</h1>
      <p class="tk-sub">Prueba de impresión<br>Papel de ${ancho} mm</p>
      <div class="tk-sep"></div>
      <p class="tk-code">TICKET DE PRUEBA</p>
      <div class="tk-row"><span>Fecha</span><span>${fecha} ${hora}</span></div>
      <div class="tk-row"><span>Ancho</span><span>${ancho} mm</span></div>
      <div class="tk-sep"></div>
      <p class="tk-regla">1234567890123456789012345678901234567890</p>
      <p>ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>áéíóú ñ Ñ ¿? ¡! S/ 0.00</p>
      <div class="tk-sep"></div>
      <div class="tk-row"><span>Servicio por peso</span><span>S/ 17.15</span></div>
      <div class="tk-row"><span>Prenda por unidad</span><span>S/ 5.00</span></div>
      <div class="tk-total"><span>TOTAL</span><span>S/ 22.15</span></div>
      <div class="tk-aviso"><strong>RECOJO:</strong> miércoles, desde las 08:00 a. m.<br>Presenta tu código OT-0000-0000</p></div>
      <p class="tk-foot">Si el texto se corta o sale diminuto,<br>elige el otro ancho en Datos.<br>Gracias por su preferencia</p>
    `);
  }

  return { imprimir, prueba, leerPreferencia, guardar, documento };
})();
