// Sync the document with one JSON file in a private GitHub repo (GitHub Contents API).
// Flow: GET the file → merge with local → PUT with the remote sha if something changed.
// If the remote changed between GET and PUT, GitHub rejects the PUT (409/422) and we try again.

import { mergeDocs, canonicalJson } from './merge.js';
import { validateDoc } from './model.js';

const API = 'https://api.github.com';
const MAX_ATTEMPTS = 3;

export class SyncError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

export function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function decodeBase64Utf8(b64) {
  const binary = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function errorFor(status, body, action) {
  const detail = body?.message ? ` (${body.message})` : '';
  if (status === 401) return new SyncError(`GitHub rejected the token${detail}. Check the token in Settings.`, 'auth');
  if (status === 403) return new SyncError(`GitHub refused access${detail}. The token needs Contents read and write on the data repo.`, 'forbidden');
  if (status === 404) return new SyncError(`Repo or file not found${detail}. Check the owner, repo and token access.`, 'not-found');
  return new SyncError(`GitHub error ${status} when it tried to ${action}${detail}.`, 'http');
}

async function call(fetchFn, url, token, init = {}) {
  let res;
  try {
    res = await fetchFn(url, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('No connection to GitHub. The changes stay on this device.', 'offline');
  }
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  return { status: res.status, ok: res.ok, body };
}

function contentsUrl({ owner, repo, path }) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
}

/** Read the remote file. Returns { doc, sha } or { doc: null, sha: undefined } if it does not exist. */
async function pull(config, fetchFn) {
  const res = await call(fetchFn, contentsUrl(config), config.token);
  if (res.status === 404) return { doc: null, sha: undefined };
  if (!res.ok) throw errorFor(res.status, res.body, 'read the data');
  let b64 = res.body.content;
  if (!b64 && res.body.encoding === 'none') {
    // Files larger than 1 MB come without content; read them through the blob API.
    const blobUrl = `${API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/blobs/${res.body.sha}`;
    const blob = await call(fetchFn, blobUrl, config.token);
    if (!blob.ok) throw errorFor(blob.status, blob.body, 'read the data');
    b64 = blob.body.content;
  }
  let doc;
  try {
    doc = JSON.parse(decodeBase64Utf8(b64));
  } catch {
    throw new SyncError('The remote data file is not valid JSON. Fix or delete it in the data repo.', 'bad-remote');
  }
  const problems = validateDoc(doc);
  if (problems.length) {
    throw new SyncError(`The remote data file is not valid (${problems[0]}). Fix it in the data repo.`, 'bad-remote');
  }
  return { doc, sha: res.body.sha };
}

export function serialize(doc) {
  return JSON.stringify(doc, null, 1) + '\n';
}

/**
 * Do one full sync. Returns { doc, sha, pushed }.
 * `doc` is the merged document; the caller saves it locally.
 */
export async function syncOnce({ doc, config, fetch: fetchFn = globalThis.fetch, message = 'Sync' }) {
  if (!config?.token || !config.owner || !config.repo || !config.path) {
    throw new SyncError('Sync settings are not complete.', 'config');
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remote = await pull(config, fetchFn);
    const merged = mergeDocs(remote.doc, doc);
    if (remote.doc && canonicalJson(merged) === canonicalJson(remote.doc)) {
      return { doc: merged, sha: remote.sha, pushed: false };
    }
    const body = { message, content: encodeBase64Utf8(serialize(merged)) };
    if (remote.sha) body.sha = remote.sha;
    const res = await call(fetchFn, contentsUrl(config), config.token, { method: 'PUT', body: JSON.stringify(body) });
    if (res.ok) return { doc: merged, sha: res.body.content.sha, pushed: true };
    if (res.status !== 409 && res.status !== 422) throw errorFor(res.status, res.body, 'save the data');
    doc = merged;
  }
  throw new SyncError('The remote data changed too many times during sync (conflict). Try again.', 'conflict');
}
