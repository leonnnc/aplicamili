/* ==========================================================================
   LavaMili · Configuración de Firebase
   --------------------------------------------------------------------------
   Valores del proyecto "aplicalav". Estas claves son públicas por diseño
   (viajan en el navegador); la seguridad real está en firestore.rules y en
   Firebase Authentication.

   Si dejas los campos vacíos, la app funciona en MODO LOCAL (localStorage).
   ========================================================================== */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCIZ50kwN3pgSO5guZxIQVAnDESRnsmCBU",
  authDomain: "aplicalav.firebaseapp.com",
  projectId: "aplicalav",
  storageBucket: "aplicalav.firebasestorage.app",
  messagingSenderId: "350151186821",
  appId: "1:350151186821:web:3752392eaf8af072c8ccec"
};

/* Identificador del negocio en Firestore. Todas las colecciones viven en
   negocios/{NEGOCIO_ID}/...  Si algún día abres otra sede, cambia este valor
   (o usa uno distinto por sucursal) sin tocar el resto del código. */
const NEGOCIO_ID = "lavamili";

/* true  → la app exige correo y contraseña de Firebase Authentication.
   false → acceso local con los usuarios de config.js (solo desarrollo). */
const FIREBASE_LOGIN_OBLIGATORIO = true;
