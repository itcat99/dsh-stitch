import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_PROTOCOL = '2025-06-18';
const JSON_HEADERS = { 'content-type': 'application/json' };

export class StitchError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'StitchError';
    this.status = options.status;
    this.code = options.code;
  }
}

export function normalizeAuth(input) {
  if (input === undefined || input === null) return null;
  const mode = input.mode === 'oauth' ? 'oauth' : 'api-key';
  const secret = typeof input.secret === 'string' ? input.secret.trim() : '';
  if (secret === '') return null;
  const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
  return { mode, secret, projectId };
}

export function authHeaders(auth) {
  if (!auth) return {};
  if (auth.mode === 'oauth') {
    return {
      Authorization: `Bearer ${auth.secret}`,
      ...(auth.projectId ? { 'X-Goog-User-Project': auth.projectId } : {}),
    };
  }
  return { 'X-Goog-Api-Key': auth.secret };
}

export function maskedAuth(auth) {
  if (!auth) return { configured: false, mode: null, hint: '', projectId: '' };
  const tail = auth.secret.length >= 4 ? auth.secret.slice(-4) : '';
  return {
    configured: true,
    mode: auth.mode,
    hint: tail ? `…${tail}` : '',
    projectId: auth.projectId || '',
  };
}

function textOfContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && item.type === 'text' && typeof item.text === 'string') return item.text;
      if (item && item.type === 'image') return '[image result omitted]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseSse(text) {
  const events = text.split(/\r?\n\r?\n/);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const data = events[index]
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data) continue;
    try {
      return JSON.parse(data);
    } catch {
      // Keep looking for a JSON event.
    }
  }
  return undefined;
}

function parseBody(text, contentType) {
  if (!text) return undefined;
  if (contentType.includes('text/event-stream')) return parseSse(text);
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorFromPayload(payload, status) {
  if (payload?.error) {
    const message = payload.error.message || JSON.stringify(payload.error);
    return new StitchError(`Stitch MCP error: ${message}`, { status, code: payload.error.code });
  }
  if (payload?.result?.isError === true) {
    const message = textOfContent(payload.result.content) || 'Stitch reported an error';
    return new StitchError(message, { status });
  }
  return undefined;
}

export class StitchMcpClient {
  constructor(options) {
    this.url = options.url;
    this.auth = options.auth ?? null;
    this.timeoutMs = options.timeoutMs ?? 180000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.protocolVersion = DEFAULT_PROTOCOL;
    this.nextId = 1;
  }

  async request(method, params, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (options.signal) signals.push(options.signal);
    const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);
    const body = JSON.stringify({ jsonrpc: '2.0', id: this.nextId, method, params });
    this.nextId += 1;

    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          ...JSON_HEADERS,
          accept: 'application/json, text/event-stream',
          ...authHeaders(this.auth),
        },
        body,
        signal,
      });
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        throw new StitchError(`Stitch request timed out after ${Math.round(timeoutMs / 1000)}s`, { cause: error });
      }
      throw new StitchError(`Cannot reach Stitch at ${this.url}: ${error?.message || String(error)}`, { cause: error });
    }

    const text = await response.text();
    const type = response.headers.get('content-type') || '';
    const payload = parseBody(text, type);
    const payloadError = errorFromPayload(payload, response.status);
    if (payloadError) throw payloadError;
    if (!response.ok) {
      const preview = text.replace(/\s+/g, ' ').slice(0, 300);
      throw new StitchError(`Stitch MCP HTTP ${response.status}${preview ? `: ${preview}` : ''}`, { status: response.status });
    }
    if (payload === undefined) {
      if (method.startsWith('notifications/')) return undefined;
      throw new StitchError('Stitch returned an empty or non-JSON response');
    }
    if (payload.result !== undefined) return payload.result;
    return payload;
  }

  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: { name: 'dsh-stitch', version: '0.1.0' },
    });
    if (typeof result?.protocolVersion === 'string') this.protocolVersion = result.protocolVersion;
    try {
      await this.request('notifications/initialized', {});
    } catch {
      // Notifications are best effort on a stateless endpoint.
    }
    return result;
  }

  async listTools() {
    const tools = [];
    let cursor;
    for (let page = 0; page < 20; page += 1) {
      const result = await this.request('tools/list', cursor ? { cursor } : {});
      if (Array.isArray(result?.tools)) tools.push(...result.tools);
      cursor = result?.nextCursor;
      if (!cursor) break;
    }
    return tools;
  }

  async callTool(name, args, options = {}) {
    const result = await this.request(
      'tools/call',
      { name, arguments: args ?? {} },
      { signal: options.signal, timeoutMs: options.timeoutMs },
    );
    return result ?? { content: [] };
  }

  async probe() {
    const result = await this.callTool('list_projects', {});
    return {
      ok: true,
      text: textOfContent(result.content).slice(0, 800),
      structured: result.structuredContent,
    };
  }
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.md': 'text/markdown',
};

export function resolveWorkspaceFile(filePath, workspace) {
  const root = path.resolve(workspace || process.cwd());
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new StitchError(`file_path must stay inside the session workspace: ${filePath}`);
  }
  return absolute;
}

export async function uploadScreenToStitch(options) {
  const { auth, apiBase, projectId, filePath, title, generatedBy, maxBytes, workspace } = options;
  if (!auth) throw new StitchError('Google Stitch is not configured yet. Add an API key or OAuth token in Settings -> Plugins -> Google Stitch.');
  if (!projectId) throw new StitchError('project_id is required');
  const absolute = resolveWorkspaceFile(filePath, workspace);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new StitchError(`Not a file: ${filePath}`);
  if (stat.size > maxBytes) throw new StitchError(`File is ${stat.size} bytes, above the configured ${maxBytes} byte limit`);
  const ext = path.extname(absolute).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) throw new StitchError(`Unsupported file type "${ext}". Use png, jpg, jpeg, webp, html, htm, or md.`);

  const data = await fs.readFile(absolute);
  const fileObject = { fileContentBase64: data.toString('base64'), mimeType };
  const screen = mimeType.startsWith('image/')
    ? { screenshot: fileObject, screenType: 'IMAGE', isCreatedByClient: true }
    : {
        htmlCode: fileObject,
        screenType: 'DOCUMENT',
        isCreatedByClient: true,
        generatedBy: generatedBy || (mimeType === 'text/markdown' ? 'UserUploadedDesignMd' : 'UserUploadedHtml'),
      };
  if (title) screen.title = title;

  const url = `${apiBase.replace(/\/+$/, '')}/v1/projects/${encodeURIComponent(projectId)}/screens:batchCreate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...authHeaders(auth) },
    body: JSON.stringify({
      parent: `projects/${projectId}`,
      requests: [{ screen }],
      createScreenInstances: true,
    }),
    signal: AbortSignal.timeout(180000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.raw || text.slice(0, 300);
    throw new StitchError(`Stitch upload failed (HTTP ${response.status}): ${message}`, { status: response.status });
  }
  return payload;
}
