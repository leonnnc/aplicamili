/* ==========================================================================
   LavaMili · Configuración de Firebase
   --------------------------------------------------------------------------
   Valores del proyecto "aplicalav". Estas claves son públicas por diseño
   (viajan en el navegador); la seguridad real está en firestore.rules y en
   Firebase Authentication.

   Si dejas los campos vacíos, la app funciona en MODO LOCAL (localStorage).
   ========================================================================== */

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCIZ50kwN3pgSO5guZxIQVAnDESRnsmCBU',
  authDomain: 'aplicalav.firebaseapp.com',
  projectId: 'aplicalav',
  storageBucket: 'aplicalav.firebasestorage.app',
  messagingSenderId: '350151186821',
  appId: '1:350151186821:web:3752392eaf8af072c8ccec'
};

// Sede dentro de Firestore: negocios/{NEGOCIO_ID}/...
const NEGOCIO_ID = 'lavamili';

/* Control del acceso:
   true  → siempre correo + contraseña de Firebase (recomendado en producción).
   false → en este equipo (localhost / 127.0.0.1) acepta el usuario y PIN de
           desarrollo; en cualquier dominio publicado sigue exigiendo Firebase.
   Los PIN de prueba están en config.js (operadores) y deben borrarse antes
   de usar la app con clientes reales. */
const FIREBASE_LOGIN_OBLIGATORIO = false;
