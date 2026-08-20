const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HOUSE_STORAGE_KEY = 'color-pop-house';

export function generateHouseCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let compact = '';
  for (const byte of bytes) compact += ALPHABET[byte % ALPHABET.length];
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function normalizeHouseCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length !== 8) return null;
  if ([...compact].some((character) => !ALPHABET.includes(character))) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function readStore(storage: Storage) {
  try {
    return normalizeHouseCode(storage.getItem(HOUSE_STORAGE_KEY) ?? '');
  } catch {
    return null;
  }
}

function writeStore(storage: Storage, code: string) {
  try { storage.setItem(HOUSE_STORAGE_KEY, code); }
  catch { /* Private windows can block storage. The URL hash still keeps the code. */ }
}

export function houseCodeFromLocation() {
  const hash = location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const fromParams = params.get('house');
  if (fromParams) return normalizeHouseCode(fromParams);
  const match = hash.match(/house=([A-Za-z0-9-]+)/i);
  return match ? normalizeHouseCode(match[1]) : null;
}

export function writeHouseToLocation(code: string) {
  const next = `#house=${code}`;
  if (location.hash === next) return;
  history.replaceState(null, '', `${location.pathname}${location.search}${next}`);
}

export function persistHouseCode(code: string) {
  writeStore(sessionStorage, code);
  writeStore(localStorage, code);
  writeHouseToLocation(code);
}

export function readStoredHouseCode() {
  return readStore(sessionStorage) ?? readStore(localStorage);
}

export function getHouseCode() {
  const code = houseCodeFromLocation()
    ?? readStoredHouseCode()
    ?? generateHouseCode();
  persistHouseCode(code);
  return code;
}

export function initHouseCode() {
  return getHouseCode();
}

export function setHouseCode(code: string) {
  const normalized = normalizeHouseCode(code);
  if (!normalized) throw new Error('That family code does not look right.');
  persistHouseCode(normalized);
  return normalized;
}

export function getHouseShareUrl(code = getHouseCode()) {
  const url = new URL(location.href);
  url.hash = `house=${code}`;
  return url.toString();
}
