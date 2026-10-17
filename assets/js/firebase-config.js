/* ==========================================================================
   LavaMili · Configuración de Firebase
   --------------------------------------------------------------------------
   Pega aquí los valores de tu proyecto. Los encuentras en:
   Consola de Firebase → ⚙ Configuración del proyecto → Tus apps → SDK setup.

   Mientras estos campos estén vacíos la app funciona en MODO LOCAL
   (localStorage, como antes) y no intenta conectarse a la nube.
   ========================================================================== */

const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

/* Identificador del negocio en Firestore. Todas las colecciones viven en
   negocios/{NEGOCIO_ID}/...  Si algún día abres otra sede, cambia este valor
   (o usa uno distinto por sucursal) sin tocar el resto del código. */
const NEGOCIO_ID = "lavamili";

/* true  → la app exige correo y contraseña de Firebase Authentication.
   false → acceso local con los usuarios de config.js (solo desarrollo). */
const FIREBASE_LOGIN_OBLIGATORIO = true;
