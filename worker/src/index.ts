export interface Env {
  DB: D1Database;
}

type Msg = {
  id: number;
  name: string;
  message: string;
  created_at: string;
};

const json = (data: unknown, status = 200, origin = "*") =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });

const getAllowedOrigin = (req: Request) => {
  const origin = req.headers.get("origin") || "*";
  if (!origin) return "*";
  return origin;
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = getAllowedOrigin(req);

    if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);

    if (url.pathname === "/api/messages" && req.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, name, message, created_at FROM messages ORDER BY id DESC LIMIT 50"
      ).all<Msg>();

      return json({ messages: (results || []).reverse() }, 200, origin);
    }

    if (url.pathname === "/api/messages" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { name?: string; message?: string }
        | null;

      const name = body?.name?.trim();
      const message = body?.message?.trim();

      if (!name || !message) {
        return json({ error: "name and message are required" }, 400, origin);
      }

      if (name.length > 40 || message.length > 500) {
        return json({ error: "name/message too long" }, 400, origin);
      }

      const createdAt = new Date().toISOString();

      const result = await env.DB.prepare(
        "INSERT INTO messages (name, message, created_at) VALUES (?, ?, ?)"
      )
        .bind(name, message, createdAt)
        .run();

      return json(
        {
          ok: true,
          id: result.meta.last_row_id,
          name,
          message,
          created_at: createdAt,
        },
        201,
        origin
      );
    }

    return json({ error: "Not found" }, 404, origin);
  },
};
