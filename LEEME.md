# Stock Operativo v2 — CD Callao (Netlify)

Sitio con **dos páginas**:

| Página | Dirección | Quién la usa |
|---|---|---|
| Reporte (vendedores) | `https://TU-SITIO.netlify.app/` | Todos. Es el único link que se comparte. |
| Panel de carga | `https://TU-SITIO.netlify.app/admin` | Solo tú (pide clave). Subes el Excel y tienes la pestaña "Vista vendedores". |

Al subir el Excel en el panel, el navegador lee la hoja **"Stock Refer TOTAL"**, guarda los datos en Netlify y
los vendedores ven la información nueva al instante (su página también se actualiza sola cada 5 minutos).
Ya no hace falta generar un index.html, enviarlo por correo ni volver a subirlo a Netlify.

La versión anterior (tu sitio actual en Netlify y el artefacto) **no se toca**: esto es un sitio nuevo.

---

## Instalación (una sola vez, ~15 minutos)

> Netlify solo activa la parte de "guardar datos" (funciones) si el sitio se conecta desde GitHub.
> Arrastrar la carpeta a Netlify (como hacías antes) **no** sirve para esta versión.

### 1. Subir el proyecto a GitHub
1. Entra a <https://github.com> y crea una cuenta (puedes usar tu Gmail).
2. Botón **New** (nuevo repositorio) → nombre: `stock-operativo-v2` → **Private** → **Create repository**.
3. En la página del repositorio vacío, clic en **"uploading an existing file"**.
4. Descomprime el zip y **arrastra el contenido de la carpeta** (no la carpeta en sí):
   `public`, `netlify`, `netlify.toml`, `package.json`, `package-lock.json`, `LEEME.md`.
   (Usa Chrome o Edge: permiten arrastrar carpetas.)
5. Clic en **Commit changes**.

### 2. Crear el sitio en Netlify
1. Entra a <https://app.netlify.com> con tu usuario de siempre.
2. **Add new project → Import an existing project → GitHub** → autoriza → elige `stock-operativo-v2`.
3. No cambies nada de la configuración (se lee sola del archivo `netlify.toml`) → **Deploy**.

### 3. Poner tu clave de administrador
1. En el sitio nuevo: **Project configuration → Environment variables → Add a variable**.
2. Key: `ADMIN_PASSWORD` · Value: la clave que quieras (ej. una frase larga) → **Create variable**.
3. Ve a **Deploys → Trigger deploy → Deploy project** para que tome la clave.

### 4. (Opcional) Nombre bonito del link
**Project configuration → General → Change project name** → por ejemplo `stock-cd-callao`
→ el link queda `https://stock-cd-callao.netlify.app/`.

### 5. Primera carga
1. Abre `https://TU-SITIO.netlify.app/admin` → escribe tu clave.
2. Arrastra el Excel de proyección → en unos segundos verás "✓ Publicado".
3. Copia el **Link para vendedores** desde el mismo panel y compártelo.

---

## Rutina diaria (≈10 segundos)
1. Actualiza y **guarda** el Excel en Excel (para que los cálculos queden grabados).
2. Abre `…/admin` (guárdalo en favoritos; la sesión se recuerda mientras no cierres el navegador).
3. Arrastra el archivo. Listo.

---

## Preguntas frecuentes
- **¿Los vendedores pueden ver el panel?** El link que compartes no tiene ningún acceso al panel.
  Aunque alguien escribiera `/admin`, sin la clave no puede subir nada.
- **¿Cómo cambio la clave?** Cambia `ADMIN_PASSWORD` en Netlify y haz *Trigger deploy*.
- **¿Qué pasa si cambian columnas en el Excel?** Las columnas se buscan por su nombre de encabezado.
  Si falta alguna, el panel avisa y ese dato se muestra en 0/vacío.
- **¿Se guarda historial?** Sí, Netlify guarda internamente una copia por día (`historial/AAAA-MM-DD`).
- **Etiqueta "NUEVO" en Ver detalle:** para quitarla, en `public/js/app.js` cambia
  `SHOW_NEW_BADGE = true` por `false` (edítalo en GitHub; Netlify se actualiza solo).
- **Costo:** entra en el plan gratuito de Netlify (funciones y almacenamiento de uso bajo).

## Estructura
```
public/index.html        Reporte para vendedores
public/admin/index.html  Panel de carga (clave)
public/js/app.js         Lógica del reporte (filtros, tarjetas, tabla, Ver detalle)
public/js/admin.js       Lógica del panel (login, carga, publicación)
public/js/parser.js      Lectura de la hoja "Stock Refer TOTAL"
public/css/styles.css    Estilos (misma línea visual de la v1)
public/vendor/           Librería SheetJS para leer Excel
netlify/functions/       upload.mjs (guarda, con clave) · data.mjs (entrega datos al reporte)
netlify.toml             Configuración de Netlify
```
