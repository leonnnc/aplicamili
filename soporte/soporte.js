/* ==========================================================================
   Panel interno de soporte
   --------------------------------------------------------------------------
   Lee los tickets que los equipos dejan en negocios/{NEGOCIO_ID}/ajustes/tickets.
   Funciona de dos maneras:
   · nube  → con una cuenta de Firebase que sea miembro del negocio.
   · local → sin sesión, muestra solo los tickets guardados en este navegador.
   ========================================================================== */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const CLAVE_LOCAL = 'lavamili.v1.tickets';

  let db = null;
  let auth = null;
  let cancelar = null;
  let tickets = [];
  let modo = 'nube';
  let seleccionado = null;
  let filtros = { texto: '', estado: 'todos', prioridad: 'todas' };

  /* ----------------------------- utilidades ----------------------------- */

  const esc = (texto) =>
    String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const aFecha = (iso) => {
    const f = new Date(iso);
    return Number.isFinite(f.getTime()) ? f : null;
  };

  const fechaCorta = (iso) => {
    const f = aFecha(iso);
    if (!f) return '—';
    return f.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) + ' · ' +
      f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  };

  const horasDesde = (iso) => {
    const f = aFecha(iso);
    return f ? (Date.now() - f.getTime()) / 36e5 : 0;
  };

  let temporizador = null;
  function aviso(texto) {
    const caja = $('#aviso');
    caja.textContent = texto;
    caja.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { caja.hidden = true; }, 3200);
  }

  /* ------------------------------- datos -------------------------------- */

  function refTickets() {
    return db.collection('negocios').doc(NEGOCIO_ID).collection('ajustes').doc('tickets');
  }

  function suscribir() {
    if (cancelar) cancelar();
    cancelar = refTickets().onSnapshot(
      (snap) => {
        const crudo = snap.exists ? snap.data().datos : [];
        tickets = (Array.isArray(crudo) ? crudo : []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
        pintar();
      },
      (error) => {
        if (error.code === 'permission-denied') {
          aviso('Tu cuenta no tiene permiso sobre este negocio. Revisa firestore.rules.');
        } else {
          aviso('No se pudieron leer los tickets: ' + error.message);
        }
      }
    );
  }

  function leerLocal() {
    try {
      const crudo = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '[]');
      tickets = (Array.isArray(crudo) ? crudo : []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    } catch (error) {
      tickets = [];
    }
    pintar();
  }

  async function escribirTicket(id, cambios) {
    if (modo !== 'nube') throw new Error('En modo local no se puede responder.');
    const ref = refTickets();
    const snap = await ref.get();
    const datos = snap.exists && Array.isArray(snap.data().datos) ? snap.data().datos.slice() : [];
    const i = datos.findIndex((t) => t.id === id);
    if (i < 0) throw new Error('El ticket ya no existe.');
    datos[i] = { ...datos[i], ...cambios };
    await ref.set({ datos, actualizado: new Date().toISOString() }, { merge: true });
  }

  /* ------------------------------- alertas ------------------------------- */

  function calcularAlertas() {
    const abiertos = tickets.filter((t) => t.estado !== 'cerrada');
    const salida = [];

    const urgentes = abiertos.filter((t) => t.prioridad === 'Urgente');
    if (urgentes.length) {
      salida.push(`<b>${urgentes.length}</b> ${urgentes.length === 1 ? 'ticket urgente sigue' : 'tickets urgentes siguen'} sin cerrar.`);
    }

    const sinRespuesta = abiertos.filter((t) => !(t.respuestas || []).length && horasDesde(t.fecha) > 24);
    if (sinRespuesta.length) {
      salida.push(`<b>${sinRespuesta.length}</b> sin ninguna respuesta después de 24 horas.`);
    }

    const viejos = abiertos.filter((t) => horasDesde(t.fecha) > 72);
    if (viejos.length) {
      salida.push(`<b>${viejos.length}</b> con más de 3 días abiertos.`);
    }

    const porAutor = {};
    abiertos.forEach((t) => { porAutor[t.autor] = (porAutor[t.autor] || 0) + 1; });
    const insistente = Object.entries(porAutor).find(([, n]) => n >= 3);
    if (insistente) {
      salida.push(`<b>${esc(insistente[1])}</b> tickets abiertos de ${esc(insistente[0])}: puede ser un problema recurrente.`);
    }

    return salida;
  }

  /* -------------------------------- pintar ------------------------------- */

  function etiquetaEstado(estado) {
    const clase = String(estado || 'abierta').replace(' ', '-');
    const nombre = estado === 'en proceso' ? 'En proceso' : estado === 'cerrada' ? 'Cerrada' : 'Abierta';
    return `<span class="etiqueta e-${clase}">${nombre}</span>`;
  }

  function etiquetaPrioridad(prioridad) {
    const p = String(prioridad || 'Normal');
    return `<span class="etiqueta p-${p.toLowerCase()}">${esc(p)}</span>`;
  }

  function pintar() {
    const abiertos = tickets.filter((t) => t.estado === 'abierta').length;
    const proceso = tickets.filter((t) => t.estado === 'en proceso').length;
    const cerrados = tickets.filter((t) => t.estado === 'cerrada').length;
    const urgentes = tickets.filter((t) => t.estado !== 'cerrada' && t.prioridad === 'Urgente').length;

    $('#kpis').innerHTML = `
      <div class="kpi abierto"><span>Abiertos</span><strong>${abiertos}</strong></div>
      <div class="kpi proceso"><span>En proceso</span><strong>${proceso}</strong></div>
      <div class="kpi cerrado"><span>Cerrados</span><strong>${cerrados}</strong></div>
      <div class="kpi urgente"><span>Urgentes</span><strong>${urgentes}</strong></div>`;

    const alertas = calcularAlertas();
    const cajaAlertas = $('#alertas');
    cajaAlertas.hidden = alertas.length === 0;
    cajaAlertas.innerHTML = alertas
      .map((a) => `<div class="alerta"><span class="punto"></span><div>${a}</div></div>`)
      .join('');

    const texto = filtros.texto.trim().toLowerCase();
    const lista = tickets.filter((t) => {
      if (filtros.estado !== 'todos' && t.estado !== filtros.estado) return false;
      if (filtros.prioridad !== 'todas' && t.prioridad !== filtros.prioridad) return false;
      if (!texto) return true;
      return `${t.asunto} ${t.autor} ${t.mensaje} ${t.categoria}`.toLowerCase().includes(texto);
    });

    $('#lista').innerHTML = lista.length
      ? lista
          .map(
            (t) => `<button class="ticket${seleccionado === t.id ? ' sel' : ''}" type="button" data-id="${esc(t.id)}">
              <span class="ticket-info">
                <strong>${esc(t.asunto)}</strong>
                <span>${esc(t.autor)} · ${esc(t.rol || '')} · ${fechaCorta(t.fecha)} · ${esc(t.categoria)}</span>
                <p>${esc(t.mensaje)}</p>
              </span>
              <span class="ticket-lado">
                ${etiquetaPrioridad(t.prioridad)}
                ${etiquetaEstado(t.estado)}
              </span>
            </button>`
          )
          .join('')
      : `<div class="vacio">${tickets.length ? 'Ningún ticket coincide con el filtro.' : 'Todavía no hay tickets.'}</div>`;

    if (seleccionado) {
      const actual = tickets.find((t) => t.id === seleccionado);
      if (actual) pintarDetalle(actual); else cerrarDetalle();
    }
  }

  function pintarDetalle(t) {
    $('#detalle').hidden = false;
    $('#detalle').classList.add('abierto');
    $('#detalle').setAttribute('aria-hidden', 'false');
    $('#detalleMeta').textContent = `${t.categoria} · ${t.prioridad} · ${fechaCorta(t.fecha)}`;
    $('#detalleTitulo').textContent = t.asunto;

    const mensajes = [`<div class="mensaje"><header><strong>${esc(t.autor)}</strong><span>${fechaCorta(t.fecha)}</span></header><p>${esc(t.mensaje)}</p></div>`];
    (t.respuestas || []).forEach((r) => {
      mensajes.push(
        `<div class="mensaje mio"><header><strong>${esc(r.autor)}</strong><span>${fechaCorta(r.fecha)}</span></header><p>${esc(r.texto)}</p></div>`
      );
    });
    $('#hilo').innerHTML = mensajes.join('');

    const cerrado = t.estado === 'cerrada';
    // En modo local solo se consulta: no hay dónde escribir la respuesta.
    $('#formRespuesta').hidden = modo === 'local';
    $('#textoRespuesta').disabled = cerrado;
    $('#formRespuesta').querySelector('button[type="submit"]').disabled = cerrado;
    $('#btnCerrarTicket').disabled = cerrado;
    $('#btnReabrir').disabled = !cerrado;
    $('#textoRespuesta').value = '';
  }

  function cerrarDetalle() {
    seleccionado = null;
    $('#detalle').classList.remove('abierto');
    $('#detalle').setAttribute('aria-hidden', 'true');
    setTimeout(() => { if (!seleccionado) $('#detalle').hidden = true; }, 280);
    pintar();
  }

  /* ------------------------------- acciones ------------------------------ */

  async function responder(id) {
    const t = tickets.find((x) => x.id === id);
    const texto = $('#textoRespuesta').value.trim();
    if (!texto) {
      $('#errorDetalle').textContent = 'Escribe la respuesta.';
      return;
    }
    const respuestas = (t.respuestas || []).concat({
      autor: (auth && auth.currentUser && auth.currentUser.email) || 'Soporte',
      rol: 'Soporte',
      texto,
      fecha: new Date().toISOString()
    });
    try {
      await escribirTicket(id, { respuestas, estado: 'en proceso' });
      $('#errorDetalle').textContent = '';
      $('#textoRespuesta').value = '';
      aviso('Respuesta enviada');
    } catch (error) {
      $('#errorDetalle').textContent = error.message;
    }
  }

  async function cambiarEstado(id, estado) {
    try {
      await escribirTicket(id, { estado });
      aviso(estado === 'cerrada' ? 'Ticket cerrado' : 'Ticket reabierto');
    } catch (error) {
      $('#errorDetalle').textContent = error.message;
    }
  }

  /* -------------------------------- sesión ------------------------------- */

  function mostrarPanel() {
    $('#acceso').hidden = true;
    $('#panel').hidden = false;
    const correo = (auth && auth.currentUser && auth.currentUser.email) || '';
    $('#chipSesion').textContent = modo === 'local' ? 'Modo local · este equipo' : correo;
    $('#contexto').textContent = modo === 'local'
      ? 'Solo los tickets guardados en este navegador'
      : `Negocio ${NEGOCIO_ID} · en vivo`;
  }

  function entrarLocal() {
    modo = 'local';
    mostrarPanel();
    leerLocal();
  }

  function iniciarFirebase() {
    if (typeof firebase === 'undefined' || !FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) return false;
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      // Cache offline, igual que la app.
      if (typeof db.enableIndexedDbPersistence === 'function') {
        db.enableIndexedDbPersistence().catch(() => {});
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /* -------------------------------- eventos ------------------------------ */

  function conectar() {
    $('#formAcceso').addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const correo = $('#correo').value.trim();
      const clave = $('#clave').value;
      $('#errorAcceso').textContent = '';
      $('#btnEntrar').disabled = true;
      try {
        await auth.signInWithEmailAndPassword(correo, clave);
      } catch (error) {
        const mapa = {
          'auth/invalid-credential': 'Correo o contraseña incorrectos.',
          'auth/wrong-password': 'Correo o contraseña incorrectos.',
          'auth/user-not-found': 'No existe una cuenta con ese correo.',
          'auth/too-many-requests': 'Demasiados intentos. Espera un momento.'
        };
        $('#errorAcceso').textContent = mapa[error.code] || error.message;
      } finally {
        $('#btnEntrar').disabled = false;
      }
    });

    $('#btnLocal').addEventListener('click', entrarLocal);

    $('#btnSalir').addEventListener('click', async () => {
      if (cancelar) cancelar();
      cancelar = null;
      if (modo === 'nube' && auth) await auth.signOut();
      tickets = [];
      seleccionado = null;
      $('#panel').hidden = true;
      $('#acceso').hidden = false;
      $('#detalle').hidden = true;
      $('#clave').value = '';
    });

    $('#btnRecargar').addEventListener('click', () => {
      if (modo === 'local') { leerLocal(); aviso('Tickets de este equipo actualizados'); }
      else { suscribir(); aviso('Reconectando…'); }
    });

    $('#buscar').addEventListener('input', (e) => { filtros.texto = e.target.value; pintar(); });
    $('#filtroEstado').addEventListener('change', (e) => { filtros.estado = e.target.value; pintar(); });
    $('#filtroPrioridad').addEventListener('change', (e) => { filtros.prioridad = e.target.value; pintar(); });

    $('#lista').addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-id]');
      if (!boton) return;
      seleccionado = boton.dataset.id;
      const t = tickets.find((x) => x.id === seleccionado);
      if (t) { pintar(); pintarDetalle(t); }
    });

    $('#cerrarDetalle').addEventListener('click', cerrarDetalle);
    $('#btnCerrarTicket').addEventListener('click', () => seleccionado && cambiarEstado(seleccionado, 'cerrada'));
    $('#btnReabrir').addEventListener('click', () => seleccionado && cambiarEstado(seleccionado, 'abierta'));
    $('#formRespuesta').addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (seleccionado) responder(seleccionado);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && seleccionado) cerrarDetalle();
    });
  }

  /* -------------------------------- arranque ----------------------------- */

  function arrancar() {
    conectar();

    const version = document.querySelector('#versionSoporte');
    if (version) version.textContent = 'v' + ((typeof CONFIG !== 'undefined' && CONFIG.version) || '0.01');

    if (!iniciarFirebase()) {
      $('#errorAcceso').textContent = 'No se pudo cargar Firebase. Puedes ver los tickets de este equipo.';
      return;
    }

    auth.onAuthStateChanged((usuario) => {
      if (usuario) {
        modo = 'nube';
        mostrarPanel();
        suscribir();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
