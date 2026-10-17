# Conectar LavaMili a Firebase

Guía para crear el proyecto, pegar las credenciales y dejar la app sincronizando
entre computadora, tablet y celular. Tiempo estimado: 20–30 minutos.

> Mientras no completes los pasos 1–6, la app sigue funcionando en **modo local**
> (los datos quedan en el navegador). No se rompe nada.

---

## Qué se integró en el código

| Archivo | Rol |
|---|---|
| `assets/js/firebase-config.js` | Aquí pegas las credenciales. Vacío = modo local. |
| `assets/js/sync.js` | Autenticación, escucha de Firestore y publicación de cambios. |
| `assets/js/store.js` | Ahora avisa en cada escritura (`Store.alEscribir`) y acepta datos de la nube sin re-publicarlos (`Store.aplicarRemoto`). |
| `assets/js/app.js` | Login con Firebase Auth, refresco automático al llegar cambios y chip de estado en la barra superior. |
| `firestore.rules` | Reglas de seguridad para pegar en la consola. |

La app sigue leyendo de `localStorage` (rápido, funciona sin internet) y usa
Firestore como fuente compartida: cada cambio local se publica y cada cambio
remoto se refleja en el espejo local.

---

## Paso 1 · Crear el proyecto

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear proyecto** (o "Agregar proyecto").
3. Nombre: `lavamili` (el ID puede quedar como `lavamili-xxxxx`).
4. Google Analytics: puedes desactivarlo, no se usa en esta app.
5. Espera a que termine y pulsa **Continuar**.

## Paso 2 · Registrar la app web

1. En la pantalla del proyecto, pulsa el ícono **`</>`** (Web).
2. Apodo: `LavaMili Web`. **No** marques Firebase Hosting todavía.
3. Pulsa **Registrar app**. Firebase muestra un bloque `firebaseConfig`.
4. Copia esos valores (los usarás en el paso 6) y cierra el asistente.

## Paso 3 · Habilitar el login con correo y contraseña

1. Menú lateral → **Compilación → Authentication** → **Comenzar**.
2. Pestaña **Sign-in method** → habilita **Correo electrónico/contraseña** →
   **Guardar**.
3. Pestaña **Users** → **Add user**. Crea una cuenta por operador, por ejemplo:
   - `mili@lavamili.pe` con una contraseña temporal
   - `mostrador@lavamili.pe` con otra contraseña temporal

   Esas son las credenciales que se escribirán en la pantalla de acceso.
   Firebase no envía correos de verificación en este flujo; entrega la
   contraseña en persona y cámbiala desde la consola cuando haga falta.

## Paso 4 · Crear la base de datos Firestore

1. Menú lateral → **Compilación → Firestore Database** → **Crear base de datos**.
2. Ubicación: la más cercana a Perú (por ejemplo `southamerica-east1`).
   **Ojo:** la ubicación no se puede cambiar después.
3. Modo: **Producción** (las reglas del paso 5 bloquean el acceso público).
4. Cuando termine, ve a la pestaña **Reglas**.

## Paso 5 · Publicar las reglas de seguridad

1. Abre el archivo `firestore.rules` de este repo y copia todo su contenido.
2. Pégalo en el editor de **Reglas**, reemplazando lo que haya.
3. **Publicar**.

Sin este paso verás errores `permission-denied` y la app no podrá leer ni
escribir en la nube.

## Paso 6 · Pegar las credenciales en la app

Abre `assets/js/firebase-config.js` y completa:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "lavamili-xxxxx.firebaseapp.com",
  projectId: "lavamili-xxxxx",
  storageBucket: "lavamili-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

- `NEGOCIO_ID = "lavamili"` — cámbialo solo si abres otra sede con datos
  separados.
- `FIREBASE_LOGIN_OBLIGATORIO = true` — déjalo así; con `false` la app ignora
  Firebase Auth y usa los usuarios de `config.js` (solo desarrollo).

Guarda y recarga la app. El chip de la barra superior debe decir **En la nube**.

## Paso 7 · Primer acceso y perfil del operador

1. Entra con el correo y la contraseña creados en el paso 3.
2. En el primer acceso la app crea sola el documento
   `negocios/lavamili/usuarios/{uid}` con rol **Operador**.
3. Para que alguien sea **Administrador**: Firestore Database → esa colección →
   abre el documento y cambia `rol` a `Administrador`.

El nombre que aparece en la barra sale de ese documento; si quieres otro,
edítalo ahí.

## Paso 8 · Probar la sincronización

1. Abre la app en dos navegadores (o en la computadora y el celular).
2. Inicia sesión en ambos con el mismo u otro operador.
3. Registra una orden en uno. En el otro debe aparecer en pocos segundos.
4. Corta el internet del primero y registra otra orden: se guarda local, el chip
   pasa a **Sin conexión**, y al volver la conexión se publica sola.

---

## Migrar los datos que ya tienes

- **Automático:** el primer inicio de sesión en el equipo que ya tiene datos
  sube todo a Firestore, siempre que la nube esté vacía. Los demás equipos lo
  reciben al entrar.
- **Manual:** en la app → **Datos → Descargar respaldo (JSON)**. En el equipo
  nuevo → **Datos → Restaurar desde respaldo**. El contenido se publica solo.
- Si necesitas reiniciar la nube: borra las colecciones desde la consola y
  vuelve a entrar desde el equipo que tiene los datos correctos.

## Qué NO se sincroniza

- La **sesión**: cada equipo inicia sesión una vez (Firebase la recuerda).
- Los **usuarios y contraseñas**: se administran en la consola de Firebase.
- El **catálogo y los horarios** de `config.js`: son código, se cambian en el
  repo y se publican con el resto de la app.

## Publicar la app en Firebase Hosting (opcional)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # public: . , SPA: No, deploys automáticos: No
firebase deploy
```

En `firebase.json`, dentro de `hosting`, agrega los archivos que no deben
publicarse:

```json
"ignore": ["firebase.json", "**/.*", "**/node_modules/**", "_verificacion/**", "shots/**", "*.md", "firestore.rules"]
```

Quedará en `https://TU-PROYECTO.web.app`, con HTTPS y sin depender de tu
computadora.

## Seguridad: lo que debes saber

- La `apiKey` de Firebase **no es un secreto**: va en el navegador por diseño.
  La protección real son las reglas de Firestore más la autenticación.
- Quita los usuarios de prueba de `config.js` (`mili/1234`, `mostrador/2024`)
  cuando el login con Firebase ya funcione. Quedaron públicos en GitHub.
- Opcional recomendado: activa **App Check** (reCAPTCHA v3) en Firestore para
  que solo tu dominio pueda hablar con la base.

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| Chip dice **Error de conexión** | Config incompleta o SDK bloqueado | Revisa `firebase-config.js` y la consola del navegador (F12) |
| `permission-denied` al leer | Reglas no publicadas o falta el documento de operador | Publica `firestore.rules` y vuelve a iniciar sesión |
| `auth/operation-not-allowed` | Login por correo no habilitado | Paso 3 |
| `auth/invalid-credential` | Contraseña incorrecta o usuario inexistente | Restablece la contraseña desde la consola |
| Los cambios no se ven en el otro equipo | Un equipo está en modo local | Verifica el chip: debe decir **En la nube** |
| Aviso de "varias pestañas" en consola | Caché offline de Firestore en dos pestañas | Usa una sola pestaña por equipo; el modo local sigue funcionando |
| Chip **Sincronizando…** fijo | Sin salida a internet o reglas denegando escritura | Revisa la pestaña Network y las reglas |
