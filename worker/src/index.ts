export interface Env {
  DB: D1Database;
}

type Room = {
  id: number;
  name: string;
  is_private: number;
  invite_code: string;
  owner_name: string;
  last_active_at: string;
};

type Msg = {
  id: number;
  room_id: number;
  name: string;
  message: string;
  created_at: string;
};

const MAX_NAME = 40;
const MAX_ROOM = 60;
const MAX_MSG = 500;
const EXPIRE_DAYS = 7;

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

const getAllowedOrigin = (req: Request) => req.headers.get("origin") || "*";

const nowIso = () => new Date().toISOString();

const randomToken = (len = 32) => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
};

const randomInvite = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
};

const sha256 = async (value: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

async function ensureLobby(env: Env) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO rooms (name, is_private, password_hash, invite_code, owner_name, created_at, last_active_at)
     VALUES ('Lobby', 0, NULL, 'LOBBY000', 'system', ?, ?)`
  )
    .bind(nowIso(), nowIso())
    .run();
}

async function cleanupExpired(env: Env) {
  const expired = await env.DB.prepare(
    `SELECT id FROM rooms WHERE name != 'Lobby' AND datetime(last_active_at) < datetime('now', ?)`
  )
    .bind(`-${EXPIRE_DAYS} day`)
    .all<{ id: number }>();

  const ids = (expired.results || []).map((r) => r.id);
  for (const id of ids) {
    await env.DB.prepare("DELETE FROM messages WHERE room_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM room_members WHERE room_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM rooms WHERE id = ?").bind(id).run();
  }
}

async function findRoom(env: Env, identifier: string) {
  const row = await env.DB.prepare(
    `SELECT id, name, is_private, invite_code, owner_name, last_active_at, password_hash
     FROM rooms WHERE name = ? OR invite_code = ? OR id = ? LIMIT 1`
  )
    .bind(identifier, identifier.toUpperCase(), Number(identifier) || -1)
    .first<Room & { password_hash: string | null }>();
  return row || null;
}

async function joinMember(env: Env, roomId: number, memberName: string) {
  const token = randomToken();
  await env.DB.prepare(
    `INSERT INTO room_members (room_id, member_name, member_token, joined_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(room_id, member_name)
     DO UPDATE SET member_token=excluded.member_token, last_seen_at=excluded.last_seen_at`
  )
    .bind(roomId, memberName, token, nowIso(), nowIso())
    .run();
  return token;
}

async function assertMember(env: Env, roomId: number, memberName: string, token: string) {
  const row = await env.DB.prepare(
    `SELECT id FROM room_members WHERE room_id = ? AND member_name = ? AND member_token = ? LIMIT 1`
  )
    .bind(roomId, memberName, token)
    .first<{ id: number }>();
  if (!row) return false;
  await env.DB.prepare(`UPDATE room_members SET last_seen_at = ? WHERE id = ?`)
    .bind(nowIso(), row.id)
    .run();
  return true;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = getAllowedOrigin(req);

    if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);

    await ensureLobby(env);
    await cleanupExpired(env);

    if (url.pathname === "/api/rooms" && req.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT r.id, r.name, r.is_private, r.invite_code, r.owner_name, r.last_active_at,
                COUNT(m.id) as member_count
         FROM rooms r
         LEFT JOIN room_members m ON m.room_id = r.id
         GROUP BY r.id
         ORDER BY r.last_active_at DESC`
      ).all<Room & { member_count: number }>();

      return json({ rooms: results || [] }, 200, origin);
    }

    if (url.pathname === "/api/rooms/create" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { name?: string; ownerName?: string; isPrivate?: boolean; password?: string }
        | null;

      const name = body?.name?.trim();
      const ownerName = body?.ownerName?.trim();
      const isPrivate = Boolean(body?.isPrivate);
      const password = body?.password?.trim() || "";

      if (!name || !ownerName) return json({ error: "name and ownerName are required" }, 400, origin);
      if (name.length > MAX_ROOM || ownerName.length > MAX_NAME) return json({ error: "name too long" }, 400, origin);
      if (isPrivate && password.length < 4) return json({ error: "password min 4 chars" }, 400, origin);

      const inviteCode = randomInvite();
      const passHash = isPrivate ? await sha256(password) : null;

      const inserted = await env.DB.prepare(
        `INSERT INTO rooms (name, is_private, password_hash, invite_code, owner_name, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(name, isPrivate ? 1 : 0, passHash, inviteCode, ownerName, nowIso(), nowIso())
        .run();

      if (!inserted.success) return json({ error: "failed to create room (maybe name already used)" }, 400, origin);

      const roomId = Number(inserted.meta.last_row_id);
      const memberToken = await joinMember(env, roomId, ownerName);

      return json({ ok: true, roomId, roomName: name, inviteCode, ownerName, memberToken, isOwner: true }, 201, origin);
    }

    if (url.pathname === "/api/rooms/join" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { identifier?: string; password?: string; memberName?: string }
        | null;

      const identifier = body?.identifier?.trim();
      const memberName = body?.memberName?.trim();
      const password = body?.password?.trim() || "";

      if (!identifier || !memberName) return json({ error: "identifier and memberName are required" }, 400, origin);
      if (memberName.length > MAX_NAME) return json({ error: "memberName too long" }, 400, origin);

      const room = await findRoom(env, identifier);
      if (!room) return json({ error: "room not found" }, 404, origin);

      if (room.is_private) {
        const passHash = await sha256(password);
        if (!room.password_hash || passHash !== room.password_hash) {
          return json({ error: "invalid room password" }, 401, origin);
        }
      }

      const memberToken = await joinMember(env, room.id, memberName);
      await env.DB.prepare("UPDATE rooms SET last_active_at = ? WHERE id = ?").bind(nowIso(), room.id).run();

      return json(
        {
          ok: true,
          roomId: room.id,
          roomName: room.name,
          inviteCode: room.invite_code,
          ownerName: room.owner_name,
          isPrivate: Boolean(room.is_private),
          memberName,
          memberToken,
          isOwner: room.owner_name === memberName,
        },
        200,
        origin
      );
    }

    if (url.pathname.match(/^\/api\/rooms\/\d+\/regenerate-invite$/) && req.method === "POST") {
      const roomId = Number(url.pathname.split("/")[3]);
      const body = (await req.json().catch(() => null)) as
        | { memberName?: string; memberToken?: string }
        | null;
      const memberName = body?.memberName?.trim() || "";
      const memberToken = body?.memberToken?.trim() || "";

      const room = await env.DB.prepare("SELECT owner_name FROM rooms WHERE id = ?").bind(roomId).first<{ owner_name: string }>();
      if (!room) return json({ error: "room not found" }, 404, origin);
      if (room.owner_name !== memberName) return json({ error: "only owner can do this" }, 403, origin);

      const ok = await assertMember(env, roomId, memberName, memberToken);
      if (!ok) return json({ error: "invalid member token" }, 401, origin);

      const inviteCode = randomInvite();
      await env.DB.prepare("UPDATE rooms SET invite_code = ?, last_active_at = ? WHERE id = ?")
        .bind(inviteCode, nowIso(), roomId)
        .run();

      return json({ ok: true, inviteCode }, 200, origin);
    }

    if (url.pathname.match(/^\/api\/rooms\/\d+\/regenerate-password$/) && req.method === "POST") {
      const roomId = Number(url.pathname.split("/")[3]);
      const body = (await req.json().catch(() => null)) as
        | { memberName?: string; memberToken?: string; newPassword?: string }
        | null;
      const memberName = body?.memberName?.trim() || "";
      const memberToken = body?.memberToken?.trim() || "";
      const newPassword = body?.newPassword?.trim() || "";

      if (newPassword.length < 4) return json({ error: "new password min 4 chars" }, 400, origin);

      const room = await env.DB.prepare("SELECT owner_name FROM rooms WHERE id = ?").bind(roomId).first<{ owner_name: string }>();
      if (!room) return json({ error: "room not found" }, 404, origin);
      if (room.owner_name !== memberName) return json({ error: "only owner can do this" }, 403, origin);

      const ok = await assertMember(env, roomId, memberName, memberToken);
      if (!ok) return json({ error: "invalid member token" }, 401, origin);

      await env.DB.prepare("UPDATE rooms SET is_private = 1, password_hash = ?, last_active_at = ? WHERE id = ?")
        .bind(await sha256(newPassword), nowIso(), roomId)
        .run();

      return json({ ok: true }, 200, origin);
    }

    if (url.pathname === "/api/messages" && req.method === "GET") {
      const roomId = Number(url.searchParams.get("roomId") || 0);
      if (!roomId) return json({ error: "roomId is required" }, 400, origin);

      const { results } = await env.DB.prepare(
        "SELECT id, room_id, name, message, created_at FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT 100"
      )
        .bind(roomId)
        .all<Msg>();

      return json({ messages: (results || []).reverse() }, 200, origin);
    }

    if (url.pathname === "/api/messages" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { roomId?: number; name?: string; message?: string; memberToken?: string }
        | null;

      const roomId = Number(body?.roomId || 0);
      const name = body?.name?.trim();
      const message = body?.message?.trim();
      const memberToken = body?.memberToken?.trim() || "";

      if (!roomId || !name || !message) return json({ error: "roomId, name, message are required" }, 400, origin);
      if (name.length > MAX_NAME || message.length > MAX_MSG) return json({ error: "name/message too long" }, 400, origin);

      const allowed = await assertMember(env, roomId, name, memberToken);
      if (!allowed) return json({ error: "join room first" }, 401, origin);

      const createdAt = nowIso();
      const result = await env.DB.prepare(
        "INSERT INTO messages (room_id, name, message, created_at) VALUES (?, ?, ?, ?)"
      )
        .bind(roomId, name, message, createdAt)
        .run();

      await env.DB.prepare("UPDATE rooms SET last_active_at = ? WHERE id = ?").bind(createdAt, roomId).run();

      return json({ ok: true, id: result.meta.last_row_id, room_id: roomId, name, message, created_at: createdAt }, 201, origin);
    }

    return json({ error: "Not found" }, 404, origin);
  },
};
