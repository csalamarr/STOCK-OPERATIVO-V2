// GET /api/data — público. Devuelve el último stock publicado.
import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore({ name: "stock-operativo", consistency: "strong" });
  const data = await store.get("latest", { type: "text" });
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (!data) return new Response(JSON.stringify({ empty: true }), { status: 404, headers });
  return new Response(data, { status: 200, headers });
};

export const config = { path: "/api/data" };
