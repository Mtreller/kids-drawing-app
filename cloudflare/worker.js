import { handleHouseRequest } from './house-api.js';

export default {
  async fetch(request, env) {
    if (!env.HOUSES) {
      return new Response(JSON.stringify({ error: 'Family cloud storage is not configured.' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    return handleHouseRequest(request, env.HOUSES);
  },
};

