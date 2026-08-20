import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryKv, handleHouseRequest } from './house-api.js';

const CODE = 'AB2D-EFGH';

function request(path, init) {
  return new Request(`https://color-pop.example${path}`, init);
}

test('rejects a malformed family code', async () => {
  const response = await handleHouseRequest(request('/houses/nope'), createMemoryKv());
  assert.equal(response.status, 400);
});

test('stores profiles and drawings for a house', async () => {
  const kv = createMemoryKv();
  const profile = { id: 'p1', name: 'Ada', color: '#f3c4ff', emoji: '🦄', createdAt: 1, updatedAt: 2 };
  const drawing = {
    id: 'd1',
    profileId: 'p1',
    title: 'Rainbow',
    createdAt: 1,
    updatedAt: 3,
    thumbnail: { mime: 'image/jpeg', data: 'QQ==' },
    snapshot: { width: 10, height: 10, objects: [], bitmap: { mime: 'image/png', data: 'QQ==' } },
  };

  const putProfile = await handleHouseRequest(request(`/houses/${CODE}/profiles/p1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  }), kv);
  assert.equal(putProfile.status, 200);

  const putDrawing = await handleHouseRequest(request(`/houses/${CODE}/drawings/d1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(drawing),
  }), kv);
  assert.equal(putDrawing.status, 200);

  const loaded = await handleHouseRequest(request(`/houses/${CODE}`), kv);
  assert.equal(loaded.status, 200);
  const body = await loaded.json();
  assert.equal(body.profiles[0].name, 'Ada');
  assert.equal(body.drawings[0].title, 'Rainbow');
});

test('deleting a profile removes that artist\'s drawings', async () => {
  const kv = createMemoryKv();
  await handleHouseRequest(request(`/houses/${CODE}/profiles/p1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'p1', name: 'Ada', createdAt: 1, updatedAt: 1 }),
  }), kv);
  await handleHouseRequest(request(`/houses/${CODE}/drawings/d1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'd1', profileId: 'p1', title: 'One', createdAt: 1, updatedAt: 1 }),
  }), kv);
  await handleHouseRequest(request(`/houses/${CODE}/drawings/d2`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'd2', profileId: 'p2', title: 'Two', createdAt: 1, updatedAt: 1 }),
  }), kv);

  const deleted = await handleHouseRequest(request(`/houses/${CODE}/profiles/p1`, { method: 'DELETE' }), kv);
  assert.equal(deleted.status, 200);

  const loaded = await handleHouseRequest(request(`/houses/${CODE}`), kv);
  const body = await loaded.json();
  assert.equal(body.profiles.length, 0);
  assert.equal(body.drawings.length, 1);
  assert.equal(body.drawings[0].id, 'd2');
});

test('supports the /api prefix used by local Vite', async () => {
  const kv = createMemoryKv();
  const response = await handleHouseRequest(request(`/api/houses/${CODE}`), kv);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { profiles: [], drawings: [] });
});
