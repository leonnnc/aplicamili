/* ==========================================================================
   LavaMili · Sincronización con Firebase (Firestore + Authentication)
   --------------------------------------------------------------------------
   Estrategia: la app sigue leyendo y escribiendo en localStorage (rápido y
   funciona sin internet). Esta capa:
     1. autentica con Firebase Auth,
     2. escucha los cambios de Firestore y los deja en el espejo local,
     3. publica en Firestore cada escritura local.

   Si FIREBASE_CONFIG está vacío, todo queda en modo local y la app funciona
   igual que antes.
   ========================================================================== */

const Sync = (() => {
  const cfg = typeof FIREBASE_CONFIG !== "undefined" ? FIREBASE_CONFIG : {};
  const negocioId = typeof NEGOCIO_ID !== "undefined" && NEGOCIO_ID ? NEGOCIO_ID : "lavamili";
  const configurado = Boolean(cfg.apiKey && cfg.projectId && cfg.appId);

  const estado = { modo: configurado ? "nube" : "local", conectado: false, pendientes: 0, error: "" };

  const ultimo = { ordenes: new Map(), clientes: new Map(), precios: {} };
  const primerSnapshot = { ordenes: true, clientes: true, precios: true };

  const oyentesSesion = new Set();
  const oyentesDatos = new Set();
  const oyentesEstado = new Set();

  let auth = null;
  let db = null;
  let usuario = null;
  let cancelar = [];
  let cola = Promise.resolve();
  let iniciado = false;

  /* ------------------------------ Avisos ------------------------------- */

  function avisarSesion(perfil) {
    oyentesSesion.forEach((fn) => {
      try { fn(perfil); } catch (error) { console.warn("[sync] oyente de sesión falló", error); }
    });
  }

  function avisarDatos() {
    oyentesDatos.forEach((fn) => {
      try { fn(); } catch (error) { console.warn("[sync] oyente de datos falló", error); }
    });
  }

  function avisarEstado() {
    const vista = textoEstado();
    oyentesEstado.forEach((fn) => {
      try { fn(estado, vista); } catch (error) { console.warn("[sync] oyente de estado falló", error); }
    });
  }

  function textoEstado() {
    if (estado.modo === "local") return { texto: "Local", titulo: "Datos guardados solo en este navegador (Firebase no configurado)." };
    if (estado.modo === "error") return { texto: "Error de conexión", titulo: estado.error || "No se pudo iniciar Firebase." };
    if (estado.pendientes > 0) return { texto: "Sincronizando…", titulo: "Enviando cambios a Firestore." };
    if (!estado.conectado) return { texto: "Sin conexión", titulo: "Trabajando con los datos locales. Se sincronizará al recuperar internet." };
    return { texto: "En la nube", titulo: "Sincronizado con Firestore." };
  }

  /* ------------------------------ Utilidades ---------------------------- */

  const orden = (lista) => [...lista].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const mismos = (a, b) => JSON.stringify(orden(a)) === JSON.stringify(orden(b));

  const coleccion = (nombre) => db.collection("negocios").doc(negocioId).collection(nombre);
  const docPrecios = () => db.collection("negocios").doc(negocioId).collection("ajustes").doc("precios");

  function leerLocal(nombre) {
    if (nombre === "ordenes") return Store.getOrdenes();
    if (nombre === "clientes") return Store.getClientes();
    return [];
  }

  function encolar(tarea) {
    cola = cola.then(tarea).catch((error) => console.warn("[sync] tarea falló", error));
    return cola;
  }

  /* ------------------------------ Publicar ------------------------------ */

  function publicarLote(lote) {
    estado.pendientes += 1;
    avisarEstado();
    lote
      .commit()
      .catch((error) => {
        console.warn("[sync] no se pudo publicar", error);
        estado.error = "No se pudo escribir en Firestore: " + (error && error.message ? error.message : error);
      })
      .finally(() => {
        estado.pendientes = Math.max(0, estado.pendientes - 1);
        avisarEstado();
      });
  }

  function publicarColeccion(nombre, lista) {
    if (!db || !usuario) return;
    const mapa = new Map(lista.map((doc) => [doc.id, doc]));
    const previo = ultimo[nombre] || new Map();
    const ref = coleccion(nombre);
    const lote = db.batch();
    let cambios = 0;

    mapa.forEach((doc, id) => {
      const antes = previo.get(id);
      if (!antes || JSON.stringify(antes) !== JSON.stringify(doc)) {
        lote.set(ref.doc(id), doc);
        cambios += 1;
      }
    });

    previo.forEach((_, id) => {
      if (!mapa.has(id)) {
        lote.delete(ref.doc(id));
        cambios += 1;
      }
    });

    if (!cambios) return;
    ultimo[nombre] = mapa;
    publicarLote(lote);
  }

  function publicarPrecios(mapa) {
    if (!db || !usuario) return;
    if (JSON.stringify(ultimo.precios || {}) === JSON.stringify(mapa || {})) return;
    ultimo.precios = mapa || {};
    publicarLote(db.batch().set(docPrecios(), { mapa: mapa || {}, actualizado: new Date().toISOString() }));
  }

  /* ------------------------------ Escuchar ------------------------------ */

  function escucharColeccion(nombre) {
    const ref = coleccion(nombre);
    return ref.onSnapshot({ includeMetadataChanges: true }, (snap) => {
      estado.conectado = !snap.metadata.fromCache;
      const remotos = snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));

      if (primerSnapshot[nombre]) {
        primerSnapshot[nombre] = false;
        const locales = leerLocal(nombre);
        if (!remotos.length && locales.length) {
          // Primera vez: la nube está vacía y este navegador ya tiene datos.
          ultimo[nombre] = new Map();
          encolar(() => publicarColeccion(nombre, locales));
          avisarEstado();
          return;
        }
      }

      ultimo[nombre] = new Map(remotos.map((doc) => [doc.id, doc]));
      const previos = leerLocal(nombre);
      if (!mismos(previos, remotos)) {
        Store.aplicarRemoto({ [nombre]: remotos });
        avisarDatos();
      }
      avisarEstado();
    }, (error) => falloEscucha(error));
  }

  function escucharPrecios() {
    return docPrecios().onSnapshot({ includeMetadataChanges: true }, (snap) => {
      estado.conectado = !snap.metadata.fromCache;
      const remoto = (snap.exists && snap.data().mapa) || {};

      if (primerSnapshot.precios) {
        primerSnapshot.precios = false;
        const local = Store.getPrecios();
        if (!snap.exists && Object.keys(local).length) {
          ultimo.precios = {};
          encolar(() => publicarPrecios(local));
          avisarEstado();
          return;
        }
      }

      ultimo.precios = remoto;
      if (JSON.stringify(Store.getPrecios()) !== JSON.stringify(remoto)) {
        Store.aplicarRemoto({ precios: remoto });
        avisarDatos();
      }
      avisarEstado();
    }, (error) => falloEscucha(error));
  }

  function falloEscucha(error) {
    console.warn("[sync] escucha interrumpida", error);
    estado.conectado = false;
    estado.error = error && error.code === "permission-denied"
      ? "Tu usuario no tiene permiso sobre estos datos. Revisa las reglas de Firestore y el documento negocios/" + negocioId + "/usuarios/{uid}."
      : "Se perdió la conexión con Firestore.";
    avisarEstado();
  }

  function iniciarEscuchas() {
    detenerEscuchas();
    cancelar = [escucharColeccion("ordenes"), escucharColeccion("clientes"), escucharPrecios()];
  }

  function detenerEscuchas() {
    cancelar.forEach((fn) => {
      try { fn(); } catch (error) { /* nada */ }
    });
    cancelar = [];
    primerSnapshot.ordenes = primerSnapshot.clientes = primerSnapshot.precios = true;
  }

  /* ------------------------------- Sesión ------------------------------- */

  async function perfilDe(user) {
    if (!user) return null;
    let datos = null;
    try {
      const ref = db.collection("negocios").doc(negocioId).collection("usuarios").doc(user.uid);
      const snap = await ref.get({ source: "server" }).catch(() => ref.get());
      if (snap.exists) {
        datos = snap.data();
      } else {
        const nuevo = {
          nombre: user.displayName || String(user.email || "").split("@")[0],
          rol: "Operador",
          correo: user.email || "",
          creado: new Date().toISOString()
        };
        await ref.set(nuevo).catch((error) => console.warn("[sync] no se pudo crear el perfil", error));
        datos = nuevo;
      }
    } catch (error) {
      console.warn("[sync] sin perfil en Firestore", error);
    }

    return {
      uid: user.uid,
      usuario: user.email || user.uid,
      nombre: (datos && datos.nombre) || user.displayName || String(user.email || "").split("@")[0],
      rol: (datos && datos.rol) || "Operador"
    };
  }

  function traducirError(error) {
    const codigo = (error && error.code) || "";
    const mensajes = {
      "auth/invalid-email": "El correo no tiene un formato válido.",
      "auth/missing-password": "Escribe tu contraseña.",
      "auth/wrong-password": "Correo o contraseña incorrectos.",
      "auth/invalid-credential": "Correo o contraseña incorrectos.",
      "auth/invalid-login-credentials": "Correo o contraseña incorrectos.",
      "auth/user-not-found": "Correo o contraseña incorrectos.",
      "auth/user-disabled": "Esta cuenta está deshabilitada.",
      "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
      "auth/network-request-failed": "Sin conexión. Revisa tu internet e inténtalo otra vez.",
      "auth/operation-not-allowed": "El acceso con correo y contraseña no está habilitado en Firebase."
    };
    if (mensajes[codigo]) return mensajes[codigo];
    if (error && error.message) return error.message;
    return "No se pudo iniciar sesión.";
  }

  async function entrar(correo, clave) {
    if (!configurado) throw new Error("Firebase no está configurado.");
    if (!auth) throw new Error("Firebase todavía no terminó de inicializar.");
    try {
      const credencial = await auth.signInWithEmailAndPassword(String(correo || "").trim(), String(clave || ""));
      return await perfilDe(credencial.user);
    } catch (error) {
      const traducido = new Error(traducirError(error));
      traducido.code = error && error.code;
      throw traducido;
    }
  }

  async function salir() {
    detenerEscuchas();
    if (auth) {
      try { await auth.signOut(); } catch (error) { console.warn("[sync] no se pudo cerrar sesión", error); }
    }
    usuario = null;
    estado.conectado = false;
    avisarEstado();
  }

  /* ------------------------------- Arranque ----------------------------- */

  async function iniciar() {
    if (iniciado) return estado;
    iniciado = true;

    if (!configurado) {
      estado.modo = "local";
      avisarEstado();
      return estado;
    }

    if (typeof firebase === "undefined") {
      estado.modo = "error";
      estado.error = "No se pudieron cargar los SDK de Firebase (revisa tu conexión o los <script> del index.html).";
      console.error("[sync]", estado.error);
      avisarEstado();
      return estado;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      auth = firebase.auth();
      db = firebase.firestore();

      try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (error) { /* usa la de por defecto */ }

      try {
        await db.enableIndexedDbPersistence();
      } catch (error) {
        if (error.code === "failed-precondition") {
          console.warn("[sync] Hay varias pestañas abiertas; la caché offline queda en la primera.");
        } else if (error.code !== "unimplemented") {
          console.warn("[sync] Sin caché offline de Firestore", error);
        }
      }

      Store.alEscribir((clave, valor) => {
        if (!usuario) return;
        if (clave === Store.KEYS.ordenes) encolar(() => publicarColeccion("ordenes", valor));
        else if (clave === Store.KEYS.clientes) encolar(() => publicarColeccion("clientes", valor));
        else if (clave === Store.KEYS.precios) encolar(() => publicarPrecios(valor));
      });

      auth.onAuthStateChanged(async (user) => {
        usuario = user;
        if (!user) {
          detenerEscuchas();
          estado.conectado = false;
          avisarEstado();
          return;
        }
        const perfil = await perfilDe(user);
        iniciarEscuchas();
        avisarEstado();
        avisarSesion(perfil);
      });

      estado.modo = "nube";
      avisarEstado();
    } catch (error) {
      estado.modo = "error";
      estado.error = error && error.message ? error.message : String(error);
      console.error("[sync] no se pudo iniciar Firebase", error);
      avisarEstado();
    }

    return estado;
  }

  return {
    hayNube: configurado,
    estado,
    iniciar,
    entrar,
    salir,
    onSesion: (fn) => { oyentesSesion.add(fn); return () => oyentesSesion.delete(fn); },
    onDatos: (fn) => { oyentesDatos.add(fn); return () => oyentesDatos.delete(fn); },
    onEstado: (fn) => { oyentesEstado.add(fn); return () => oyentesEstado.delete(fn); }
  };
})();
