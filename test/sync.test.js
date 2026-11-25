import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncOnce, encodeBase64Utf8, decodeBase64Utf8, SyncError } from '../src/sync.js';
import { createDoc, createMonth, addItem, getMonth, monthTotals, addTemplateItem } from '../src/model.js';
import { canonicalJson } from '../src/merge.js';

let n = 0;
const o = (now) => ({ now, newId: () => `id${++n}` });
const config = { token: 'tkn', owner: 'MojHnd', repo: 'expense-data', path: 'data.json' };

/** A small in-memory copy of the GitHub Contents API. */
function fakeGitHub({ file = null, conflictsOnPut = 0, status = null, largeFile = false } = {}) {
  const state = { file, puts: 0, gets: 0, conflictsOnPut, shaCounter: 1 };
  const json = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
  state.fetch = async (url, init = {}) => {
    assert.equal(init.headers.Authorization, 'Bearer tkn');
    if (status) return json(status, { message: 'Bad credentials' });
    const u = new URL(url);
    if (u.pathname === '/repos/MojHnd/expense-data/contents/data.json') {
      if (!init.method || init.method === 'GET') {
        state.gets++;
        if (!state.file) return json(404, { message: 'Not Found' });
        return json(200, largeFile
          ? { sha: state.file.sha, content: '', encoding: 'none' }
          : { sha: state.file.sha, content: wrap(encodeBase64Utf8(state.file.text)), encoding: 'base64' });
      }
      if (init.method === 'PUT') {
        state.puts++;
        const body = JSON.parse(init.body);
        if (state.conflictsOnPut > 0) {
          state.conflictsOnPut--;
          return json(409, { message: 'is at abc but expected def' });
        }
        if ((state.file?.sha ?? undefined) !== body.sha) return json(422, { message: 'sha does not match' });
        state.file = { text: decodeBase64Utf8(body.content), sha: `sha${++state.shaCounter}` };
        return json(200, { content: { sha: state.file.sha } });
      }
    }
    if (u.pathname.startsWith('/repos/MojHnd/expense-data/git/blobs/')) {
      return json(200, { content: wrap(encodeBase64Utf8(state.file.text)), encoding: 'base64' });
    }
    return json(404, { message: 'Not Found' });
  };
  return state;
}

const wrap = (b64) => b64.replace(/(.{60})/g, '$1\n');

function localDoc() {
  const doc = createDoc();
  addTemplateItem(doc, { name: 'Mortgage', amount: 200000 }, o(10));
  createMonth(doc, '2026-11', o(10));
  return doc;
}

test('base64 helpers keep UTF-8 text', () => {
  const text = 'Hydro-Québec — 🍕 ok';
  assert.equal(decodeBase64Utf8(encodeBase64Utf8(text)), text);
  assert.equal(decodeBase64Utf8(wrap(encodeBase64Utf8(text.repeat(10)))), text.repeat(10));
});

test('first sync creates the remote file from the local document', async () => {
  const gh = fakeGitHub();
  const local = localDoc();
  const result = await syncOnce({ doc: local, config, fetch: gh.fetch });
  assert.equal(result.pushed, true);
  assert.equal(gh.puts, 1);
  assert.equal(canonicalJson(JSON.parse(gh.file.text)), canonicalJson(local));
  assert.equal(result.sha, gh.file.sha);
});

test('sync merges remote changes into the local document and pushes the merge', async () => {
  const remote = localDoc();
  addItem(remote, '2026-11', { kind: 'gas', amount: 6000 }, o(20));
  const gh = fakeGitHub({ file: { text: JSON.stringify(remote), sha: 'sha1' } });
  const local = structuredClone(localDoc());
  addItem(local, '2026-11', { kind: 'grocery', amount: 8000 }, o(30));
  const result = await syncOnce({ doc: local, config, fetch: gh.fetch });
  const totals = monthTotals(getMonth(result.doc, '2026-11'));
  assert.equal(totals.gas, 6000);
  assert.equal(totals.grocery, 8000);
  assert.equal(result.pushed, true);
  assert.equal(monthTotals(getMonth(JSON.parse(gh.file.text), '2026-11')).grocery, 8000);
});

test('sync does not push when the remote already has everything', async () => {
  const local = localDoc();
  const gh = fakeGitHub({ file: { text: JSON.stringify(local), sha: 'sha1' } });
  const result = await syncOnce({ doc: local, config, fetch: gh.fetch });
  assert.equal(result.pushed, false);
  assert.equal(gh.puts, 0);
  assert.equal(result.sha, 'sha1');
});

test('sync reads again and retries when the remote changed during the push', async () => {
  const local = localDoc();
  addItem(local, '2026-11', { kind: 'gas', amount: 6000 }, o(20));
  const gh = fakeGitHub({ file: { text: JSON.stringify(localDoc()), sha: 'sha1' }, conflictsOnPut: 1 });
  const result = await syncOnce({ doc: local, config, fetch: gh.fetch });
  assert.equal(result.pushed, true);
  assert.equal(gh.gets, 2);
  assert.equal(gh.puts, 2);
});

test('sync stops after 3 conflicts', async () => {
  const local = localDoc();
  const gh = fakeGitHub({ conflictsOnPut: 10 });
  await assert.rejects(syncOnce({ doc: local, config, fetch: gh.fetch }), /conflict/i);
});

test('sync gives a clear error for a bad token', async () => {
  const gh = fakeGitHub({ status: 401 });
  await assert.rejects(syncOnce({ doc: localDoc(), config, fetch: gh.fetch }), (err) => {
    assert.ok(err instanceof SyncError);
    assert.match(err.message, /token/i);
    return true;
  });
});

test('sync reads a large file through the blob API', async () => {
  const remote = localDoc();
  addItem(remote, '2026-11', { kind: 'gas', amount: 6000 }, o(20));
  const gh = fakeGitHub({ file: { text: JSON.stringify(remote), sha: 'sha1' }, largeFile: true });
  const result = await syncOnce({ doc: createDoc(), config, fetch: gh.fetch });
  assert.equal(monthTotals(getMonth(result.doc, '2026-11')).gas, 6000);
});

test('sync fails when the settings are not complete', async () => {
  await assert.rejects(syncOnce({ doc: localDoc(), config: { ...config, token: '' }, fetch: async () => {} }), /settings/i);
});

test('sync refuses a remote file with a wrong shape and does not overwrite it', async () => {
  const gh = fakeGitHub({ file: { text: JSON.stringify({ version: 1, template: [], months: { '2026-11': {} } }), sha: 'sha1' } });
  await assert.rejects(syncOnce({ doc: localDoc(), config, fetch: gh.fetch }), /not valid/i);
  assert.equal(gh.puts, 0);
});
