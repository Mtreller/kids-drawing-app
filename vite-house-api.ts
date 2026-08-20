import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { createMemoryKv, handleHouseRequest } from './cloudflare/house-api.js';

function createFileKv(directory: string) {
  const memory = createMemoryKv();
  const fileFor = (key: string) => path.join(directory, encodeURIComponent(key));

  return {
    async get(key: string, type?: 'text' | 'json') {
      try {
        const text = await fs.readFile(fileFor(key), 'utf8');
        await memory.put(key, text);
        if (type === 'json') return JSON.parse(text);
        return text;
      } catch {
        return memory.get(key, type);
      }
    },
    async put(key: string, value: string) {
      await memory.put(key, value);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(fileFor(key), typeof value === 'string' ? value : JSON.stringify(value));
    },
    async delete(key: string) {
      await memory.delete(key);
      await fs.unlink(fileFor(key)).catch(() => undefined);
    },
  };
}

export function houseApiPlugin(): Plugin {
  const kv = createFileKv(path.join(process.cwd(), '.data', 'houses'));
  return {
    name: 'color-pop-house-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/') && url !== '/api') return next();
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const method = req.method ?? 'GET';
          const body = Buffer.concat(chunks);
          const request = new Request(new URL(url, 'http://127.0.0.1'), {
            method,
            headers: { 'content-type': req.headers['content-type'] || 'application/json' },
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
          });
          const response = await handleHouseRequest(request, kv);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'API failed.' }));
        }
      });
    },
  };
}
