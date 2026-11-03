/*
 * Comprobante en imagen (PNG) para enviar al cliente por WhatsApp.
 * Dibuja la ficha del servicio en un canvas: no depende de librerías de
 * maquetado y funciona sin conexión salvo el QR, que se carga aparte.
 */
window.Comprobante = (function () {
  'use strict';

  const W = 1080;
  const M = 72;

  const C = {
    dark: '#0b3b38',
    brand: '#0d9488',
    brandSoft: '#e7f5f2',
    fondo: '#eff7f5',
    tinta: '#0c2624',
    suave: '#5f7a77',
    linea: '#dfeae7',
    blanco: '#ffffff',
    ambar: '#b45309'
  };

  const FUENTE = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';

  const ESTADOS = {
    registro: { texto: 'SERVICIO REGISTRADO', color: C.brand },
    listo: { texto: 'LISTO PARA RECOGER', color: '#0f766e' },
    recordatorio: { texto: 'TE ESPERAMOS', color: C.ambar }
  };

  function money(valor) {
    return `S/ ${(Number(valor) || 0).toFixed(2)}`;
  }

  function dos(n) {
    return String(n).padStart(2, '0');
  }

  function soloDia(fecha) {
    const d = new Date(fecha);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** "Miércoles, 4 de noviembre de 2026" */
  function fechaLarga(valor) {
    const texto = new Date(valor).toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  /** "08:00 a. m." */
  function horaCorta(valor) {
    return new Date(valor).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function detalleItem(item) {
    if (item.tipo === 'peso') {
      return `${(Number(item.cantidad) || 0).toFixed(2)} kg × ${money(item.tarifa)}`;
    }
    return `${item.cantidad} ${item.unidad || 'und'} × ${money(item.tarifa)}`;
  }

  function entregaDe(orden) {
    const e = orden.entrega || {};
    return { domicilio: e.tipo === 'domicilio', direccion: e.direccion || '', costo: Number(e.costo) || 0 };
  }

  /** Lo que se puede escanear: página de seguimiento, chat del negocio o el pedido. */
  function contenidoQR(orden) {
    const cfg = CONFIG.comprobante || {};
    if (cfg.urlSeguimiento) {
      return String(cfg.urlSeguimiento).replace('{codigo}', encodeURIComponent(orden.codigo));
    }
    const wa = (CONFIG.soporte && CONFIG.soporte.whatsapp) || CONFIG.negocio.telefono || '';
    const digitos = String(wa).replace(/\D/g, '');
    if (digitos.length >= 10) {
      const saludo = `Hola, consulto por mi pedido ${orden.codigo}`;
      return `https://wa.me/${digitos}?text=${encodeURIComponent(saludo)}`;
    }
    return `${CONFIG.negocio.nombre} · Pedido ${orden.codigo} · ${money(orden.total)}`;
  }

  /* ------------------------------- QR ---------------------------------- */

  let cargandoQR = null;

  function cargarQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (cargandoQR) return cargandoQR;
    cargandoQR = new Promise((resolver, rechazar) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      script.async = true;
      const reloj = setTimeout(() => rechazar(new Error('sin QR')), 6000);
      script.onload = () => { clearTimeout(reloj); resolver(window.qrcode || null); };
      script.onerror = () => { clearTimeout(reloj); rechazar(new Error('sin QR')); };
      document.head.appendChild(script);
    });
    return cargandoQR;
  }

  function dibujarQR(ctx, texto, x, y, lado) {
    if (!window.qrcode || !texto) return false;
    const qr = window.qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const modulos = qr.getModuleCount();
    const quiet = 4;
    const ladoModulo = lado / (modulos + quiet * 2);
    ctx.fillStyle = C.blanco;
    ctx.fillRect(x, y, lado, lado);
    ctx.fillStyle = C.dark;
    for (let f = 0; f < modulos; f += 1) {
      for (let c = 0; c < modulos; c += 1) {
        if (qr.isDark(f, c)) {
          ctx.fillRect(
            x + (c + quiet) * ladoModulo,
            y + (f + quiet) * ladoModulo,
            Math.ceil(ladoModulo),
            Math.ceil(ladoModulo)
          );
        }
      }
    }
    return true;
  }

  /* ----------------------------- Dibujo -------------------------------- */

  function redondo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function recortar(ctx, texto, ancho) {
    let salida = String(texto);
    if (ctx.measureText(salida).width <= ancho) return salida;
    while (salida.length > 4 && ctx.measureText(`${salida}…`).width > ancho) {
      salida = salida.slice(0, -1);
    }
    return `${salida}…`;
  }

  function escribir(ctx, valor, x, y, fuente, color, alinear) {
    ctx.font = fuente;
    ctx.fillStyle = color;
    ctx.textAlign = alinear || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(valor, x, y);
  }

  function logotipo(ctx, x, y, lado) {
    ctx.save();
    ctx.strokeStyle = C.blanco;
    ctx.lineWidth = 4;
    redondo(ctx, x, y, lado, lado, lado * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + lado / 2, y + lado * 0.615, lado * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = C.blanco;
    ctx.beginPath();
    ctx.arc(x + lado * 0.32, y + lado * 0.3, 2.4, 0, Math.PI * 2);
    ctx.arc(x + lado * 0.46, y + lado * 0.3, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Alto de la tarjeta blanca según cuántos servicios lleve. */
  function altoTarjeta(orden) {
    const items = Math.max(1, (orden.items || []).length);
    return 56 * 2 + 158 + 132 + 58 + items * 96 + 178;
  }

  function altoDe(orden) {
    return 200 + altoTarjeta(orden) + 24 + 214 + 24 + 320 + 56;
  }

  function dibujar(orden, tipo) {
    const entrega = entregaDe(orden);
    const estado = ESTADOS[tipo] || ESTADOS.registro;
    const H = altoDe(orden);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Fondo
    ctx.fillStyle = C.fondo;
    ctx.fillRect(0, 0, W, H);

    // Cabecera
    ctx.fillStyle = C.dark;
    ctx.fillRect(0, 0, W, 236);
    logotipo(ctx, M, 62, 88);
    escribir(ctx, CONFIG.negocio.nombre, M + 112, 106, `700 42px ${FUENTE}`, C.blanco);
    escribir(ctx, CONFIG.negocio.rubro || 'Lavandería & tintorería', M + 112, 146, `400 22px ${FUENTE}`, '#9fd8cf');
    escribir(ctx, 'COMPROBANTE', W - M, 96, `700 22px ${FUENTE}`, '#9fd8cf', 'right');
    escribir(ctx, 'de recepción', W - M, 128, `400 22px ${FUENTE}`, C.blanco, 'right');
    escribir(ctx, fechaLarga(orden.ingreso), W - M, 172, `400 18px ${FUENTE}`, '#7fb9b1', 'right');

    // Tarjeta principal
    const cardY = 200;
    ctx.save();
    ctx.shadowColor = 'rgba(12, 38, 36, 0.10)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = C.blanco;
    redondo(ctx, M, cardY, W - M * 2, altoTarjeta(orden), 36);
    ctx.fill();
    ctx.restore();

    const x = M + 56;
    const derecha = W - M - 56;
    let y = cardY + 92;

    // Código y total
    escribir(ctx, 'CÓDIGO DE PEDIDO', x, y, `700 17px ${FUENTE}`, C.suave);
    escribir(ctx, 'TOTAL A PAGAR', derecha, y, `700 17px ${FUENTE}`, C.suave, 'right');
    y += 62;
    escribir(ctx, orden.codigo, x, y, `700 58px ${FUENTE}`, C.tinta);
    escribir(ctx, money(orden.total), derecha, y, `700 58px ${FUENTE}`, C.brand, 'right');
    y += 44;
    ctx.font = `700 15px ${FUENTE}`;
    const anchoEstado = ctx.measureText(estado.texto).width + 34;
    ctx.fillStyle = C.brandSoft;
    redondo(ctx, x, y - 18, anchoEstado, 30, 15);
    ctx.fill();
    escribir(ctx, estado.texto, x + 17, y + 3, `700 15px ${FUENTE}`, estado.color);
    escribir(ctx, orden.procesoNombre || '', derecha, y + 3, `400 19px ${FUENTE}`, C.suave, 'right');

    // Cliente
    y += 62;
    ctx.strokeStyle = C.linea;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(derecha, y);
    ctx.stroke();
    y += 42;
    escribir(ctx, 'CLIENTE', x, y, `700 16px ${FUENTE}`, C.suave);
    y += 34;
    escribir(ctx, recortar(ctx, orden.cliente.nombre, 620), x, y, `700 30px ${FUENTE}`, C.tinta);
    escribir(ctx, orden.cliente.telefono || '', derecha, y, `400 22px ${FUENTE}`, C.suave, 'right');
    y += 26;
    escribir(ctx, `Cliente ${orden.clienteCodigo}`, x, y, `400 18px ${FUENTE}`, C.suave);

    // Servicios
    y += 56;
    escribir(ctx, 'SERVICIOS', x, y, `700 16px ${FUENTE}`, C.suave);
    y += 14;

    (orden.items || []).forEach((item) => {
      y += 34;
      escribir(ctx, recortar(ctx, item.nombre, 600), x, y, `700 26px ${FUENTE}`, C.tinta);
      escribir(ctx, money(item.subtotal), derecha, y, `700 26px ${FUENTE}`, C.tinta, 'right');
      y += 30;
      escribir(ctx, detalleItem(item), x, y, `400 21px ${FUENTE}`, C.suave);
      ctx.strokeStyle = '#eef5f3';
      ctx.beginPath();
      ctx.moveTo(x, y + 18);
      ctx.lineTo(derecha, y + 18);
      ctx.stroke();
      y += 32;
    });

    // Totales
    y += 6;
    const filas = [];
    filas.push(['Subtotal', money(orden.subtotal)]);
    if (Number(orden.descuento) > 0) filas.push(['Descuento', `- ${money(orden.descuento)}`]);
    if (entrega.costo > 0) filas.push(['Envío', money(entrega.costo)]);
    if (Number(orden.pesoTotal) > 0) filas.push(['Peso registrado', `${Number(orden.pesoTotal).toFixed(2)} kg`]);
    if (Number(orden.prendas) > 0) filas.push(['Prendas', `${orden.prendas} und`]);

    filas.forEach(([etiqueta, valor]) => {
      escribir(ctx, etiqueta, x, y, `400 21px ${FUENTE}`, C.suave);
      escribir(ctx, valor, derecha, y, `700 21px ${FUENTE}`, C.tinta, 'right');
      y += 34;
    });

    // Recojo
    const recojoY = cardY + altoTarjeta(orden) + 24;
    ctx.save();
    ctx.fillStyle = C.brandSoft;
    redondo(ctx, M, recojoY, W - M * 2, 214, 32);
    ctx.fill();
    ctx.restore();
    let ry = recojoY + 56;
    escribir(ctx, entrega.domicilio ? 'ENTREGA A DOMICILIO' : 'LISTO PARA RECOGER', M + 48, ry, `700 16px ${FUENTE}`, '#0f766e');
    ry += 46;
    escribir(ctx, fechaLarga(orden.recojoEn), M + 48, ry, `700 34px ${FUENTE}`, C.dark);
    ry += 40;
    escribir(ctx, `Desde las ${horaCorta(orden.recojoEn)}`, M + 48, ry, `400 23px ${FUENTE}`, '#24413e');
    ry += 34;
    const lugar = entrega.domicilio
      ? `Envío a: ${entrega.direccion || 'dirección por confirmar'}`
      : CONFIG.negocio.direccion;
    escribir(ctx, recortar(ctx, lugar, 800), M + 48, ry, `400 20px ${FUENTE}`, C.suave);

    // Pie con QR
    const pieY = recojoY + 214 + 24;
    const qrLado = 224;
    const qrX = M;
    const qrY = pieY + 24;
    let hayQR = false;
    try {
      hayQR = dibujarQR(ctx, contenidoQR(orden), qrX, qrY, qrLado);
    } catch (error) {
      hayQR = false;
    }
    if (hayQR) {
      ctx.strokeStyle = C.linea;
      ctx.lineWidth = 1;
      ctx.strokeRect(qrX + 0.5, qrY + 0.5, qrLado, qrLado);
      const tx = qrX + qrLado + 40;
      escribir(ctx, 'Escanea para consultar', tx, qrY + 92, `700 24px ${FUENTE}`, C.tinta);
      escribir(ctx, 'tu pedido', tx, qrY + 124, `700 24px ${FUENTE}`, C.tinta);
      escribir(ctx, orden.codigo, tx, qrY + 162, `400 24px ${FUENTE}`, C.suave);
      escribir(ctx, 'Conserva este código', tx, qrY + 196, `400 18px ${FUENTE}`, C.suave);
    } else {
      escribir(ctx, 'Conserva este código para recoger tus prendas', M, qrY + 80, `700 26px ${FUENTE}`, C.tinta);
      escribir(ctx, orden.codigo, M, qrY + 124, `400 24px ${FUENTE}`, C.suave);
    }

    const pieTexto = pieY + 292;
    ctx.strokeStyle = C.linea;
    ctx.beginPath();
    ctx.moveTo(M, pieTexto);
    ctx.lineTo(W - M, pieTexto);
    ctx.stroke();
    escribir(ctx, CONFIG.negocio.nombre, M, pieTexto + 42, `700 21px ${FUENTE}`, C.tinta);
    escribir(ctx, CONFIG.negocio.direccion, M, pieTexto + 74, `400 19px ${FUENTE}`, C.suave);
    escribir(ctx, `${CONFIG.negocio.telefono}`, W - M, pieTexto + 42, `400 19px ${FUENTE}`, C.suave, 'right');
    escribir(ctx, CONFIG.negocio.notaHorario || '', W - M, pieTexto + 74, `400 19px ${FUENTE}`, C.suave, 'right');

    return canvas;
  }

  /* ------------------------------ API ---------------------------------- */

  /** Mensaje corto que acompaña la imagen en el chat. */
  function texto(orden, tipo) {
    const entrega = entregaDe(orden);
    const cuando = fechaLarga(orden.recojoEn);
    const cabecera = tipo === 'listo'
      ? `¡Tus prendas están listas! Te esperamos el ${cuando.toLowerCase()}, desde las ${horaCorta(orden.recojoEn)}.`
      : tipo === 'recordatorio'
        ? `Te recordamos que tus prendas te esperan: ${cuando.toLowerCase()}, desde las ${horaCorta(orden.recojoEn)}.`
        : entrega.domicilio
          ? `Registramos tu servicio. Entrega a domicilio el ${cuando.toLowerCase()}, desde las ${horaCorta(orden.recojoEn)}.`
          : `Registramos tu servicio. Listo el ${cuando.toLowerCase()}, desde las ${horaCorta(orden.recojoEn)}.`;
    return `${CONFIG.negocio.nombre} · Pedido ${orden.codigo} · Total ${money(orden.total)}. ${cabecera}`;
  }

  /** Devuelve { canvas, blob, url, archivo }. */
  async function generar(orden, tipo) {
    await cargarQR().catch(() => null);
    const canvas = dibujar(orden, tipo || 'registro');
    const blob = await new Promise((resolver, rechazar) => {
      canvas.toBlob((valor) => (valor ? resolver(valor) : rechazar(new Error('PNG'))), 'image/png');
    });
    return {
      canvas,
      blob,
      url: URL.createObjectURL(blob),
      archivo: `comprobante-${orden.codigo}.png`
    };
  }

  return { generar, texto, money, contenidoQR, fechaLarga, horaCorta, dos };
})();
