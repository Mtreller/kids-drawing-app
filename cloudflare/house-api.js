const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

const HOUSE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
const MAX_JSON_BYTES = 20 * 1024 * 1024;

function cors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function json(body, status = 200) {
  return cors(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  }));
}

function text(body, status = 200) {
  return cors(new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
}

function normalizePath(pathname) {
  let path = pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/api/')) path = path.slice(4);
  else if (path === '/api') path = '/';
  return path;
}

function metaKey(code) {
  return `h:${code}:meta`;
}

function drawingKey(code, id) {
  return `h:${code}:d:${id}`;
}

async function readMeta(kv, code) {
  const meta = await kv.get(metaKey(code), 'json');
  if (meta && Array.isArray(meta.profiles) && Array.isArray(meta.drawingIds)) return meta;
  return { profiles: [], drawingIds: [] };
}

async function writeMeta(kv, code, meta) {
  await kv.put(metaKey(code), JSON.stringify({
    profiles: meta.profiles,
    drawingIds: [...new Set(meta.drawingIds)],
  }));
}

function upsertById(list, item) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) list.push(item);
  else list[index] = item;
  return list;
}

/**
 * @param {Request} request
 * @param {{ get: Function, put: Function, delete: Function }} kv
 */
export async function handleHouseRequest(request, kv) {
  if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  if (path === '/health' && request.method === 'GET') {
    return json({ ok: true });
  }

  const match = path.match(/^\/houses\/([^/]+)(?:\/(profiles|drawings)\/([^/]+))?$/);
  if (!match) return text('Not found', 404);

  const code = decodeURIComponent(match[1]).toUpperCase();
  if (!HOUSE_PATTERN.test(code)) return json({ error: 'That family code is not valid.' }, 400);

  const collection = match[2];
  const itemId = match[3] ? decodeURIComponent(match[3]) : undefined;

  try {
    if (!collection && request.method === 'GET') {
      const meta = await readMeta(kv, code);
      const drawings = [];
      for (const id of meta.drawingIds) {
        const drawing = await kv.get(drawingKey(code, id), 'json');
        if (drawing) drawings.push(drawing);
      }
      return json({ profiles: meta.profiles, drawings });
    }

    if (collection === 'profiles' && itemId && request.method === 'PUT') {
      const profile = await readJson(request);
      if (!profile || profile.id !== itemId) return json({ error: 'Profile id does not match.' }, 400);
      const meta = await readMeta(kv, code);
      upsertById(meta.profiles, profile);
      await writeMeta(kv, code, meta);
      return json({ ok: true });
    }

    if (collection === 'profiles' && itemId && request.method === 'DELETE') {
      const meta = await readMeta(kv, code);
      meta.profiles = meta.profiles.filter((profile) => profile.id !== itemId);
      const removedDrawings = [];
      const kept = [];
      for (const id of meta.drawingIds) {
        const drawing = await kv.get(drawingKey(code, id), 'json');
        if (drawing?.profileId === itemId) {
          removedDrawings.push(id);
          await kv.delete(drawingKey(code, id));
        } else kept.push(id);
      }
      meta.drawingIds = kept;
      await writeMeta(kv, code, meta);
      return json({ ok: true, removedDrawings });
    }

    if (collection === 'drawings' && itemId && request.method === 'PUT') {
      const drawing = await readJson(request);
      if (!drawing || drawing.id !== itemId) return json({ error: 'Drawing id does not match.' }, 400);
      const meta = await readMeta(kv, code);
      await kv.put(drawingKey(code, itemId), JSON.stringify(drawing));
      if (!meta.drawingIds.includes(itemId)) meta.drawingIds.push(itemId);
      await writeMeta(kv, code, meta);
      return json({ ok: true });
    }

    if (collection === 'drawings' && itemId && request.method === 'DELETE') {
      const meta = await readMeta(kv, code);
      meta.drawingIds = meta.drawingIds.filter((id) => id !== itemId);
      await kv.delete(drawingKey(code, itemId));
      await writeMeta(kv, code, meta);
      return json({ ok: true });
    }

    return text('Method not allowed', 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed.';
    const status = message.includes('too large') ? 413 : 400;
    return json({ error: message }, status);
  }
}

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > MAX_JSON_BYTES) throw new Error('That drawing is too large to save in the family cloud.');
  if (!raw) throw new Error('Missing JSON body.');
  return JSON.parse(raw);
}

export function createMemoryKv(map = new Map()) {
  return {
    async get(key, type) {
      const value = map.get(key);
      if (value == null) return null;
      if (type === 'json') {
        try { return JSON.parse(value); }
        catch { return null; }
      }
      return value;
    },
    async put(key, value) {
      map.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    async delete(key) {
      map.delete(key);
    },
  };
}
