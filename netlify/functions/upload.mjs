// POST /api/upload  — solo administrador.
// Guarda el JSON del Excel (ya procesado en el navegador) en Netlify Blobs.
// Requiere la variable de entorno ADMIN_PASSWORD configurada en Netlify.
import { getStore } from "@netlify/blobs";
import { timingSafeEqual, createHash } from "node:crypto";

const STORE = "stock-operativo";
const MAX_BYTES = 5 * 1024 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function sameSecret(a, b) {
  // compara hashes de igual longitud para evitar ataques por tiempo
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function limaDate(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const secret = (globalThis.Netlify?.env?.get?.("ADMIN_PASSWORD")) ?? process.env.ADMIN_PASSWORD;
  if (!secret) return json({ error: "Falta configurar ADMIN_PASSWORD en Netlify (Site configuration → Environment variables)." }, 500);

  const key = req.headers.get("x-admin-key") || "";
  if (!sameSecret(key, secret)) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos repetidos
    return json({ error: "Clave incorrecta" }, 401);
  }

  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ error: "Archivo procesado demasiado grande" }, 413);

  let body;
  try { body = JSON.parse(text); } catch { return json({ error: "JSON inválido" }, 400); }

  if (body.check) return json({ ok: true });

  const data = body.data;
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0 || data.rows.length > 20000) {
    return json({ error: "Datos inválidos: no hay productos." }, 400);
  }

  // la hora de publicación la pone el servidor
  data.updated_at = new Date().toISOString();

  const store = getStore({ name: STORE, consistency: "strong" });
  await store.setJSON("latest", data);
  // copia diaria (histórico, se sobrescribe si se carga varias veces el mismo día)
  await store.setJSON(`historial/${limaDate(data.updated_at)}`, data);

  return json({ ok: true, updated_at: data.updated_at, rows: data.rows.length });
};

export const config = { path: "/api/upload" };
