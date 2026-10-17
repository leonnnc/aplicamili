/* ==========================================================================
   LavaMili · Persistencia local
   Guarda órdenes y clientes en localStorage. Si el navegador lo bloquea,
   cae a memoria para que la sesión siga funcionando.
   ========================================================================== */

const Store = (() => {
  const NS = 'lavamili.v1';
  const KEYS = {
    ordenes: `${NS}.ordenes`,
    clientes: `${NS}.clientes`,
    precios: `${NS}.precios`
  };

  const memoria = {};
  let disponible = true;

  /* Avisos de escritura: la capa de sincronización (sync.js) los escucha para
     publicar los cambios en Firestore. `silencio` evita re-publicar lo que
     llega desde la nube. */
  const oyentes = new Set();
  let silencio = false;

  /** Id único incluso si se crean varios registros en el mismo milisegundo. */
  const nuevoId = (prefijo) => `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  try {
    const prueba = `${NS}.test`;
    localStorage.setItem(prueba, '1');
    localStorage.removeItem(prueba);
  } catch (error) {
    disponible = false;
  }

  function leer(clave, porDefecto) {
    try {
      const crudo = disponible ? localStorage.getItem(clave) : memoria[clave];
      if (!crudo) return porDefecto;
      const datos = JSON.parse(crudo);
      return datos ?? porDefecto;
    } catch (error) {
      console.warn('No se pudo leer', clave, error);
      return porDefecto;
    }
  }

  function escribir(clave, valor) {
    const crudo = JSON.stringify(valor);
    try {
      if (disponible) localStorage.setItem(clave, crudo);
      else memoria[clave] = crudo;
    } catch (error) {
      disponible = false;
      memoria[clave] = crudo;
      console.warn('Almacenamiento lleno o bloqueado, usando memoria', error);
    }
    if (!silencio) {
      oyentes.forEach((fn) => {
        try {
          fn(clave, valor);
        } catch (error) {
          console.warn('Oyente de escritura falló', error);
        }
      });
    }
  }

  /** Registra un callback que se dispara en cada escritura local. */
  function alEscribir(fn) {
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  }

  /** Escribe el espejo local con datos que vienen de la nube, sin re-emitir. */
  function aplicarRemoto(datos) {
    silencio = true;
    try {
      if (Array.isArray(datos.ordenes)) escribir(KEYS.ordenes, datos.ordenes);
      if (Array.isArray(datos.clientes)) escribir(KEYS.clientes, datos.clientes);
      if (datos.precios && typeof datos.precios === 'object') escribir(KEYS.precios, datos.precios);
    } finally {
      silencio = false;
    }
  }

  /* ------------------------------ Órdenes ------------------------------ */

  function getOrdenes() {
    const lista = leer(KEYS.ordenes, []);
    return Array.isArray(lista) ? lista : [];
  }

  function setOrdenes(lista) {
    escribir(KEYS.ordenes, lista);
  }

  function siguienteCodigo(prefijo, lista, anio) {
    const patron = new RegExp(`^${prefijo}-${anio}-(\\d+)$`);
    const max = lista.reduce((acc, item) => {
      const match = patron.exec(item.codigo || '');
      return match ? Math.max(acc, Number(match[1])) : acc;
    }, 0);
    return `${prefijo}-${anio}-${String(max + 1).padStart(4, '0')}`;
  }

  function nextOrderCode(fecha = new Date()) {
    return siguienteCodigo('OT', getOrdenes(), fecha.getFullYear());
  }

  function addOrden(orden) {
    const lista = getOrdenes();
    const nueva = {
      ...orden,
      codigo: orden.codigo || siguienteCodigo('OT', lista, new Date(orden.ingreso || Date.now()).getFullYear())
    };
    lista.push(nueva);
    setOrdenes(lista);
    return nueva;
  }

  function updateOrden(id, cambios) {
    const lista = getOrdenes();
    const indice = lista.findIndex((o) => o.id === id);
    if (indice === -1) return null;
    lista[indice] = { ...lista[indice], ...cambios };
    setOrdenes(lista);
    return lista[indice];
  }

  function getOrden(id) {
    return getOrdenes().find((o) => o.id === id) || null;
  }

  /* ------------------------------ Clientes ----------------------------- */

  function getClientes() {
    const lista = leer(KEYS.clientes, []);
    return Array.isArray(lista) ? lista : [];
  }

  function setClientes(lista) {
    escribir(KEYS.clientes, lista);
  }

  function claveTelefono(telefono) {
    let digitos = String(telefono || '').replace(/\D/g, '');
    if (digitos.length > 9 && digitos.startsWith('51')) digitos = digitos.slice(2);
    return digitos.slice(-9);
  }

  function buscarPorTelefono(telefono) {
    const clave = claveTelefono(telefono);
    if (clave.length < 6) return null;
    return getClientes().find((c) => c.clave === clave) || null;
  }

  function nextClienteCode() {
    const max = getClientes().reduce((acc, c) => {
      const match = /^CLI-(\d+)$/.exec(c.codigo || '');
      return match ? Math.max(acc, Number(match[1])) : acc;
    }, 0);
    return `CLI-${String(max + 1).padStart(4, '0')}`;
  }

  /**
   * Crea o actualiza un cliente por teléfono. Devuelve el cliente guardado.
   */
  function upsertCliente({ telefono, nombre, email }) {
    const lista = getClientes();
    const clave = claveTelefono(telefono);
    const indice = lista.findIndex((c) => c.clave === clave);
    const ahora = new Date().toISOString();

    if (indice >= 0) {
      const actual = lista[indice];
      lista[indice] = {
        ...actual,
        codigo: actual.codigo || nextClienteCode(),
        nombre: nombre || actual.nombre,
        email: email || actual.email,
        telefono: telefono || actual.telefono,
        actualizado: ahora
      };
      setClientes(lista);
      return lista[indice];
    }

    const nuevo = {
      id: nuevoId('cli'),
      codigo: nextClienteCode(),
      clave,
      nombre: nombre || 'Cliente',
      telefono: telefono || '',
      email: email || '',
      creado: ahora,
      actualizado: ahora
    };
    lista.push(nuevo);
    setClientes(lista);
    return nuevo;
  }

  /**
   * Correlativo de servicios del cliente (1, 2, 3…).
   * El código de cliente nunca cambia; cada servicio suma uno nuevo.
   */
  function siguienteServicio(clienteId, clienteCodigo) {
    const previos = getOrdenes().filter((o) => o.clienteId === clienteId || o.clienteCodigo === clienteCodigo);
    const max = previos.reduce((acc, o) => Math.max(acc, Number(o.servicioN) || 0), 0);
    return Math.max(max, previos.length) + 1;
  }

  function statsCliente(cliente) {
    const ordenes = getOrdenes().filter((o) => o.clienteId === cliente.id || o.clienteCodigo === cliente.codigo);
    return {
      ordenes: ordenes.length,
      total: ordenes.reduce((acc, o) => acc + (Number(o.total) || 0), 0),
      ultima: ordenes.reduce((acc, o) => (o.ingreso > (acc || '') ? o.ingreso : acc), '')
    };
  }

  /* ------------------------------- Precios ------------------------------ */

  /** Tarifas personalizadas: { idServicio: precio }. Vacío = precios de fábrica. */
  function getPrecios() {
    const datos = leer(KEYS.precios, {});
    return datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {};
  }

  function setPrecios(mapa) {
    escribir(KEYS.precios, mapa && typeof mapa === 'object' ? mapa : {});
  }

  function snapshot() {
    return { generado: new Date().toISOString(), ordenes: getOrdenes(), clientes: getClientes(), precios: getPrecios() };
  }

  function reemplazarTodo({ ordenes, clientes, precios }) {
    if (Array.isArray(ordenes)) setOrdenes(ordenes);
    if (Array.isArray(clientes)) setClientes(clientes);
    if (precios && typeof precios === 'object') setPrecios(precios);
  }

  return {
    disponible,
    KEYS,
    alEscribir,
    aplicarRemoto,
    getOrdenes,
    setOrdenes,
    getOrden,
    addOrden,
    updateOrden,
    nextOrderCode,
    getClientes,
    setClientes,
    buscarPorTelefono,
    upsertCliente,
    nextClienteCode,
    siguienteServicio,
    statsCliente,
    getPrecios,
    setPrecios,
    claveTelefono,
    snapshot,
    reemplazarTodo
  };
})();
