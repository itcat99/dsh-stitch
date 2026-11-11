import test from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, normalizeAuth, maskedAuth, StitchMcpClient } from '../lib/stitch.js';

test('normalizeAuth accepts API key and OAuth modes', () => {
  assert.deepEqual(normalizeAuth({ mode: 'api-key', secret: ' abc ' }), {
    mode: 'api-key',
    secret: 'abc',
    projectId: '',
  });
  assert.deepEqual(normalizeAuth({ mode: 'oauth', secret: 'tok', projectId: 'p1' }), {
    mode: 'oauth',
    secret: 'tok',
    projectId: 'p1',
  });
  assert.equal(normalizeAuth({ mode: 'api-key', secret: '   ' }), null);
  assert.equal(normalizeAuth(null), null);
});

test('authHeaders selects the documented headers', () => {
  assert.deepEqual(authHeaders({ mode: 'api-key', secret: 'k', projectId: '' }), {
    'X-Goog-Api-Key': 'k',
  });
  assert.deepEqual(authHeaders({ mode: 'oauth', secret: 't', projectId: 'p' }), {
    Authorization: 'Bearer t',
    'X-Goog-User-Project': 'p',
  });
});

test('maskedAuth never exposes the secret', () => {
  const view = maskedAuth({ mode: 'api-key', secret: 'abcdefgh', projectId: '' });
  assert.equal(view.configured, true);
  assert.equal(view.hint, '…efgh');
  assert.equal(JSON.stringify(view).includes('abcdefgh'), false);
});

test('MCP client parses a JSON-RPC result and surfaces auth errors', async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.method);
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
    if (body.method === 'tools/list') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'list_projects' }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: 'API keys are not supported by this API.' }], isError: true },
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  };
  const client = new StitchMcpClient({ url: 'https://example.invalid/mcp', auth: null, fetchImpl, timeoutMs: 1000 });
  await client.initialize();
  assert.deepEqual(await client.listTools(), [{ name: 'list_projects' }]);
  await assert.rejects(() => client.probe(), /API keys are not supported/);
  assert.deepEqual(calls, ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
});
