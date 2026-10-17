/* ==========================================================================
   LavaMili · Lógica de la aplicación
   ========================================================================== */

(function () {
  'use strict';

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
  const SESION_KEY = 'lavamili.v1.sesion';

  const dinero = new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2
  });
  const fmtFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtHora = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
  const fmtHora24 = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDiaLargo = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtFechaLarga = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const estado = {
    vista: 'nuevo',
    operador: null,
    items: [],
    categoria: 'todos',
    clienteCodigo: '',
    clienteExistente: null,
    ordenActual: null,
    recojoManual: false,
    temporizador: null
  };

  /* ----------------------------- Utilidades ----------------------------- */

  const esc = (texto) =>
    String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const uid = (prefijo = 'id') => `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const money = (n) => dinero.format(Number(n) || 0);
  const parseNum = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const aInputLocal = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  function toast(mensaje) {
    const el = $('#toast');
    el.textContent = mensaje;
    el.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('visible'), 2600);
  }

  function fechaAviso(fecha) {
    return {
      dia: fmtDiaLargo.format(fecha),
      hora: fmtHora.format(fecha),
      corta: `${fmtFecha.format(fecha)} · ${fmtHora.format(fecha)}`
    };
  }

  /* ------------------------- Horario y recojos -------------------------- */

  function esDiaAtencion(fecha) {
    return CONFIG.negocio.horario.dias.includes(fecha.getDay());
  }

  function horaDelDia(fecha, texto) {
    const [h, m] = texto.split(':').map(Number);
    const d = new Date(fecha);
    d.setHours(h, m, 0, 0);
    return d;
  }

  function siguienteApertura(fecha) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 21; i++) {
      d.setDate(d.getDate() + 1);
      if (esDiaAtencion(d)) return horaDelDia(d, CONFIG.negocio.horario.apertura);
    }
    return d;
  }

  function redondearMediaHora(fecha) {
    const d = new Date(fecha);
    d.setSeconds(0, 0);
    const minutos = d.getMinutes();
    if (minutos === 0 || minutos === 30) return d;
    d.setMinutes(minutos < 30 ? 30 : 60);
    return d;
  }

  /** Calcula la fecha/hora de recojo respetando el horario de atención. */
  function calcularListo(base, horas) {
    let d = redondearMediaHora(new Date(base.getTime() + horas * 3600 * 1000));
    const { apertura, cierre } = CONFIG.negocio.horario;

    for (let i = 0; i < 30; i++) {
      if (!esDiaAtencion(d)) {
        d = siguienteApertura(d);
        continue;
      }
      const abre = horaDelDia(d, apertura);
      const cierra = horaDelDia(d, cierre);
      if (d < abre) return redondearMediaHora(abre);
      if (d > cierra) {
        d = siguienteApertura(d);
        continue;
      }
      return d;
    }
    return d;
  }

  /* ------------------------------ Sesión -------------------------------- */

  function iniciarSesion(evento) {
    evento.preventDefault();
    const usuario = $('#usuario').value.trim().toLowerCase();
    const pin = $('#pin').value.trim();
    const encontrado = CONFIG.operadores.find((o) => o.usuario === usuario && o.pin === pin);

    if (!encontrado) {
      $('#loginError').textContent = 'Usuario o PIN incorrecto. Verifica tus datos.';
      $('#pin').value = '';
      $('#pin').focus();
      return;
    }

    estado.operador = { usuario: encontrado.usuario, nombre: encontrado.nombre, rol: encontrado.rol };
    try {
      sessionStorage.setItem(SESION_KEY, JSON.stringify(estado.operador));
    } catch (error) {
      /* modo privado: la sesión vive solo en memoria */
    }
    $('#loginError').textContent = '';
    $('#formLogin').reset();
    entrarAlSistema();
  }

  function entrarAlSistema() {
    $('#pantallaLogin').classList.add('oculto');
    $('#app').classList.remove('oculto');
    $('#usuarioChip').textContent = `${estado.operador.nombre} · ${estado.operador.rol}`;
    actualizarFechas();
    renderCatalogo();
    renderItems();
    refrescarResumen();
    renderOrdenes();
    renderClientes();
    renderResumen();
    renderBanner();
    sugerirRecojo();

    if (!estado.temporizador) {
      estado.temporizador = setInterval(renderBanner, 60000);
    }
  }

  function cerrarSesion() {
    try {
      sessionStorage.removeItem(SESION_KEY);
    } catch (error) { /* nada */ }
    estado.operador = null;
    estado.items = [];
    if (estado.temporizador) {
      clearInterval(estado.temporizador);
      estado.temporizador = null;
    }
    $('#app').classList.add('oculto');
    $('#pantallaLogin').classList.remove('oculto');
    $('#usuario').focus();
  }

  function restaurarSesion() {
    try {
      const crudo = sessionStorage.getItem(SESION_KEY);
      if (!crudo) return;
      const datos = JSON.parse(crudo);
      if (datos && datos.nombre) {
        estado.operador = datos;
        entrarAlSistema();
      }
    } catch (error) { /* sin sesión */ }
  }

  /* ------------------------------ Navegación ---------------------------- */

  function cambiarVista(nombre) {
    estado.vista = nombre;
    $$('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.vista === nombre));
    $$('.vista').forEach((vista) => vista.classList.toggle('is-active', vista.id === `vista-${nombre}`));
    if (nombre === 'ordenes') renderOrdenes();
    if (nombre === 'clientes') renderClientes();
    if (nombre === 'resumen') renderResumen();
    if (nombre === 'tablero') renderTablero();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------- Fechas ------------------------------- */

  function actualizarFechas() {
    const hoy = new Date();
    const texto = capitalizar(fmtFechaLarga.format(hoy));
    $('#fechaHoy').innerHTML = `<strong>Hoy</strong> · ${esc(texto)}`;
    $('#fechaHoyResumen').innerHTML = `<strong>Hoy</strong> · ${esc(texto)}`;
    $('#fechaHoyTablero').innerHTML = `<strong>Hoy</strong> · ${esc(texto)}`;
  }

  /* ------------------------------ Catálogo ------------------------------ */

  function renderCategorias() {
    $('#categorias').innerHTML = CONFIG.categorias
      .map(
        (cat) =>
          `<button type="button" class="cat-chip${cat.id === estado.categoria ? ' is-active' : ''}" data-categoria="${cat.id}" role="tab" aria-selected="${cat.id === estado.categoria}">${esc(cat.nombre)}</button>`
      )
      .join('');
  }

  function renderCatalogo() {
    renderCategorias();
    const overrides = Store.getPrecios();
    const lista = CONFIG.servicios.filter((s) => estado.categoria === 'todos' || s.cat === estado.categoria);
    $('#catalogo').innerHTML = lista
      .map((servicio) => {
        const tarifa = tarifaDe(servicio, overrides);
        const precio =
          servicio.tipo === 'peso'
            ? `${money(tarifa)} / kg`
            : `${money(tarifa)} / ${servicio.unidad}`;
        return `<button type="button" class="svc" data-servicio="${servicio.id}" title="${esc(servicio.detalle || '')}">
          <span class="svc-name">${esc(servicio.nombre)}</span>
          <span class="svc-price">${precio}</span>
          <span class="svc-detail">${esc(servicio.detalle || '')}</span>
        </button>`;
      })
      .join('');
  }

  /* --------------------------- Panel de precios -------------------------- */

  let borradorPrecios = null;

  /** Tarifa vigente de un servicio (personalizada o de fábrica). */
  function tarifaDe(servicio, overrides) {
    const mapa = overrides || Store.getPrecios();
    const tiene = Object.prototype.hasOwnProperty.call(mapa, servicio.id);
    const valor = Number(mapa[servicio.id]);
    return tiene && Number.isFinite(valor) && valor >= 0 ? valor : servicio.tarifa;
  }

  function abrirPrecios() {
    const overrides = Store.getPrecios();
    borradorPrecios = {};
    CONFIG.servicios.forEach((servicio) => {
      borradorPrecios[servicio.id] = tarifaDe(servicio, overrides);
    });
    $('#buscarPrecio').value = '';
    renderPrecios();
    $('#panelPrecios').classList.add('is-open');
    $('#panelPrecios').setAttribute('aria-hidden', 'false');
    $('#btnPrecios').setAttribute('aria-expanded', 'true');
    document.body.classList.add('panel-abierto');
    setTimeout(() => $('#buscarPrecio').focus(), 150);
  }

  function cerrarPrecios() {
    $('#panelPrecios').classList.remove('is-open');
    $('#panelPrecios').setAttribute('aria-hidden', 'true');
    $('#btnPrecios').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('panel-abierto');
  }

  function renderPrecios() {
    const filtro = $('#buscarPrecio').value.trim().toLowerCase();
    const bloques = [];

    CONFIG.categorias
      .filter((cat) => cat.id !== 'todos')
      .forEach((cat) => {
        const servicios = CONFIG.servicios.filter(
          (s) => s.cat === cat.id && (!filtro || `${s.nombre} ${s.detalle || ''}`.toLowerCase().includes(filtro))
        );
        if (!servicios.length) return;

        bloques.push(
          `<h3 class="precio-grupo">${esc(cat.nombre)}</h3>` +
            servicios
              .map((s) => {
                const bruto = borradorPrecios ? borradorPrecios[s.id] : undefined;
                const valor = bruto === '' || bruto === undefined || bruto === null ? tarifaDe(s) : parseNum(bruto);
                return `<div class="precio-row">
                  <div class="precio-info">
                    <strong>${esc(s.nombre)}</strong>
                    <span>${esc(s.detalle || '')}</span>
                  </div>
                  <label class="precio-input">
                    <span>S/</span>
                    <input type="number" min="0" step="0.10" inputmode="decimal" data-precio="${s.id}" value="${Number(valor).toFixed(2)}" aria-label="Precio de ${esc(s.nombre)}" />
                    <small>${esc(s.unidad)}</small>
                  </label>
                </div>`;
              })
              .join('')
        );
      });

    $('#listaPrecios').innerHTML = bloques.join('') || '<p class="sin-datos">No hay servicios que coincidan.</p>';
  }

  function guardarPrecios() {
    const previos = Store.getPrecios();
    const mapa = {};

    CONFIG.servicios.forEach((servicio) => {
      const bruto = borradorPrecios ? borradorPrecios[servicio.id] : undefined;
      const vacio = bruto === '' || bruto === undefined || bruto === null;
      const valor = vacio ? tarifaDe(servicio, previos) : parseNum(bruto);
      mapa[servicio.id] = valor >= 0 ? redondear(valor) : tarifaDe(servicio, previos);
    });

    Store.setPrecios(mapa);

    // Si el operador ya tenía prendas en el carrito, se actualizan solo
    // aquellas cuyo precio no había sido editado a mano.
    estado.items.forEach((item) => {
      const servicio = CONFIG.servicios.find((s) => s.id === item.servicioId);
      if (!servicio) return;
      const anterior = tarifaDe(servicio, previos);
      if (Number(item.tarifa) === Number(anterior)) item.tarifa = mapa[servicio.id];
    });

    renderCatalogo();
    renderItems();
    refrescarResumen();
    cerrarPrecios();
    toast('Precios actualizados');
  }

  function restablecerPrecios() {
    CONFIG.servicios.forEach((servicio) => {
      borradorPrecios[servicio.id] = servicio.tarifa;
    });
    renderPrecios();
    toast('Precios de fábrica cargados. Pulsa «Guardar cambios».');
  }

  /* --------------------------- Carrito / ítems -------------------------- */

  function agregarServicio(idServicio) {
    const servicio = CONFIG.servicios.find((s) => s.id === idServicio);
    if (!servicio) return;

    const existente = estado.items.find((i) => i.servicioId === idServicio);

    if (existente && servicio.tipo === 'unidad') {
      existente.cantidad = Number(existente.cantidad) + 1;
      renderItems();
      refrescarResumen();
      return;
    }

    if (existente && servicio.tipo === 'peso') {
      const input = $(`.item[data-key="${existente.key}"] input[data-campo="cantidad"]`);
      if (input) {
        input.focus();
        input.select();
      }
      toast('Escribe el peso en kilos para este servicio');
      return;
    }

    estado.items.push({
      key: uid('it'),
      servicioId: servicio.id,
      nombre: servicio.nombre,
      tipo: servicio.tipo,
      unidad: servicio.unidad,
      cantidad: servicio.tipo === 'peso' ? servicio.minPeso || 0 : 1,
      tarifa: tarifaDe(servicio),
      minPeso: servicio.minPeso || 0
    });

    renderItems();
    refrescarResumen();
    toast(`${servicio.nombre} agregado`);
  }

  function calcularItem(item) {
    const cantidad = Math.max(0, parseNum(item.cantidad));
    const tarifa = Math.max(0, parseNum(item.tarifa));
    const base = item.tipo === 'peso' && item.minPeso && cantidad > 0 ? Math.max(cantidad, item.minPeso) : cantidad;
    return { base, subtotal: redondear(base * tarifa) };
  }

  function renderItems() {
    const contenedor = $('#items');
    if (!estado.items.length) {
      contenedor.innerHTML = '';
      $('#itemsVacio').classList.remove('oculto');
      return;
    }
    $('#itemsVacio').classList.add('oculto');

    contenedor.innerHTML = estado.items
      .map((item) => {
        const esPeso = item.tipo === 'peso';
        const cantidad = parseNum(item.cantidad);
        const nota =
          esPeso && item.minPeso && cantidad > 0 && cantidad < item.minPeso
            ? `<p class="item-note">Se aplica el mínimo de ${item.minPeso} kg para este servicio.</p>`
            : '';
        return `<div class="item" data-key="${item.key}">
          <div class="item-info">
            <span class="item-name">${esc(item.nombre)}</span>
            <span class="tag ${esPeso ? 'peso' : ''}">${esPeso ? 'Por peso' : 'Por unidad'}</span>
          </div>
          <div class="item-cant">
            <label for="cant-${item.key}">${esPeso ? 'Peso (kg)' : `Cantidad (${esc(item.unidad)})`}</label>
            <input id="cant-${item.key}" type="number" data-campo="cantidad" value="${item.cantidad}" min="0" step="${esPeso ? '0.01' : '1'}" inputmode="decimal" />
          </div>
          <div class="item-tarifa">
            <label for="tar-${item.key}">${esPeso ? 'S/ por kg' : 'Precio'}</label>
            <input id="tar-${item.key}" type="number" data-campo="tarifa" value="${item.tarifa}" min="0" step="0.10" inputmode="decimal" />
          </div>
          <div class="item-sub"><span>Subtotal</span><strong data-subtotal>${money(calcularItem(item).subtotal)}</strong></div>
          <button class="icon-btn" type="button" data-accion="quitar" aria-label="Quitar ${esc(item.nombre)}">&times;</button>
          ${nota}
        </div>`;
      })
      .join('');
  }

  function refrescarSubtotales() {
    $$('#items .item').forEach((fila) => {
      const item = estado.items.find((i) => i.key === fila.dataset.key);
      if (!item) return;
      const celda = $('[data-subtotal]', fila);
      if (celda) celda.textContent = money(calcularItem(item).subtotal);
    });
  }

  function calcularTotales() {
    let subtotal = 0;
    let peso = 0;
    let prendas = 0;

    estado.items.forEach((item) => {
      subtotal += calcularItem(item).subtotal;
      if (item.tipo === 'peso') peso += Math.max(0, parseNum(item.cantidad));
      else prendas += Math.max(0, parseNum(item.cantidad));
    });

    subtotal = redondear(subtotal);
    const descuento = Math.min(Math.max(parseNum($('#descuento').value), 0), subtotal);
    const envio = $('#tipoEntrega').value === 'domicilio' ? Math.max(0, parseNum($('#costoEnvio').value)) : 0;

    return {
      subtotal,
      descuento: redondear(descuento),
      envio: redondear(envio),
      total: redondear(subtotal - descuento + envio),
      peso: redondear(peso),
      prendas
    };
  }

  function refrescarResumen() {
    const totales = calcularTotales();
    $('#sumPrendas').textContent = String(totales.prendas);
    $('#sumPeso').textContent = `${totales.peso.toFixed(2)} kg`;
    $('#sumSubtotal').textContent = money(totales.subtotal);
    $('#sumDescuento').textContent = money(totales.descuento);
    $('#sumEnvio').textContent = money(totales.envio);
    $('#filaEnvio').classList.toggle('oculto', totales.envio <= 0);
    $('#sumTotal').textContent = money(totales.total);
    $('#resumenCodigo').textContent = Store.nextOrderCode();
    actualizarAviso();
  }

  /* ------------------------------- Recojo ------------------------------- */

  function fechaRecojo() {
    const valor = $('#recojo').value;
    if (!valor) return null;
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  function sugerirRecojo() {
    const proceso = CONFIG.tiempos.find((t) => t.id === $('#proceso').value) || CONFIG.tiempos[1];
    const sugerida = calcularListo(new Date(), proceso.horas);
    $('#recojo').value = aInputLocal(sugerida);
    estado.recojoManual = false;
    $('#recojoHint').textContent = `Sugerido: ${fechaAviso(sugerida).corta}`;
    actualizarAviso();
  }

  function esDomicilio() {
    return $('#tipoEntrega').value === 'domicilio';
  }

  function actualizarEntrega() {
    const domicilio = esDomicilio();
    $('#campoDireccion').classList.toggle('oculto', !domicilio);
    $('#campoCostoEnvio').classList.toggle('oculto', !domicilio);
    refrescarResumen();
  }

  function actualizarAviso() {
    const fecha = fechaRecojo();
    const caja = $('#recojoBox');
    const aviso = $('#avisoPreview');
    const nombre = $('#cliNombre').value.trim() || 'cliente';
    const domicilio = esDomicilio();
    const direccion = $('#direccionEntrega').value.trim();
    const lugar = domicilio ? direccion || 'la dirección indicada' : CONFIG.negocio.direccion;

    if (!fecha) {
      caja.innerHTML = '<div><strong>Sin fecha de recojo</strong><p>Elige el día y la hora de entrega.</p></div>';
      aviso.className = 'aviso-preview pendiente';
      aviso.innerHTML = '<p class="eyebrow">Aviso al cliente</p><p>Selecciona la fecha y hora de recojo para generar el aviso.</p>';
      return;
    }

    const { dia, hora, corta } = fechaAviso(fecha);
    caja.innerHTML = domicilio
      ? `<div><strong>Envío el ${esc(dia)}</strong><p>Desde las ${esc(hora)} · ${esc(lugar)}</p></div>`
      : `<div><strong>Listo el ${esc(dia)}</strong><p>Desde las ${esc(hora)} · ${esc(lugar)}</p></div>`;

    const frase = domicilio
      ? `entregaremos tus prendas en ${esc(lugar)}`
      : `tus prendas estarán listas`;

    aviso.className = 'aviso-preview';
    aviso.innerHTML = `<p class="eyebrow">Aviso al cliente</p>
      <p>Hola ${esc(nombre)}, ${frase} el <strong>${esc(dia)}</strong> desde las <strong>${esc(hora)}</strong>.</p>
      <p class="hint" style="margin-top:6px">Programado: ${esc(corta)}</p>`;
  }

  /* ------------------------------- Cliente ------------------------------ */

  function actualizarCodigoCliente() {
    const existente = estado.clienteExistente;
    const codigo = existente ? existente.codigo : Store.nextClienteCode();
    estado.clienteCodigo = codigo;
    $('#cliCodigo').value = codigo;
    $('#cliCodigoChip').textContent = codigo;
  }

  function buscarCliente() {
    const telefono = $('#cliTelefono').value.trim();
    const encontrado = Store.buscarPorTelefono(telefono);
    const banner = $('#clienteEncontrado');

    if (encontrado) {
      estado.clienteExistente = encontrado;
      $('#cliNombre').value = encontrado.nombre || $('#cliNombre').value;
      $('#cliEmail').value = encontrado.email || $('#cliEmail').value;
      const stats = Store.statsCliente(encontrado);
      banner.classList.remove('oculto');
      banner.innerHTML = `<span class="badge">Cliente registrado</span>
        <strong>${esc(encontrado.nombre)}</strong>
        <span class="muted">${esc(encontrado.codigo)} · ${stats.ordenes} servicio(s) · ${money(stats.total)} acumulado</span>`;
      $('#cliHint').textContent = 'Datos cargados desde la base de clientes.';
      $('#cliHint').classList.add('ok');
    } else {
      estado.clienteExistente = null;
      banner.classList.add('oculto');
      banner.innerHTML = '';
      $('#cliHint').textContent = 'Cliente nuevo: se registrará con el código generado.';
      $('#cliHint').classList.remove('ok');
    }
    actualizarCodigoCliente();
  }

  /* ------------------------------ Validación ---------------------------- */

  function marcarInvalido(selector) {
    const campo = $(selector);
    campo.classList.add('invalid');
    campo.addEventListener('input', () => campo.classList.remove('invalid'), { once: true });
    campo.focus();
  }

  function validar() {
    const nombre = $('#cliNombre').value.trim();
    const telefono = $('#cliTelefono').value.trim();
    const digitos = telefono.replace(/\D/g, '');
    const email = $('#cliEmail').value.trim();

    if (digitos.length < 6) {
      marcarInvalido('#cliTelefono');
      toast('Ingresa un teléfono válido del cliente');
      return false;
    }
    if (nombre.length < 3) {
      marcarInvalido('#cliNombre');
      toast('Ingresa el nombre del cliente');
      return false;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      marcarInvalido('#cliEmail');
      toast('El correo no tiene un formato válido');
      return false;
    }
    if (!estado.items.length) {
      toast('Agrega al menos un servicio del catálogo');
      return false;
    }
    const pesoSinDato = estado.items.find((i) => i.tipo === 'peso' && parseNum(i.cantidad) <= 0);
    if (pesoSinDato) {
      toast(`Ingresa el peso de «${pesoSinDato.nombre}»`);
      return false;
    }
    const fecha = fechaRecojo();
    if (!fecha) {
      marcarInvalido('#recojo');
      toast('Define la fecha y hora de recojo');
      return false;
    }
    if (fecha.getTime() < Date.now() - 5 * 60 * 1000) {
      marcarInvalido('#recojo');
      toast('La fecha de recojo ya pasó, elige otra');
      return false;
    }
    if (esDomicilio() && $('#direccionEntrega').value.trim().length < 5) {
      marcarInvalido('#direccionEntrega');
      toast('Escribe la dirección del envío a domicilio');
      return false;
    }
    return true;
  }

  /* ---------------------------- Registrar orden ------------------------- */

  function registrar(enviarAviso) {
    if (!validar()) return;

    const totales = calcularTotales();
    const proceso = CONFIG.tiempos.find((t) => t.id === $('#proceso').value) || CONFIG.tiempos[1];
    const recojo = fechaRecojo();
    const nombre = $('#cliNombre').value.trim();
    const telefono = $('#cliTelefono').value.trim();
    const email = $('#cliEmail').value.trim();

    const cliente = Store.upsertCliente({ telefono, nombre, email });
    const numeroServicio = Store.siguienteServicio(cliente.id, cliente.codigo);

    const orden = Store.addOrden({
      id: uid('ord'),
      clienteId: cliente.id,
      clienteCodigo: cliente.codigo,
      servicioN: numeroServicio,
      codigoServicio: `${cliente.codigo}-S${String(numeroServicio).padStart(2, '0')}`,
      cliente: { nombre, telefono, email },
      items: estado.items.map((item) => ({
        servicioId: item.servicioId,
        nombre: item.nombre,
        tipo: item.tipo,
        unidad: item.unidad,
        cantidad: redondear(parseNum(item.cantidad)),
        tarifa: redondear(parseNum(item.tarifa)),
        subtotal: calcularItem(item).subtotal
      })),
      pesoTotal: totales.peso,
      prendas: totales.prendas,
      subtotal: totales.subtotal,
      descuento: totales.descuento,
      total: totales.total,
      ingreso: new Date().toISOString(),
      proceso: proceso.id,
      procesoNombre: proceso.nombre,
      recojoEn: recojo.toISOString(),
      formaPago: $('#formaPago').value,
      notas: $('#notas').value.trim(),
      entrega: {
        tipo: esDomicilio() ? 'domicilio' : 'tienda',
        direccion: esDomicilio() ? $('#direccionEntrega').value.trim() : '',
        costo: totales.envio
      },
      listoEn: null,
      entregadoEn: null,
      recordatorioEn: null,
      ultimoAvisoEn: null,
      almacen: null,
      estado: 'recibido',
      operador: estado.operador ? estado.operador.nombre : 'Operador'
    });

    estado.ordenActual = orden;
    limpiarFormulario();
    renderOrdenes();
    renderClientes();
    renderResumen();
    renderBanner();
    abrirModalExito(orden);

    if (enviarAviso) abrirWhatsApp(orden);
  }

  function limpiarFormulario() {
    estado.items = [];
    estado.clienteExistente = null;
    ['#cliTelefono', '#cliNombre', '#cliEmail', '#notas', '#direccionEntrega'].forEach((sel) => {
      $(sel).value = '';
      $(sel).classList.remove('invalid');
    });
    $('#descuento').value = '0';
    $('#tipoEntrega').value = 'tienda';
    $('#costoEnvio').value = '0';
    $('#campoDireccion').classList.add('oculto');
    $('#campoCostoEnvio').classList.add('oculto');
    $('#clienteEncontrado').classList.add('oculto');
    $('#cliHint').textContent = 'Si el número ya está registrado, cargamos sus datos.';
    $('#cliHint').classList.remove('ok');
    renderItems();
    actualizarCodigoCliente();
    sugerirRecojo();
    refrescarResumen();
  }

  /* ------------------------- Mensajes y WhatsApp ------------------------ */

  function normalizarTelefono(telefono) {
    let digitos = String(telefono || '').replace(/\D/g, '');
    if (digitos.startsWith('00')) digitos = digitos.slice(2);
    if (digitos.length === 9) digitos = CONFIG.negocio.codigoPais + digitos;
    if (digitos.startsWith('0') && digitos.length > 9) digitos = CONFIG.negocio.codigoPais + digitos.slice(1);
    return digitos;
  }

  function urlWhatsApp(orden, tipo = 'registro') {
    return `https://wa.me/${normalizarTelefono(orden.cliente.telefono)}?text=${encodeURIComponent(construirMensaje(orden, tipo))}`;
  }

  function detalleItem(item) {
    if (item.tipo === 'peso') {
      return `${item.nombre} — ${Number(item.cantidad).toFixed(2)} kg x ${money(item.tarifa)}`;
    }
    return `${item.nombre} — ${item.cantidad} ${item.unidad} x ${money(item.tarifa)}`;
  }

  function datosEntrega(orden) {
    const entrega = orden.entrega || {};
    return {
      domicilio: entrega.tipo === 'domicilio',
      direccion: entrega.direccion || '',
      costo: Number(entrega.costo) || 0
    };
  }

  /**
   * tipo: 'registro' (al ingresar) · 'listo' (prendas listas) · 'recordatorio' (día siguiente)
   */
  function construirMensaje(orden, tipo = 'registro') {
    const { dia, hora } = fechaAviso(new Date(orden.recojoEn));
    const { domicilio, direccion, costo } = datosEntrega(orden);
    const lineas = [];

    lineas.push(`${CONFIG.negocio.nombre.toUpperCase()} · ${CONFIG.negocio.rubro}`);

    if (tipo === 'listo') lineas.push(`Hola ${orden.cliente.nombre}, tus prendas ya están listas.`);
    else if (tipo === 'recordatorio') lineas.push(`Hola ${orden.cliente.nombre}, te recordamos que tus prendas te esperan.`);
    else lineas.push(`Hola ${orden.cliente.nombre}, registramos tu servicio.`);

    lineas.push('');
    lineas.push(`Código de servicio: ${orden.codigo}`);
    lineas.push(`Código de cliente: ${orden.clienteCodigo}`);

    if (tipo === 'registro') {
      lineas.push('');
      lineas.push('DETALLE');
      orden.items.forEach((item) => lineas.push(`• ${detalleItem(item)} — ${money(item.subtotal)}`));
      lineas.push('');
      if (orden.pesoTotal > 0) lineas.push(`Peso registrado: ${Number(orden.pesoTotal).toFixed(2)} kg`);
      if (orden.descuento > 0) lineas.push(`Descuento: -${money(orden.descuento)}`);
      if (costo > 0) lineas.push(`Envío a domicilio: ${money(costo)}`);
    }

    lineas.push(`TOTAL A PAGAR: ${money(orden.total)}`);
    lineas.push('');

    if (domicilio) {
      lineas.push('ENTREGA A DOMICILIO');
      lineas.push(direccion || 'Dirección por confirmar');
      if (tipo === 'registro') lineas.push(`${capitalizar(dia)}, desde las ${hora}`);
      else lineas.push('Coordinamos la entrega contigo.');
    } else {
      if (tipo === 'registro') {
        lineas.push('LISTO PARA RECOGER');
        lineas.push(`${capitalizar(dia)}, desde las ${hora}`);
      } else {
        lineas.push('YA PUEDES RECOGER');
        if (orden.listoEn) lineas.push(`Listo desde el ${fechaAviso(new Date(orden.listoEn)).corta}`);
      }
      lineas.push(CONFIG.negocio.direccion);
      lineas.push(`Horario: ${CONFIG.negocio.notaHorario}`);
    }

    lineas.push('');
    if (tipo === 'recordatorio') {
      lineas.push(`Seguimos guardando tus prendas con el código ${orden.codigo}.`);
    } else {
      lineas.push(`Conserva tu código ${orden.codigo} para recoger tus prendas.`);
    }
    lineas.push('¡Gracias por tu preferencia!');

    return lineas.join('\n');
  }

  function tipoAvisoSugerido(orden) {
    return orden.estado === 'listo' || orden.estado === 'almacen' ? 'listo' : 'registro';
  }

  function abrirWhatsApp(orden, tipo = 'registro') {
    if (!orden) return;
    const telefono = normalizarTelefono(orden.cliente.telefono);
    if (telefono.length < 10) {
      toast('El teléfono del cliente no es válido para WhatsApp');
      return;
    }
    const ventana = window.open(urlWhatsApp(orden, tipo), '_blank', 'noopener');
    if (!ventana) toast('Habilita las ventanas emergentes para abrir WhatsApp');
  }

  async function copiarMensaje(orden) {
    const texto = construirMensaje(orden);
    try {
      await navigator.clipboard.writeText(texto);
      toast('Cuadro del mensaje copiado');
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = texto;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        toast('Cuadro del mensaje copiado');
      } catch (err) {
        toast('No se pudo copiar automáticamente; selecciona el texto del mensaje');
      }
      document.body.removeChild(area);
    }
  }

  /* ------------------------------- Ticket ------------------------------- */

  function ticketHTML(orden) {
    const { dia, hora } = fechaAviso(new Date(orden.recojoEn));
    const { domicilio, direccion, costo } = datosEntrega(orden);
    const filas = orden.items
      .map((item) => `<tr><td>${esc(detalleItem(item))}</td><td>${money(item.subtotal)}</td></tr>`)
      .join('');

    return `<h1>${esc(CONFIG.negocio.nombre)}</h1>
      <p class="tk-sub">${esc(CONFIG.negocio.rubro)}<br>${esc(CONFIG.negocio.direccion)} · ${esc(CONFIG.negocio.telefono)}</p>
      <div class="tk-sep"></div>
      <div class="tk-row"><span>Orden</span><span>${esc(orden.codigo)}</span></div>
      <div class="tk-row"><span>Servicio</span><span>${esc(orden.codigoServicio || orden.clienteCodigo)}</span></div>
      <div class="tk-row"><span>Cliente</span><span>${esc(orden.clienteCodigo)}</span></div>
      <div class="tk-row"><span>Fecha</span><span>${fmtFecha.format(new Date(orden.ingreso))} ${fmtHora.format(new Date(orden.ingreso))}</span></div>
      <div class="tk-sep"></div>
      <p><strong>${esc(orden.cliente.nombre)}</strong><br>${esc(orden.cliente.telefono)}${orden.cliente.email ? '<br>' + esc(orden.cliente.email) : ''}</p>
      <div class="tk-sep"></div>
      <table>${filas}</table>
      <div class="tk-sep"></div>
      <div class="tk-row"><span>Subtotal</span><span>${money(orden.subtotal)}</span></div>
      ${orden.descuento > 0 ? `<div class="tk-row"><span>Descuento</span><span>-${money(orden.descuento)}</span></div>` : ''}
      ${costo > 0 ? `<div class="tk-row"><span>Envío</span><span>${money(costo)}</span></div>` : ''}
      <div class="tk-row tk-total"><span>TOTAL</span><span>${money(orden.total)}</span></div>
      <div class="tk-row"><span>Pago</span><span>${esc(orden.formaPago)}</span></div>
      ${orden.entregadoEn ? `<div class="tk-row"><span>Salida</span><span>${fmtFecha.format(new Date(orden.entregadoEn))} ${fmtHora.format(new Date(orden.entregadoEn))}</span></div>` : ''}
      ${orden.almacen && orden.estado !== 'entregado' ? `<div class="tk-row"><span>Almacén</span><span>${esc(orden.almacen.codigo)}</span></div>` : ''}
      ${orden.recibidoPor ? `<div class="tk-row"><span>Recibió</span><span>${esc(orden.recibidoPor.nombre)}${orden.recibidoPor.documento ? ` · ${esc(orden.recibidoPor.documento)}` : ''}</span></div>` : ''}
      <div class="tk-sep"></div>
      <div class="tk-aviso"><strong>${domicilio ? 'ENTREGA:' : 'RECOJO:'}</strong> ${esc(capitalizar(dia))}, desde las ${esc(hora)}.<br>${domicilio ? esc(direccion || 'Dirección por confirmar') : 'Presenta tu código ' + esc(orden.codigo)}</div>
      ${orden.notas ? `<p style="margin-top:6px">Obs: ${esc(orden.notas)}</p>` : ''}
      <p class="tk-foot">Gracias por su preferencia<br>${esc(CONFIG.negocio.telefono)}</p>`;
  }

  function imprimirOrden(orden) {
    $('#ticket').innerHTML = ticketHTML(orden);
    window.print();
  }

  /* -------------------------------- Modal ------------------------------- */

  function abrirModal(html) {
    $('#modalContenido').innerHTML = html;
    $('#modal').classList.add('is-open');
    $('#modal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-abierto');
    const boton = $('#modalContenido .btn-primary') || $('#modalContenido button');
    if (boton) boton.focus();
  }

  function cerrarModal() {
    $('#modal').classList.remove('is-open');
    $('#modal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-abierto');
    $('#modalContenido').innerHTML = '';
  }

  function abrirModalExito(orden) {
    const { dia, hora } = fechaAviso(new Date(orden.recojoEn));
    const entrega = datosEntrega(orden);
    abrirModal(`
      <div class="exito-icon" aria-hidden="true">✓</div>
      <h2>Servicio registrado</h2>
      <p class="muted">${esc(orden.cliente.nombre)} · código de cliente <strong>${esc(orden.clienteCodigo)}</strong></p>
      <p class="muted small">Servicio #${String(orden.servicioN || 1).padStart(2, '0')} · ${esc(orden.codigoServicio || '')}</p>

      <div class="code-big">${esc(orden.codigo)}</div>

      <div class="aviso-box">
        <p class="eyebrow">Aviso para el cliente</p>
        <strong>${entrega.domicilio ? `Entrega a domicilio el ${esc(dia)}` : `Tus prendas estarán listas el ${esc(dia)}`}</strong>
        <p>Desde las ${esc(hora)} · ${esc(entrega.domicilio ? entrega.direccion || 'dirección por confirmar' : CONFIG.negocio.direccion)}</p>
      </div>

      <div class="resumen-mini">
        <div><span class="k">Prendas</span><span class="v">${orden.prendas} und</span></div>
        <div><span class="k">Peso registrado</span><span class="v">${Number(orden.pesoTotal).toFixed(2)} kg</span></div>
        ${entrega.costo > 0 ? `<div><span class="k">Envío</span><span class="v">${money(entrega.costo)}</span></div>` : ''}
        <div><span class="k">Total a pagar</span><span class="v">${money(orden.total)}</span></div>
        <div class="total"><span>${entrega.domicilio ? 'Entrega' : 'Recojo'}</span><span>${esc(dia)}, ${esc(hora)}</span></div>
      </div>

      <div class="modal-acciones">
        <a class="btn btn-primary" href="${urlWhatsApp(orden)}" target="_blank" rel="noopener">Enviar aviso por WhatsApp</a>
        <button class="btn btn-outline" type="button" data-accion="copiar" data-id="${orden.id}">Copiar cuadro del mensaje</button>
        <button class="btn btn-outline" type="button" data-accion="imprimir" data-id="${orden.id}">Imprimir comprobante</button>
      </div>

      <details class="preview" style="margin-top:14px">
        <summary>Ver el mensaje que recibirá el cliente</summary>
        <pre class="msg-preview">${esc(construirMensaje(orden))}</pre>
      </details>

      <button class="btn btn-ghost btn-block" type="button" data-accion="cerrar" style="margin-top:8px">Cerrar y continuar</button>
    `);
  }

  function abrirDetalle(id) {
    const orden = Store.getOrden(id);
    if (!orden) return;
    estado.ordenActual = orden;
    const { dia, hora } = fechaAviso(new Date(orden.recojoEn));
    const badge = badgeEstado(orden.estado);
    const entrega = datosEntrega(orden);

    const pasos = [
      { titulo: 'Ingreso', fecha: orden.ingreso, nota: orden.operador ? `Registró ${orden.operador}` : '' },
      { titulo: 'Listo para recoger', fecha: orden.listoEn, nota: '' }
    ];
    if (orden.almacen) {
      pasos.push({ titulo: `En almacén · ${orden.almacen.codigo}`, fecha: orden.almacen.desde, nota: orden.almacen.nota || '' });
    }
    pasos.push({
      titulo: entrega.domicilio ? 'Entrega a domicilio' : 'Recogido',
      fecha: orden.entregadoEn,
      nota: orden.recibidoPor ? `Recibió ${orden.recibidoPor.nombre}` : ''
    });

    abrirModal(`
      <p class="eyebrow">Orden de servicio</p>
      <h2>${esc(orden.codigo)}</h2>
      <p class="muted">${esc(orden.cliente.nombre)} · ${esc(orden.clienteCodigo)}</p>

      <dl class="orden-meta">
        <div><dt>Teléfono</dt><dd>${esc(orden.cliente.telefono)}</dd></div>
        <div><dt>Correo</dt><dd>${esc(orden.cliente.email || '—')}</dd></div>
        <div><dt>Ingreso</dt><dd>${fmtFecha.format(new Date(orden.ingreso))} · ${fmtHora.format(new Date(orden.ingreso))}</dd></div>
        <div><dt>Servicio</dt><dd>#${String(orden.servicioN || 1).padStart(2, '0')} · ${esc(orden.codigoServicio || orden.clienteCodigo)}</dd></div>
        <div><dt>Recojo</dt><dd>${esc(capitalizar(dia))} · ${esc(hora)}</dd></div>
        <div><dt>Entrega</dt><dd>${entrega.domicilio ? `Domicilio · ${esc(entrega.direccion || 'sin dirección')}` : 'Recojo en tienda'}</dd></div>
        ${orden.almacen ? `<div><dt>Almacén</dt><dd><strong>${esc(orden.almacen.codigo)}</strong>${orden.almacen.nota ? ` · ${esc(orden.almacen.nota)}` : ''}</dd></div>` : ''}
        <div><dt>Proceso</dt><dd>${esc(orden.procesoNombre || '—')}</dd></div>
        <div><dt>Pago</dt><dd>${esc(orden.formaPago)}</dd></div>
        <div><dt>Estado</dt><dd>${badge}</dd></div>
        <div><dt>Listo</dt><dd>${orden.listoEn ? `${fmtFecha.format(new Date(orden.listoEn))} · ${fmtHora.format(new Date(orden.listoEn))}` : '—'}</dd></div>
        <div><dt>Salida</dt><dd>${orden.entregadoEn ? `${fmtFecha.format(new Date(orden.entregadoEn))} · ${fmtHora.format(new Date(orden.entregadoEn))}` : '—'}</dd></div>
        ${orden.recibidoPor ? `<div><dt>Recogió</dt><dd>${esc(orden.recibidoPor.nombre)}${orden.recibidoPor.documento ? ` · ${esc(orden.recibidoPor.documento)}` : ''}</dd></div>` : ''}
        <div><dt>Registró</dt><dd>${esc(orden.operador || '—')}</dd></div>
      </dl>

      <ol class="timeline">
        ${pasos
          .map(
            (paso) => `<li class="${paso.fecha ? 'done' : ''}">
              <span class="dot"></span>
              <div>
                <strong>${esc(paso.titulo)}</strong>
                <small>${paso.fecha ? `${fmtFecha.format(new Date(paso.fecha))} · ${fmtHora.format(new Date(paso.fecha))}${paso.nota ? ` · ${esc(paso.nota)}` : ''}` : 'Pendiente'}</small>
              </div>
            </li>`
          )
          .join('')}
      </ol>

      <ul class="detalle-lista">
        ${orden.items
          .map(
            (item) =>
              `<li><span>${esc(item.nombre)} · ${item.tipo === 'peso' ? Number(item.cantidad).toFixed(2) + ' kg' : item.cantidad + ' ' + item.unidad}</span><span>${money(item.subtotal)}</span></li>`
          )
          .join('')}
      </ul>

      <div class="resumen-mini">
        <div><span class="k">Subtotal</span><span class="v">${money(orden.subtotal)}</span></div>
        ${orden.descuento > 0 ? `<div><span class="k">Descuento</span><span class="v">-${money(orden.descuento)}</span></div>` : ''}
        ${entrega.costo > 0 ? `<div><span class="k">Envío</span><span class="v">${money(entrega.costo)}</span></div>` : ''}
        <div class="total"><span>Total</span><span>${money(orden.total)}</span></div>
      </div>

      ${orden.notas ? `<p class="hint" style="margin-bottom:12px">Observaciones: ${esc(orden.notas)}</p>` : ''}

      <div class="acciones-fila">
        ${orden.estado === 'recibido' ? `<button class="btn btn-primary btn-sm" type="button" data-listo="${orden.id}">Marcar listo y avisar</button>` : ''}
        ${orden.estado !== 'entregado' ? `<button class="btn ${orden.estado === 'listo' || orden.estado === 'almacen' ? 'btn-primary' : 'btn-outline'} btn-sm" type="button" data-salida="${orden.id}">Prendas recogidas</button>` : ''}
        ${orden.estado !== 'entregado' ? `<button class="btn btn-outline btn-sm" type="button" data-almacen="${orden.id}">${orden.almacen ? 'Cambiar ubicación' : 'Guardar en almacén'}</button>` : ''}
        ${orden.estado !== 'recibido' ? `<button class="btn btn-ghost btn-sm" type="button" data-estado="recibido" data-id="${orden.id}">Volver a proceso</button>` : ''}
      </div>

      <div class="modal-acciones" style="margin-top:10px">
        <a class="btn btn-outline" href="${urlWhatsApp(orden, tipoAvisoSugerido(orden))}" target="_blank" rel="noopener">${orden.estado === 'listo' ? 'Reenviar aviso de recojo' : 'Enviar aviso por WhatsApp'}</a>
        <button class="btn btn-outline" type="button" data-accion="imprimir" data-id="${orden.id}">Imprimir comprobante</button>
      </div>
    `);
  }

  function abrirDatos() {
    const ordenes = Store.getOrdenes().length;
    const clientes = Store.getClientes().length;
    abrirModal(`
      <p class="eyebrow">Respaldo</p>
      <h2>Datos del sistema</h2>
      <p class="muted">${ordenes} órdenes y ${clientes} clientes guardados en este navegador.</p>

      <div class="modal-acciones" style="margin-top:18px">
        <button class="btn btn-outline" type="button" data-accion="respaldo">Descargar respaldo (JSON)</button>
        <button class="btn btn-outline" type="button" data-accion="csv">Exportar órdenes (CSV)</button>
        <button class="btn btn-outline" type="button" data-accion="importar">Restaurar desde respaldo</button>
      </div>

      <input type="file" id="archivoRespaldo" accept="application/json,.json" hidden />

      <p class="hint" style="margin-top:14px">Los datos viven en este navegador (localStorage). Descarga un respaldo antes de cambiar de equipo o limpiar el navegador.</p>
      <button class="btn btn-ghost btn-block" type="button" data-accion="cerrar" style="margin-top:10px">Cerrar</button>
    `);
  }

  /* ------------------------------ Descargas ----------------------------- */

  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function exportarRespaldo() {
    descargar(`lavamili-respaldo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(Store.snapshot(), null, 2), 'application/json');
    toast('Respaldo descargado');
  }

  function exportarCSV() {
    const filas = [['Codigo', 'Servicio', 'Cliente', 'Codigo cliente', 'Telefono', 'Ingreso', 'Recojo', 'Salida', 'Entrega', 'Almacen', 'Peso kg', 'Prendas', 'Total', 'Estado', 'Pago', 'Recogido por']];
    Store.getOrdenes().forEach((o) => {
      filas.push([
        o.codigo,
        o.codigoServicio || '',
        o.cliente.nombre,
        o.clienteCodigo,
        o.cliente.telefono,
        fmtFecha.format(new Date(o.ingreso)),
        fmtFecha.format(new Date(o.recojoEn)),
        o.entregadoEn ? fmtFecha.format(new Date(o.entregadoEn)) : '',
        o.entrega && o.entrega.tipo === 'domicilio' ? `Domicilio: ${o.entrega.direccion || ''}` : 'Tienda',
        o.almacen ? o.almacen.codigo : '',
        Number(o.pesoTotal).toFixed(2),
        o.prendas,
        Number(o.total).toFixed(2),
        o.estado,
        o.formaPago,
        o.recibidoPor ? o.recibidoPor.nombre : ''
      ]);
    });
    const csv = filas.map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    descargar(`lavamili-ordenes-${new Date().toISOString().slice(0, 10)}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8;');
    toast('Órdenes exportadas');
  }

  function importarRespaldo(archivo) {
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const datos = JSON.parse(String(lector.result));
        if (!datos || !Array.isArray(datos.ordenes)) throw new Error('Formato no válido');
        Store.reemplazarTodo(datos);
        renderCatalogo();
        renderOrdenes();
        renderClientes();
        renderResumen();
        renderBanner();
        refrescarResumen();
        cerrarModal();
        toast(`Respaldo restaurado: ${datos.ordenes.length} órdenes`);
      } catch (error) {
        toast('El archivo no es un respaldo válido de LavaMili');
      }
    };
    lector.readAsText(archivo);
  }

  /* ------------------------------ Estados ------------------------------- */

  function badgeEstado(idEstado) {
    const def = CONFIG.estados.find((e) => e.id === idEstado) || CONFIG.estados[0];
    return `<span class="estado ${def.clase}">${esc(def.nombre)}</span>`;
  }

  function proximoRecordatorio(base) {
    return calcularListo(base, 24);
  }

  const ESTADOS_PENDIENTES = ['listo', 'almacen'];

  function pendientesDeRecojo() {
    return Store.getOrdenes()
      .filter((o) => ESTADOS_PENDIENTES.includes(o.estado))
      .sort((a, b) => new Date(a.recojoEn) - new Date(b.recojoEn));
  }

  function recordatoriosPendientes() {
    const ahora = Date.now();
    return pendientesDeRecojo().filter((o) => o.recordatorioEn && new Date(o.recordatorioEn).getTime() <= ahora);
  }

  function renderBanner() {
    const banner = $('#bannerAvisos');
    const pendientes = pendientesDeRecojo();

    if (banner) {
      if (!pendientes.length) {
        banner.classList.add('oculto');
      } else {
        const enAlmacen = pendientes.filter((o) => o.estado === 'almacen').length;
        const porReenviar = recordatoriosPendientes().length;
        const partes = [];

        if (enAlmacen) partes.push(`${enAlmacen} en almacén`);
        partes.push(porReenviar ? `${porReenviar} con recordatorio pendiente` : 'recordatorio programado para el día siguiente');

        $('#bannerTitulo').textContent = `${pendientes.length} ${pendientes.length === 1 ? 'servicio pendiente' : 'servicios pendientes'} de recojo`;
        $('#bannerDetalle').textContent = partes.join(' · ');
        banner.classList.remove('oculto');
      }
    }

    // El tablero se refresca junto con los avisos: todo cambio de estado
    // termina llamando a esta función.
    renderTablero();
  }

  function marcarListo(id, enviar = true, abrirFicha = true) {
    const orden = Store.getOrden(id);
    if (!orden || orden.estado === 'entregado') return;

    const ahora = new Date();
    const actualizada = Store.updateOrden(id, {
      estado: 'listo',
      listoEn: orden.listoEn || ahora.toISOString(),
      recordatorioEn: proximoRecordatorio(ahora).toISOString(),
      ultimoAvisoEn: enviar ? ahora.toISOString() : orden.ultimoAvisoEn || null
    });

    renderOrdenes();
    renderResumen();
    renderBanner();
    renderClientes();
    if (abrirFicha) abrirDetalle(id);
    toast('Servicio listo. Aviso al cliente preparado.');
    if (enviar) abrirWhatsApp(actualizada, 'listo');
  }

  function confirmarSalida(id) {
    const orden = Store.getOrden(id);
    if (!orden) return;
    const entrega = datosEntrega(orden);
    const verbo = entrega.domicilio ? 'recibe' : 'recoge';

    abrirModal(`
      <p class="eyebrow">Entrega de prendas</p>
      <h2>Registrar salida</h2>
      <p class="muted">${esc(orden.cliente.nombre)} · ${esc(orden.clienteCodigo)}</p>

      <div class="codigo-entrega">
        <span>Código del servicio</span>
        <strong>${esc(orden.codigo)}</strong>
        <small>${esc(orden.codigoServicio || '')} · Servicio #${String(orden.servicioN || 1).padStart(2, '0')}</small>
      </div>

      <div class="resumen-mini">
        <div><span class="k">Prendas</span><span class="v">${orden.prendas} und</span></div>
        <div><span class="k">Peso</span><span class="v">${Number(orden.pesoTotal).toFixed(2)} kg</span></div>
        <div><span class="k">Entrega</span><span class="v">${entrega.domicilio ? 'A domicilio' : 'En tienda'}</span></div>
        ${orden.almacen ? `<div><span class="k">Almacén</span><span class="v">${esc(orden.almacen.codigo)}</span></div>` : ''}
        <div class="total"><span>Total cobrado</span><span>${money(orden.total)}</span></div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="quienRecoge">Quién ${verbo} <span class="req">*</span></label>
          <input id="quienRecoge" type="text" value="${esc(orden.cliente.nombre)}" autocomplete="off" />
          <p class="hint">Por defecto el titular; cámbialo si viene otra persona.</p>
        </div>
        <div class="field">
          <label for="documentoRecoge">DNI / documento</label>
          <input id="documentoRecoge" type="text" inputmode="numeric" maxlength="12" placeholder="Opcional" autocomplete="off" />
        </div>
      </div>

      <div class="verifica">
        <label for="codigoVerifica">Últimos 4 o 5 números del código <span class="req">*</span></label>
        <div class="verifica-fila">
          <input id="codigoVerifica" type="text" inputmode="numeric" maxlength="14" data-orden="${orden.id}" placeholder="Ej. ${esc(String(orden.codigo || '').split('-').pop().slice(-4))}" autocomplete="off" spellcheck="false" />
          <button class="btn btn-outline" type="button" id="btnVerificar" data-verificar="${orden.id}">Verificar</button>
        </div>
        <p class="hint" id="verificaMsg">Últimos 4 o 5 números del comprobante; también vale el código completo.</p>
      </div>

      <p class="hint">Se guarda quién recibe, la fecha y la hora. El servicio queda cerrado y dejan de enviarse recordatorios.</p>

      <div class="modal-acciones" style="margin-top:14px">
        <button class="btn btn-primary" type="button" id="btnConfirmarEntrega" data-confirmar-salida="${orden.id}" disabled>Confirmar entrega</button>
        <button class="btn btn-ghost" type="button" data-accion="cerrar">Cancelar</button>
      </div>
    `);
  }

  const normalizarCodigo = (valor) => String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function verificarCodigo(id) {
    const orden = Store.getOrden(id);
    if (!orden) return;

    const campo = $('#codigoVerifica');
    const mensaje = $('#verificaMsg');
    const boton = $('#btnConfirmarEntrega');
    const valor = normalizarCodigo(campo.value);

    if (!valor) {
      campo.focus();
      mensaje.textContent = 'Escribe los últimos 4 o 5 números del código.';
      mensaje.className = 'hint error';
      toast('Escribe los últimos números del código');
      return;
    }

    const digitos = String(orden.codigo || '').replace(/\D/g, '');
    // Serial del servicio (lo que va después del último guion): 0001, 0012…
    const partes = String(orden.codigo || '').split('-');
    const serial = partes[partes.length - 1];
    const corto4 = serial.slice(-4);
    const corto5 = serial.padStart(5, '0').slice(-5);
    const completo = normalizarCodigo(orden.codigo);
    const coincide = valor.length >= 4 && (valor === corto4 || valor === corto5 || valor === completo || valor === digitos);

    if (!coincide) {
      campo.classList.add('invalid');
      mensaje.textContent = `No coincide: no es la terminación de ${orden.codigo}. Revisa el comprobante del cliente.`;
      mensaje.className = 'hint error';
      boton.disabled = true;
      toast('Código incorrecto');
      campo.focus();
      campo.select();
      return;
    }

    campo.classList.remove('invalid');
    campo.readOnly = true;
    $('#btnVerificar').disabled = true;
    mensaje.textContent = `Código verificado (${orden.codigo}). Ya puedes confirmar la entrega.`;
    mensaje.className = 'hint ok';
    boton.disabled = false;
    boton.focus();
    toast('Código verificado');
  }

  function ejecutarEntrega(id) {
    const orden = Store.getOrden(id);
    if (!orden) return;

    const nombre = $('#quienRecoge').value.trim();
    const documento = $('#documentoRecoge').value.trim();

    if (nombre.length < 3) {
      marcarInvalido('#quienRecoge');
      toast('Escribe el nombre de quien recoge las prendas');
      return;
    }
    if ($('#btnConfirmarEntrega').disabled) {
      toast('Verifica el código del servicio antes de entregar');
      return;
    }

    const ahora = new Date().toISOString();
    Store.updateOrden(id, {
      estado: 'entregado',
      entregadoEn: ahora,
      recordatorioEn: null,
      recibidoPor: { nombre, documento, fecha: ahora }
    });

    renderOrdenes();
    renderResumen();
    renderBanner();
    renderClientes();
    cerrarModal();
    toast(`${orden.codigo} entregado a ${nombre}`);
  }

  function abrirModalAvisos() {
    const pendientes = pendientesDeRecojo();

    abrirModal(`
      <p class="eyebrow">Seguimiento</p>
      <h2>Avisos de recojo</h2>
      <p class="muted">Servicios listos o en almacén que aún no se entregan. El recordatorio se reenvía cada 24 horas hasta el cierre.</p>

      <div class="avisos-lista">
        ${
          pendientes
            .map((o) => {
              const rec = o.recordatorioEn ? new Date(o.recordatorioEn) : null;
              const pendiente = rec && rec.getTime() <= Date.now();
              return `<div class="aviso-item">
                <div class="aviso-info">
                  <strong>${esc(o.cliente.nombre)}</strong>
                  <span>${esc(o.codigo)} · ${esc(o.codigoServicio || '')} · ${money(o.total)}${o.entrega && o.entrega.tipo === 'domicilio' ? ' · envío' : ''}</span>
                  ${o.almacen ? `<span>Almacén <strong>${esc(o.almacen.codigo)}</strong>${o.almacen.nota ? ` · ${esc(o.almacen.nota)}` : ''}</span>` : ''}
                  <span class="${pendiente ? 'aviso-pend' : ''}">${rec ? (pendiente ? 'Recordatorio pendiente: ' : 'Próximo recordatorio: ') + esc(fechaAviso(rec).corta) : 'Sin recordatorio programado'}</span>
                </div>
                <div class="aviso-acciones">
                  <a class="btn btn-sm btn-primary" href="${urlWhatsApp(o, 'recordatorio')}" target="_blank" rel="noopener" data-aviso="${o.id}">Reenviar</a>
                  <button class="btn btn-sm btn-outline" type="button" data-almacen="${o.id}">Almacén</button>
                  <button class="btn btn-sm btn-outline" type="button" data-salida="${o.id}">Recogido</button>
                </div>
              </div>`;
            })
            .join('') || '<p class="sin-datos">No hay servicios pendientes de recojo.</p>'
        }
      </div>

      <button class="btn btn-ghost btn-block" type="button" data-accion="cerrar">Cerrar</button>
    `);
  }

  function registrarReenvio(id) {
    const orden = Store.getOrden(id);
    if (!orden) return;
    Store.updateOrden(id, {
      ultimoAvisoEn: new Date().toISOString(),
      recordatorioEn: proximoRecordatorio(new Date()).toISOString()
    });
    renderBanner();
    renderOrdenes();
    if ($('#modalContenido .avisos-lista')) abrirModalAvisos();
    toast('Recordatorio reenviado. El siguiente queda para mañana.');
  }

  function abrirAlmacen(id) {
    const orden = Store.getOrden(id);
    if (!orden) return;
    const actual = orden.almacen || {};

    abrirModal(`
      <p class="eyebrow">Resguardo</p>
      <h2>${orden.almacen ? 'Cambiar ubicación' : 'Guardar en almacén'}</h2>
      <p class="muted">${esc(orden.cliente.nombre)} · ${esc(orden.codigo)} · Servicio #${String(orden.servicioN || 1).padStart(2, '0')}</p>

      <div class="field mt-14">
        <label for="codigoAlmacen">Código de almacén <span class="req">*</span></label>
        <input id="codigoAlmacen" type="text" list="listaAlmacenes" value="${esc(actual.codigo || '')}" placeholder="Ej. ALM-A2" autocomplete="off" />
        <datalist id="listaAlmacenes">
          ${CONFIG.almacenes.map((a) => `<option value="${esc(a.codigo)}">${esc(a.nombre)}</option>`).join('')}
        </datalist>
        <p class="hint">Elige una ubicación de la lista o escribe un código propio.</p>
      </div>

      <div class="field">
        <label for="notaAlmacen">Referencia (opcional)</label>
        <input id="notaAlmacen" type="text" value="${esc(actual.nota || '')}" placeholder="Ej. caja 3, bolsa con nombre" />
      </div>

      <p class="hint" style="margin-top:10px">El servicio queda como «En almacén» y sigue enviando recordatorios hasta que se recoja.</p>

      <div class="modal-acciones" style="margin-top:14px">
        <button class="btn btn-primary" type="button" data-guardar-almacen="${orden.id}">Guardar ubicación</button>
        ${orden.almacen ? `<button class="btn btn-outline" type="button" data-quitar-almacen="${orden.id}">Quitar de almacén</button>` : ''}
        <button class="btn btn-ghost" type="button" data-accion="cerrar">Cancelar</button>
      </div>
    `);
  }

  function guardarAlmacen(id) {
    const orden = Store.getOrden(id);
    if (!orden) return;
    const codigo = $('#codigoAlmacen').value.trim().toUpperCase();
    const nota = $('#notaAlmacen').value.trim();

    if (codigo.length < 3) {
      marcarInvalido('#codigoAlmacen');
      toast('Escribe el código de almacén (ej. ALM-A2)');
      return;
    }

    Store.updateOrden(id, {
      estado: 'almacen',
      almacen: {
        codigo,
        nota,
        desde: orden.almacen && orden.almacen.desde ? orden.almacen.desde : new Date().toISOString()
      }
    });

    renderOrdenes();
    renderResumen();
    renderBanner();
    abrirDetalle(id);
    toast(`Guardado en ${codigo}`);
  }

  function quitarAlmacen(id) {
    const orden = Store.getOrden(id);
    if (!orden) return;
    Store.updateOrden(id, { estado: 'listo', almacen: null });
    renderOrdenes();
    renderResumen();
    renderBanner();
    abrirDetalle(id);
    toast('Prenda retirada del almacén');
  }

  function cambiarEstado(id, nuevoEstado) {
    const cambios = { estado: nuevoEstado };

    if (nuevoEstado === 'recibido') {
      cambios.listoEn = null;
      cambios.entregadoEn = null;
      cambios.recordatorioEn = null;
      cambios.almacen = null;
    } else if (nuevoEstado === 'listo') {
      cambios.listoEn = new Date().toISOString();
      cambios.entregadoEn = null;
      cambios.recordatorioEn = proximoRecordatorio(new Date()).toISOString();
    } else if (nuevoEstado === 'entregado') {
      cambios.entregadoEn = new Date().toISOString();
      cambios.recordatorioEn = null;
    }

    const orden = Store.updateOrden(id, cambios);
    if (!orden) return;
    renderOrdenes();
    renderResumen();
    renderBanner();
    renderClientes();
    toast(`Orden ${orden.codigo}: ${CONFIG.estados.find((e) => e.id === nuevoEstado).nombre}`);
    abrirDetalle(id);
  }

  /* -------------------------------- Órdenes ----------------------------- */

  function ordenesFiltradas() {
    const texto = $('#buscarOrden').value.trim().toLowerCase();
    const filtro = $('#filtroEstado').value;
    return Store.getOrdenes()
      .slice()
      .sort((a, b) => (a.ingreso < b.ingreso ? 1 : -1))
      .filter((o) => {
        if (filtro && o.estado !== filtro) return false;
        if (!texto) return true;
        return [o.codigo, o.codigoServicio, o.cliente.nombre, o.cliente.telefono, o.clienteCodigo, o.almacen && o.almacen.codigo]
          .join(' ')
          .toLowerCase()
          .includes(texto);
      });
  }

  function renderOrdenes() {
    const lista = ordenesFiltradas();
    const cuerpo = $('#tablaOrdenes');
    const vacio = $('#ordenesVacio');
    const hayDatos = Store.getOrdenes().length > 0;

    if (!lista.length) {
      cuerpo.innerHTML = '';
      vacio.classList.remove('oculto');
      const titulo = vacio.querySelector('strong');
      const texto = vacio.querySelector('p');
      if (hayDatos) {
        titulo.textContent = 'Sin resultados';
        texto.textContent = 'Prueba con otro código, nombre o estado.';
        $('#btnEjemplos').classList.add('oculto');
      }
      return;
    }
    vacio.classList.add('oculto');

    cuerpo.innerHTML = lista
      .map((o) => {
        const recojo = new Date(o.recojoEn);
        const entrega = datosEntrega(o);
        const detalle = [o.pesoTotal > 0 ? `${Number(o.pesoTotal).toFixed(2)} kg` : null, `${o.prendas} und`].filter(Boolean).join(' · ');
        return `<tr>
          <td class="code-cell">${esc(o.codigo)}<br><span class="muted small">Servicio #${String(o.servicioN || 1).padStart(2, '0')}</span></td>
          <td><div class="who"><strong>${esc(o.cliente.nombre)}</strong><span>${esc(o.clienteCodigo)} · ${esc(o.cliente.telefono)}</span></div></td>
          <td>${fmtFecha.format(new Date(o.ingreso))}<br><span class="muted small">${fmtHora.format(new Date(o.ingreso))}</span></td>
          <td>${fmtFecha.format(recojo)}<br><span class="muted small">${fmtHora.format(recojo)}</span>${entrega.domicilio ? '<br><span class="tag-domicilio">Domicilio</span>' : ''}</td>
          <td class="detalle-celda">${esc(detalle)}</td>
          <td class="right code-cell">${money(o.total)}</td>
          <td>${badgeEstado(o.estado)}${o.entregadoEn ? `<br><span class="muted small">Salida ${fmtHora.format(new Date(o.entregadoEn))}</span>` : ''}${o.recibidoPor ? `<br><span class="muted small">Recogió: ${esc(o.recibidoPor.nombre)}</span>` : ''}${o.almacen && o.estado !== 'entregado' ? `<br><span class="tag-almacen">${esc(o.almacen.codigo)}</span>` : ''}</td>
          <td class="right">
            <div class="row-actions">
              <button class="btn-mini" type="button" data-ver="${o.id}">Ver</button>
              <button class="btn-mini wa" type="button" data-wa="${o.id}">WhatsApp</button>
              ${o.estado === 'recibido' ? `<button class="btn-mini" type="button" data-listo="${o.id}">Listo</button>` : ''}
              ${o.estado === 'listo' ? `<button class="btn-mini" type="button" data-almacen="${o.id}">Almacén</button>` : ''}
              ${o.estado !== 'entregado' ? `<button class="btn-mini" type="button" data-salida="${o.id}">Recogido</button>` : ''}
              <button class="btn-mini" type="button" data-print="${o.id}">Imprimir</button>
            </div>
          </td>
        </tr>`;
      })
      .join('');
  }

  /* -------------------------------- Clientes ---------------------------- */

  function renderClientes() {
    const texto = $('#buscarCliente').value.trim().toLowerCase();
    const clientes = Store.getClientes()
      .map((c) => ({ ...c, stats: Store.statsCliente(c) }))
      .filter((c) => !texto || `${c.codigo} ${c.nombre} ${c.telefono}`.toLowerCase().includes(texto))
      .sort((a, b) => (b.stats.ultima || '').localeCompare(a.stats.ultima || ''));

    const cuerpo = $('#tablaClientes');
    const vacio = $('#clientesVacio');

    if (!clientes.length) {
      cuerpo.innerHTML = '';
      vacio.classList.remove('oculto');
      return;
    }
    vacio.classList.add('oculto');

    cuerpo.innerHTML = clientes
      .map(
        (c) => `<tr>
          <td class="code-cell">${esc(c.codigo)}</td>
          <td><strong>${esc(c.nombre)}</strong></td>
          <td>${esc(c.telefono)}</td>
          <td class="detalle-celda">${esc(c.email || '—')}</td>
          <td class="right">${c.stats.ordenes}</td>
          <td class="right code-cell">${money(c.stats.total)}</td>
          <td>${c.stats.ultima ? fmtFecha.format(new Date(c.stats.ultima)) : '—'}</td>
        </tr>`
      )
      .join('');
  }

  /* -------------------------------- Tablero ----------------------------- */

  function haceTiempo(fechaISO) {
    if (!fechaISO) return '';
    const minutos = Math.max(0, Math.round((Date.now() - new Date(fechaISO).getTime()) / 60000));
    if (minutos < 1) return 'ahora';
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    return `hace ${Math.floor(horas / 24)} d`;
  }

  function horaCorta(fechaISO) {
    if (!fechaISO) return '';
    const fecha = new Date(fechaISO);
    if (Number.isNaN(fecha.getTime())) return '';
    return mismoDia(fecha, new Date()) ? fmtHora24.format(fecha) : fmtFecha.format(fecha);
  }

  function tarjetaKanban(orden) {
    const etapa =
      orden.estado === 'recibido'
        ? { etiqueta: 'Ingresó', fecha: orden.ingreso }
        : orden.estado === 'listo'
          ? { etiqueta: 'Listo', fecha: orden.listoEn }
          : orden.estado === 'almacen'
            ? { etiqueta: 'Guardado', fecha: orden.almacen && orden.almacen.desde }
            : { etiqueta: 'Recogido', fecha: orden.entregadoEn };

    let acciones = '';
    if (orden.estado === 'recibido') {
      acciones = `<button class="btn-mini primary" type="button" data-listo="${orden.id}">Ya está listo</button>
        <button class="btn-mini" type="button" data-ver="${orden.id}">Ver</button>`;
    } else if (orden.estado === 'listo') {
      acciones = `<button class="btn-mini" type="button" data-almacen="${orden.id}" title="Guardar en almacén">Almacén</button>
        <button class="btn-mini primary" type="button" data-salida="${orden.id}">Recogido</button>
        <button class="btn-mini" type="button" data-ver="${orden.id}">Ver</button>`;
    } else if (orden.estado === 'almacen') {
      acciones = `<button class="btn-mini" type="button" data-almacen="${orden.id}" title="Cambiar ubicación">${esc((orden.almacen && orden.almacen.codigo) || 'Ubicación')}</button>
        <button class="btn-mini primary" type="button" data-salida="${orden.id}">Recogido</button>
        <button class="btn-mini" type="button" data-ver="${orden.id}">Ver</button>`;
    } else {
      acciones = `<button class="btn-mini" type="button" data-ver="${orden.id}">Ver detalle</button>`;
    }

    return `<article class="kcard">
      <div class="kcard-top">
        <span class="kcard-code">${esc(orden.codigo)}</span>
        <span class="kcard-age">${esc(haceTiempo(etapa.fecha))}</span>
      </div>
      <p class="kcard-client">${esc(orden.cliente.nombre)}</p>
      <p class="kcard-meta">${esc(etapa.etiqueta)} ${esc(horaCorta(etapa.fecha))}${orden.pesoTotal > 0 ? ` · ${Number(orden.pesoTotal).toFixed(2)} kg` : ''} · ${money(orden.total)}</p>
      ${orden.estado === 'entregado' && orden.recibidoPor ? `<p class="kcard-note">Recogió: ${esc(orden.recibidoPor.nombre)}</p>` : ''}
      ${orden.estado === 'almacen' && orden.almacen && orden.almacen.nota ? `<p class="kcard-note">${esc(orden.almacen.nota)}</p>` : ''}
      <div class="kcard-actions">${acciones}</div>
    </article>`;
  }

  function columnaKanban(clase, titulo, lista, vacio) {
    return `<section class="kcol ${clase}">
      <header class="kcol-head"><h2>${esc(titulo)}</h2><span class="kcount">${lista.length}</span></header>
      <div class="kcol-body">${lista.length ? lista.map(tarjetaKanban).join('') : `<p class="kempty">${esc(vacio)}</p>`}</div>
    </section>`;
  }

  function renderTablero() {
    const ordenes = Store.getOrdenes();
    const hoy = new Date();

    const ingresadosHoy = ordenes.filter((o) => mismoDia(new Date(o.ingreso), hoy));
    const enProceso = ordenes
      .filter((o) => o.estado === 'recibido')
      .sort((a, b) => new Date(a.ingreso) - new Date(b.ingreso));
    const listos = ordenes
      .filter((o) => o.estado === 'listo')
      .sort((a, b) => new Date(a.listoEn || a.ingreso) - new Date(b.listoEn || b.ingreso));
    const almacen = ordenes
      .filter((o) => o.estado === 'almacen')
      .sort((a, b) => new Date((a.almacen && a.almacen.desde) || a.ingreso) - new Date((b.almacen && b.almacen.desde) || b.ingreso));
    const recogidosHoy = ordenes
      .filter((o) => o.entregadoEn && mismoDia(new Date(o.entregadoEn), hoy))
      .sort((a, b) => new Date(b.entregadoEn) - new Date(a.entregadoEn));

    const prendasHoy = ingresadosHoy.reduce((acc, o) => acc + (Number(o.prendas) || 0), 0);
    const kilosHoy = ingresadosHoy.reduce((acc, o) => acc + (Number(o.pesoTotal) || 0), 0);
    const montoRecogido = recogidosHoy.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

    $('#pipeline').innerHTML = `
      <div class="pipe-card ingreso"><p class="pipe-label">Ingresados hoy</p><p class="pipe-value">${ingresadosHoy.length}</p><p class="pipe-sub">${prendasHoy} prendas · ${kilosHoy.toFixed(2)} kg</p></div>
      <div class="pipe-card proceso"><p class="pipe-label">En proceso</p><p class="pipe-value">${enProceso.length}</p><p class="pipe-sub">en taller ahora</p></div>
      <div class="pipe-card listo"><p class="pipe-label">Listos</p><p class="pipe-value">${listos.length}</p><p class="pipe-sub">para recoger</p></div>
      <div class="pipe-card almacen"><p class="pipe-label">En almacén</p><p class="pipe-value">${almacen.length}</p><p class="pipe-sub">en resguardo</p></div>
      <div class="pipe-card recogido"><p class="pipe-label">Recogidos hoy</p><p class="pipe-value">${recogidosHoy.length}</p><p class="pipe-sub">${money(montoRecogido)} entregado</p></div>
    `;

    $('#kanban').innerHTML = [
      columnaKanban('proceso', 'En proceso', enProceso, 'Nada en el taller'),
      columnaKanban('listo', 'Listos', listos, 'Sin prendas listas'),
      columnaKanban('almacen', 'En almacén', almacen, 'Almacén vacío'),
      columnaKanban('recogido', 'Recogidos hoy', recogidosHoy, 'Sin recojos hoy')
    ].join('');
  }

  /* -------------------------------- Resumen ----------------------------- */

  function renderResumen() {
    const ordenes = Store.getOrdenes();
    const hoy = new Date();

    const ingresosDelDia = ordenes.filter((o) => mismoDia(new Date(o.ingreso), hoy));
    const salidasDelDia = ordenes.filter((o) => o.entregadoEn && mismoDia(new Date(o.entregadoEn), hoy));
    const enPlanta = ordenes.filter((o) => o.estado !== 'entregado');
    const listos = ordenes.filter((o) => o.estado === 'listo');
    const enAlmacen = ordenes.filter((o) => o.estado === 'almacen');
    const kilosHoy = ingresosDelDia.reduce((acc, o) => acc + (Number(o.pesoTotal) || 0), 0);
    const facturadoHoy = ingresosDelDia.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    const prendasHoy = ingresosDelDia.reduce((acc, o) => acc + (Number(o.prendas) || 0), 0);

    $('#metrics').innerHTML = `
      <div class="metric"><p class="metric-label">Ingresos hoy</p><p class="metric-value">${ingresosDelDia.length}</p><p class="metric-sub">${prendasHoy} prendas registradas</p></div>
      <div class="metric"><p class="metric-label">Salidas hoy</p><p class="metric-value">${salidasDelDia.length}</p><p class="metric-sub">${enPlanta.length} en planta · ${enAlmacen.length} en almacén</p></div>
      <div class="metric"><p class="metric-label">Kilos hoy</p><p class="metric-value">${kilosHoy.toFixed(2)}</p><p class="metric-sub">pesados en mostrador</p></div>
      <div class="metric"><p class="metric-label">Facturado hoy</p><p class="metric-value">${money(facturadoHoy)}</p><p class="metric-sub">ingresos del día</p></div>
    `;

    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const total = ordenes
        .filter((o) => mismoDia(new Date(o.ingreso), d))
        .reduce((acc, o) => acc + (Number(o.total) || 0), 0);
      dias.push({ fecha: d, total, hoy: i === 0 });
    }
    const maximo = Math.max(...dias.map((d) => d.total), 1);
    const etiquetaDia = new Intl.DateTimeFormat('es-PE', { weekday: 'short' });

    $('#chartSemana').innerHTML = dias
      .map(
        (d) => `<div class="bar-wrap${d.hoy ? ' hoy' : ''}">
          <span class="bar-value">${d.total > 0 ? Math.round(d.total) : ''}</span>
          <div class="bar" style="height:${Math.max(4, (d.total / maximo) * 100)}%"><i></i></div>
          <span class="bar-label">${esc(etiquetaDia.format(d.fecha).replace('.', ''))}</span>
        </div>`
      )
      .join('');

    const recojos = ordenes
      .filter((o) => o.estado !== 'entregado' && mismoDia(new Date(o.recojoEn), hoy))
      .sort((a, b) => new Date(a.recojoEn) - new Date(b.recojoEn));

    $('#recojosHoy').innerHTML = recojos.length
      ? recojos
          .map(
            (o) => `<div class="recojo-item">
              <span class="hora">${fmtHora24.format(new Date(o.recojoEn))}</span>
              <div class="quien"><strong>${esc(o.cliente.nombre)}</strong><span>${esc(o.codigo)} · ${money(o.total)}</span></div>
              <button class="btn-mini wa" type="button" data-wa="${o.id}">Avisar</button>
            </div>`
          )
          .join('')
      : '<p class="sin-datos">No hay recojos programados para hoy.</p>';

    const filaMov = (o, fecha) => `<li class="mov-item">
        <span class="mov-hora">${fmtHora24.format(new Date(fecha))}</span>
        <div><strong>${esc(o.cliente.nombre)}</strong><span>${esc(o.codigo)} · ${money(o.total)}</span></div>
      </li>`;

    const ingresosOrdenados = ingresosDelDia.slice().sort((a, b) => new Date(a.ingreso) - new Date(b.ingreso));
    const salidasOrdenadas = salidasDelDia.slice().sort((a, b) => new Date(a.entregadoEn) - new Date(b.entregadoEn));

    $('#movimientos').innerHTML = `
      <div class="mov-col">
        <h3>Ingresos <span class="badge">${ingresosOrdenados.length}</span></h3>
        <ul>${ingresosOrdenados.map((o) => filaMov(o, o.ingreso)).join('') || '<li class="sin-datos">Sin ingresos registrados hoy.</li>'}</ul>
      </div>
      <div class="mov-col salidas">
        <h3>Salidas <span class="badge">${salidasOrdenadas.length}</span></h3>
        <ul>${salidasOrdenadas.map((o) => filaMov(o, o.entregadoEn)).join('') || '<li class="sin-datos">Sin salidas registradas hoy.</li>'}</ul>
      </div>`;
  }

  /* ----------------------------- Datos demo ----------------------------- */

  function cargarEjemplos() {
    if (Store.getOrdenes().length) return;
    const base = new Date();
    base.setHours(9, 0, 0, 0);

    const demo = [
      { dias: 0, hora: 9, nombre: 'Rosa Meléndez', tel: '987112233', email: 'rosa@correo.com', items: [['terno_completo', 1], ['peso_lavado', 3.66]], estado: 'recibido' },
      { dias: 0, hora: 11, nombre: 'Jorge Salazar', tel: '912345678', email: '', items: [['camisa', 4], ['pantalon', 2]], estado: 'recibido' },
      { dias: 1, hora: 10, nombre: 'Ana Torres', tel: '998877665', email: 'ana.torres@correo.com', items: [['edredon_2', 1], ['peso_lavado_secado', 5.2]], estado: 'almacen', almacen: 'ALM-A2' },
      { dias: 2, hora: 15, nombre: 'Carlos Ríos', tel: '955443322', email: '', items: [['terno_incompleto', 1], ['zapatillas', 1]], estado: 'entregado' },
      { dias: 3, hora: 12, nombre: 'Lucía Paredes', tel: '944332211', email: 'lucia@correo.com', items: [['vestido_fiesta', 1], ['peso_planchado', 2.4]], estado: 'entregado' },
      { dias: 5, hora: 16, nombre: 'Miguel Ángel Vera', tel: '933221100', email: '', items: [['cortina', 6], ['alfombra', 2]], estado: 'entregado', envio: 8, direccion: 'Jr. Las Begonias 128, San Isidro' }
    ];

    demo.forEach((d) => {
      const ingreso = new Date(base);
      ingreso.setDate(ingreso.getDate() - d.dias);
      ingreso.setHours(d.hora, 0, 0, 0);

      const cliente = Store.upsertCliente({ telefono: d.tel, nombre: d.nombre, email: d.email });
      const items = d.items.map(([id, cantidad]) => {
        const servicio = CONFIG.servicios.find((s) => s.id === id);
        const item = {
          key: uid('it'),
          servicioId: servicio.id,
          nombre: servicio.nombre,
          tipo: servicio.tipo,
          unidad: servicio.unidad,
          cantidad,
          tarifa: tarifaDe(servicio),
          minPeso: servicio.minPeso || 0
        };
        return { ...item, subtotal: calcularItem(item).subtotal };
      });

      const peso = redondear(items.filter((i) => i.tipo === 'peso').reduce((a, i) => a + i.cantidad, 0));
      const prendas = items.filter((i) => i.tipo !== 'peso').reduce((a, i) => a + i.cantidad, 0);
      const subtotal = redondear(items.reduce((a, i) => a + i.subtotal, 0));
      let recojo = calcularListo(ingreso, 24);
      if (recojo.getTime() < Date.now()) recojo = calcularListo(new Date(), 6);

      Store.addOrden({
        id: uid('ord'),
        clienteId: cliente.id,
        clienteCodigo: cliente.codigo,
        servicioN: 1,
        codigoServicio: `${cliente.codigo}-S01`,
        cliente: { nombre: d.nombre, telefono: d.tel, email: d.email },
        items,
        pesoTotal: peso,
        prendas,
        subtotal,
        descuento: 0,
        total: redondear(subtotal + (d.envio || 0)),
        ingreso: ingreso.toISOString(),
        proceso: 'normal',
        procesoNombre: 'Normal · 24 horas',
        recojoEn: recojo.toISOString(),
        formaPago: 'Efectivo',
        notas: '',
        entrega: {
          tipo: d.direccion ? 'domicilio' : 'tienda',
          direccion: d.direccion || '',
          costo: d.envio || 0
        },
        listoEn: d.estado === 'recibido' ? null : new Date(ingreso.getTime() + 6 * 3600 * 1000).toISOString(),
        entregadoEn: d.estado === 'entregado' ? new Date(ingreso.getTime() + 26 * 3600 * 1000).toISOString() : null,
        recordatorioEn: d.estado === 'listo' || d.estado === 'almacen' ? proximoRecordatorio(new Date()).toISOString() : null,
        ultimoAvisoEn: null,
        almacen: d.almacen ? { codigo: d.almacen, nota: '', desde: new Date(ingreso.getTime() + 8 * 3600 * 1000).toISOString() } : null,
        estado: d.estado,
        operador: 'Mili Rojas'
      });
    });

    actualizarCodigoCliente();
    refrescarResumen();
    renderOrdenes();
    renderClientes();
    renderResumen();
    renderBanner();
    toast('Órdenes de ejemplo cargadas');
  }

  /* ------------------------------ Eventos ------------------------------- */

  function conectarEventos() {
    $('#formLogin').addEventListener('submit', iniciarSesion);
    $$('[data-demo]').forEach((boton) => {
      boton.addEventListener('click', () => {
        $('#usuario').value = boton.dataset.demo;
        $('#pin').value = boton.dataset.demo === 'mili' ? '1234' : '2024';
        $('#usuario').focus();
      });
    });

    $('#btnSalir').addEventListener('click', cerrarSesion);
    $('#btnDatos').addEventListener('click', abrirDatos);
    $('#btnVerAvisos').addEventListener('click', abrirModalAvisos);
    $('#modalCerrar').addEventListener('click', cerrarModal);

    // Panel de precios
    $('#btnPrecios').addEventListener('click', abrirPrecios);
    $('#cerrarPrecios').addEventListener('click', cerrarPrecios);
    $('#guardarPrecios').addEventListener('click', guardarPrecios);
    $('#restablecerPrecios').addEventListener('click', restablecerPrecios);
    $('#buscarPrecio').addEventListener('input', renderPrecios);

    $('#panelPrecios').addEventListener('click', (evento) => {
      if (evento.target.closest('[data-cerrar-panel]')) cerrarPrecios();
    });

    $('#listaPrecios').addEventListener('input', (evento) => {
      const campo = evento.target.closest('[data-precio]');
      if (!campo || !borradorPrecios) return;
      borradorPrecios[campo.dataset.precio] = campo.value;
    });

    $$('.tab').forEach((tab) => tab.addEventListener('click', () => cambiarVista(tab.dataset.vista)));

    // Catálogo
    $('#categorias').addEventListener('click', (evento) => {
      const chip = evento.target.closest('[data-categoria]');
      if (!chip) return;
      estado.categoria = chip.dataset.categoria;
      renderCatalogo();
    });

    $('#catalogo').addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-servicio]');
      if (boton) agregarServicio(boton.dataset.servicio);
    });

    // Ítems
    $('#items').addEventListener('input', (evento) => {
      const campo = evento.target.closest('[data-campo]');
      if (!campo) return;
      const fila = campo.closest('.item');
      const item = estado.items.find((i) => i.key === fila.dataset.key);
      if (!item) return;
      item[campo.dataset.campo] = campo.value;
      refrescarSubtotales();
      refrescarResumen();
      const nota = fila.querySelector('.item-note');
      if (nota) nota.remove();
      if (item.tipo === 'peso' && item.minPeso && parseNum(item.cantidad) > 0 && parseNum(item.cantidad) < item.minPeso) {
        fila.insertAdjacentHTML('beforeend', `<p class="item-note">Se aplica el mínimo de ${item.minPeso} kg para este servicio.</p>`);
      }
    });

    $('#items').addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-accion="quitar"]');
      if (!boton) return;
      const fila = boton.closest('.item');
      estado.items = estado.items.filter((i) => i.key !== fila.dataset.key);
      renderItems();
      refrescarResumen();
    });

    // Cliente
    let temporizador;
    $('#cliTelefono').addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(buscarCliente, 350);
    });
    $('#cliNombre').addEventListener('input', actualizarAviso);

    // Recojo y entrega
    $('#proceso').addEventListener('change', sugerirRecojo);
    $('#recojo').addEventListener('change', () => {
      estado.recojoManual = true;
      actualizarAviso();
      refrescarResumen();
    });
    $('#tipoEntrega').addEventListener('change', actualizarEntrega);
    $('#costoEnvio').addEventListener('input', refrescarResumen);
    $('#direccionEntrega').addEventListener('input', actualizarAviso);
    $('#descuento').addEventListener('input', refrescarResumen);
    $('#descuento').addEventListener('blur', () => {
      const totales = calcularTotales();
      if (parseNum($('#descuento').value) > totales.subtotal) {
        $('#descuento').value = totales.subtotal.toFixed(2);
        refrescarResumen();
      }
    });

    $('#btnRegistrar').addEventListener('click', () => registrar(true));
    $('#btnRegistrarSin').addEventListener('click', () => registrar(false));

    // Órdenes
    $('#buscarOrden').addEventListener('input', renderOrdenes);
    $('#filtroEstado').addEventListener('change', renderOrdenes);
    $('#btnEjemplos').addEventListener('click', cargarEjemplos);

    $('#tablaOrdenes').addEventListener('click', (evento) => {
      const ver = evento.target.closest('[data-ver]');
      const wa = evento.target.closest('[data-wa]');
      const salida = evento.target.closest('[data-salida]');
      const almacen = evento.target.closest('[data-almacen]');
      const listo = evento.target.closest('[data-listo]');
      const imprimir = evento.target.closest('[data-print]');
      if (ver) abrirDetalle(ver.dataset.ver);
      if (almacen) abrirAlmacen(almacen.dataset.almacen);
      if (listo) marcarListo(listo.dataset.listo, true, false);
      if (wa) {
        const orden = Store.getOrden(wa.dataset.wa);
        abrirWhatsApp(orden, tipoAvisoSugerido(orden));
      }
      if (salida) confirmarSalida(salida.dataset.salida);
      if (imprimir) imprimirOrden(Store.getOrden(imprimir.dataset.print));
    });

    $('#kanban').addEventListener('click', (evento) => {
      const listo = evento.target.closest('[data-listo]');
      const almacen = evento.target.closest('[data-almacen]');
      const salida = evento.target.closest('[data-salida]');
      const ver = evento.target.closest('[data-ver]');

      if (listo) marcarListo(listo.dataset.listo, true, false);
      if (almacen) abrirAlmacen(almacen.dataset.almacen);
      if (salida) confirmarSalida(salida.dataset.salida);
      if (ver) abrirDetalle(ver.dataset.ver);
    });

    $('#buscarCliente').addEventListener('input', renderClientes);

    $('#recojosHoy').addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-wa]');
      if (boton) abrirWhatsApp(Store.getOrden(boton.dataset.wa), 'listo');
    });

    // Modal
    $('#modal').addEventListener('click', (evento) => {
      const cerrar = evento.target.closest('[data-accion="cerrar"]');
      if (cerrar) {
        cerrarModal();
        return;
      }

      const listo = evento.target.closest('[data-listo]');
      if (listo) {
        marcarListo(listo.dataset.listo);
        return;
      }

      const salida = evento.target.closest('[data-salida]');
      if (salida) {
        confirmarSalida(salida.dataset.salida);
        return;
      }

      const verificar = evento.target.closest('[data-verificar]');
      if (verificar) {
        verificarCodigo(verificar.dataset.verificar);
        return;
      }

      const confirmar = evento.target.closest('[data-confirmar-salida]');
      if (confirmar) {
        ejecutarEntrega(confirmar.dataset.confirmarSalida);
        return;
      }

      const almacen = evento.target.closest('[data-almacen]');
      if (almacen) {
        abrirAlmacen(almacen.dataset.almacen);
        return;
      }

      const guardarAlmacenBtn = evento.target.closest('[data-guardar-almacen]');
      if (guardarAlmacenBtn) {
        guardarAlmacen(guardarAlmacenBtn.dataset.guardarAlmacen);
        return;
      }

      const quitarAlmacenBtn = evento.target.closest('[data-quitar-almacen]');
      if (quitarAlmacenBtn) {
        quitarAlmacen(quitarAlmacenBtn.dataset.quitarAlmacen);
        return;
      }

      const reenvio = evento.target.closest('[data-aviso]');
      if (reenvio) registrarReenvio(reenvio.dataset.aviso);

      const accion = evento.target.closest('[data-accion]');
      if (accion) {
        const id = accion.dataset.id;
        const orden = id ? Store.getOrden(id) : null;
        if (accion.dataset.accion === 'whatsapp' && orden) abrirWhatsApp(orden);
        if (accion.dataset.accion === 'copiar' && orden) copiarMensaje(orden);
        if (accion.dataset.accion === 'imprimir' && orden) imprimirOrden(orden);
        if (accion.dataset.accion === 'respaldo') exportarRespaldo();
        if (accion.dataset.accion === 'csv') exportarCSV();
        if (accion.dataset.accion === 'importar') $('#archivoRespaldo').click();
      }
      const cambio = evento.target.closest('[data-estado]');
      if (cambio) cambiarEstado(cambio.dataset.id, cambio.dataset.estado);
    });

    $('#modal').addEventListener('change', (evento) => {
      if (evento.target.id === 'archivoRespaldo' && evento.target.files[0]) {
        importarRespaldo(evento.target.files[0]);
      }
    });

    $('#modal').addEventListener('input', (evento) => {
      if (evento.target.id !== 'codigoVerifica') return;
      evento.target.classList.remove('invalid');
      $('#verificaMsg').textContent = 'Últimos 4 o 5 números del comprobante; también vale el código completo.';
      $('#verificaMsg').className = 'hint';
      $('#btnConfirmarEntrega').disabled = true;
    });

    $('#modal').addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' && evento.target.id === 'codigoVerifica') {
        evento.preventDefault();
        verificarCodigo(evento.target.dataset.orden);
      }
    });

    document.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape') return;
      if ($('#modal').classList.contains('is-open')) cerrarModal();
      else if ($('#panelPrecios').classList.contains('is-open')) cerrarPrecios();
    });
  }

  /* ------------------------------- Arranque ----------------------------- */

  function init() {
    $('#proceso').innerHTML = CONFIG.tiempos.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
    $('#proceso').value = 'normal';
    $('#formaPago').innerHTML = CONFIG.pagos.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    $('#filtroEstado').innerHTML =
      '<option value="">Todos los estados</option>' +
      CONFIG.estados.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('');

    conectarEventos();
    actualizarCodigoCliente();
    renderCategorias();
    renderCatalogo();
    renderItems();
    sugerirRecojo();
    refrescarResumen();
    actualizarFechas();
    restaurarSesion();

    if (!Store.disponible) {
      console.warn('Sin localStorage: los datos se perderán al cerrar la pestaña.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
