import {
  StitchError,
  StitchMcpClient,
  authHeaders,
  maskedAuth,
  normalizeAuth,
  uploadScreenToStitch,
} from './lib/stitch.js';
import { NATIVE_UPLOAD_SPEC, TOOL_SPECS } from './lib/tool-specs.js';
import { registerStitchSkills } from './lib/skills.js';

let Schema = null;
try {
  Schema = (await import('@deepseek-ai/schemastery')).default ?? null;
} catch {
  Schema = null;
}

export const name = 'dsh-stitch';

/** Services this plugin cannot work without. `credentials` and `skills` are read optionally. */
export const inject = ['tools', 'webServer'];

export const DEFAULTS = {
  apiUrl: 'https://stitch.googleapis.com/mcp',
  apiBase: 'https://stitch.googleapis.com',
  toolCallTimeoutMs: 180000,
  enableSkills: true,
  skillGroups: ['design', 'build', 'utilities'],
  autoConnect: true,
  maxUploadBytes: 20971520,
};

const AUTH_RECORD = 'dsh-stitch/auth';
const ROUTE_PREFIX = '/api/dsh-stitch';
const SPEC_BY_NAME = new Map(TOOL_SPECS.map((spec) => [spec.name, spec]));

export const Config = (() => {
  if (!Schema) return { ...DEFAULTS };
  try {
    return Schema.object({
      apiUrl: Schema.string().default(DEFAULTS.apiUrl).description('Stitch MCP endpoint.'),
      apiBase: Schema.string().default(DEFAULTS.apiBase).description('Stitch REST API base used by the native upload tool.'),
      toolCallTimeoutMs: Schema.number().default(DEFAULTS.toolCallTimeoutMs).description('Per-call timeout in milliseconds.'),
      enableSkills: Schema.boolean().default(DEFAULTS.enableSkills).description('Register the bundled Stitch Agent Skills.'),
      skillGroups: Schema.array(Schema.string()).default(DEFAULTS.skillGroups).description('Skill groups to register.'),
      autoConnect: Schema.boolean().default(DEFAULTS.autoConnect).description('Connect automatically when a credential is stored.'),
      maxUploadBytes: Schema.number().default(DEFAULTS.maxUploadBytes).description('Maximum size of a file uploaded through stitch_upload_screen.'),
    });
  } catch {
    return { ...DEFAULTS };
  }
})();

function normalizeConfig(raw = {}) {
  const groups = Array.isArray(raw.skillGroups) ? raw.skillGroups.filter((item) => typeof item === 'string') : DEFAULTS.skillGroups;
  return {
    apiUrl: typeof raw.apiUrl === 'string' && raw.apiUrl.trim() ? raw.apiUrl.trim() : DEFAULTS.apiUrl,
    apiBase: typeof raw.apiBase === 'string' && raw.apiBase.trim() ? raw.apiBase.trim() : DEFAULTS.apiBase,
    toolCallTimeoutMs: Number.isFinite(Number(raw.toolCallTimeoutMs)) ? Number(raw.toolCallTimeoutMs) : DEFAULTS.toolCallTimeoutMs,
    enableSkills: typeof raw.enableSkills === 'boolean' ? raw.enableSkills : DEFAULTS.enableSkills,
    skillGroups: groups.length > 0 ? groups : DEFAULTS.skillGroups,
    autoConnect: typeof raw.autoConnect === 'boolean' ? raw.autoConnect : DEFAULTS.autoConnect,
    maxUploadBytes: Number.isFinite(Number(raw.maxUploadBytes)) ? Number(raw.maxUploadBytes) : DEFAULTS.maxUploadBytes,
  };
}

function log(ctx, level, message, error) {
  const text = `[dsh-stitch] ${message}`;
  const logger = ctx.logger;
  try {
    if (logger && typeof logger[level] === 'function') logger[level](text, error);
    else if (level === 'error') console.error(text, error ?? '');
    else console.log(text, error ?? '');
  } catch {
    // Logging must never break the plugin.
  }
}

function textOfContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      if (item.type === 'text' && typeof item.text === 'string') return item.text;
      if (item.type === 'image') return '[image result omitted]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function renderMcpValue(value) {
  if (value === undefined || value === null) return 'Stitch returned no result.';
  const text = textOfContent(value.content);
  const structured =
    value.structuredContent === undefined ? '' : JSON.stringify(value.structuredContent, null, 2);
  if (text && structured) return `${text}\n\n${structured}`;
  if (text) return text;
  if (structured) return structured;
  return JSON.stringify(value, null, 2);
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
}

function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new StitchError('Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readAuth(ctx) {
  const credentials = ctx.get('credentials');
  if (credentials && typeof credentials.readRecord === 'function') {
    try {
      const record = await credentials.readRecord(AUTH_RECORD);
      if (record && record.kind === 'grant' && record.payload) {
        const auth = normalizeAuth({
          mode: record.payload.mode,
          secret: record.payload.secret,
          projectId: record.payload.projectId,
        });
        if (auth) return auth;
      }
    } catch (error) {
      log(ctx, 'warn', 'Failed to read the stored Stitch credential', error);
    }
  }
  const fromEnv = normalizeAuth({
    mode: process.env.STITCH_ACCESS_TOKEN ? 'oauth' : 'api-key',
    secret: process.env.STITCH_ACCESS_TOKEN || process.env.STITCH_API_KEY || '',
    projectId: process.env.STITCH_PROJECT_ID || '',
  });
  return fromEnv;
}

async function writeAuth(ctx, auth) {
  const credentials = ctx.get('credentials');
  if (!credentials || typeof credentials.modifyRecord !== 'function') {
    throw new StitchError('The credential store is not available in this profile, so the Stitch credential cannot be saved.');
  }
  await credentials.modifyRecord(AUTH_RECORD, async () => ({
    kind: 'grant',
    payload: { mode: auth.mode, secret: auth.secret, projectId: auth.projectId },
  }));
}

async function clearAuth(ctx) {
  const credentials = ctx.get('credentials');
  if (!credentials || typeof credentials.deleteRecord !== 'function') {
    throw new StitchError('The credential store is not available in this profile.');
  }
  await credentials.deleteRecord(AUTH_RECORD);
}

function makeToolDefinition(ctx, state, remote) {
  const spec = SPEC_BY_NAME.get(remote.name);
  const toolName = `mcp__stitch__${remote.name}`;
  return {
    name: toolName,
    description: spec?.description || remote.description || `Stitch MCP tool ${remote.name}.`,
    parameters: spec?.parameters || { type: 'object', additionalProperties: true },
    ...(spec?.timeoutMs ? { timeoutMs: spec.timeoutMs } : {}),
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: renderMcpValue(value) }],
    },
    async execute(args, exec) {
      if (!state.client) {
        throw new StitchError('Google Stitch is not connected. Add a credential in Settings -> Plugins -> Google Stitch.');
      }
      try {
        return await state.client.callTool(remote.name, args ?? {}, { signal: exec?.signal });
      } catch (error) {
        if (error instanceof StitchError) throw error;
        throw new StitchError(error?.message || String(error), { cause: error });
      }
    },
  };
}

function makeUploadToolDefinition(ctx, state) {
  return {
    name: NATIVE_UPLOAD_SPEC.name,
    description: NATIVE_UPLOAD_SPEC.description,
    parameters: NATIVE_UPLOAD_SPEC.parameters,
    timeoutMs: 180000,
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const workspace = exec?.agent?.session?.header?.cwd || process.cwd();
      return uploadScreenToStitch({
        auth: state.auth,
        apiBase: state.cfg.apiBase,
        projectId: args.project_id,
        filePath: args.file_path,
        title: args.title,
        generatedBy: args.generated_by,
        maxBytes: state.cfg.maxUploadBytes,
        workspace,
      });
    },
  };
}

function disposeTools(state) {
  for (const dispose of state.toolDisposers.splice(0).reverse()) {
    try {
      dispose();
    } catch (error) {
      log(state.ctx, 'warn', 'Failed to unregister a Stitch tool', error);
    }
  }
  state.toolNames = [];
}

async function disconnect(state) {
  disposeTools(state);
  state.client = null;
  state.connected = false;
  state.authOk = null;
  state.authError = '';
}

async function connect(ctx, state) {
  if (state.connecting) return state.connecting;
  state.connecting = (async () => {
    await disconnect(state);
    if (!state.auth) {
      state.error = '';
      state.status = 'unconfigured';
      return;
    }
    state.status = 'connecting';
    state.error = '';
    try {
      const client = new StitchMcpClient({
        url: state.cfg.apiUrl,
        auth: state.auth,
        timeoutMs: state.cfg.toolCallTimeoutMs,
      });
      await client.initialize();
      const remoteTools = await client.listTools();
      if (remoteTools.length === 0) throw new StitchError('The Stitch MCP server returned no tools.');
      state.client = client;
      for (const remote of remoteTools) {
        const definition = makeToolDefinition(ctx, state, remote);
        state.toolDisposers.push(ctx.tools.register(definition));
        state.toolNames.push(definition.name);
      }
      state.connected = true;
      state.status = 'connected';
      try {
        await client.probe();
        state.authOk = true;
        state.authError = '';
      } catch (error) {
        state.authOk = false;
        state.authError = error?.message || String(error);
        state.status = 'auth-error';
      }
      log(ctx, 'info', `Connected to Stitch MCP: ${state.toolNames.length} tools`);
    } catch (error) {
      state.connected = false;
      state.status = 'error';
      state.error = error?.message || String(error);
      state.authOk = false;
      state.authError = state.error;
      log(ctx, 'warn', `Stitch MCP connection failed: ${state.error}`);
    } finally {
      state.connecting = null;
    }
  })();
  return state.connecting;
}

function statusView(state) {
  return {
    ok: true,
    configured: Boolean(state.auth),
    auth: maskedAuth(state.auth),
    status: state.status,
    connected: state.connected,
    authOk: state.authOk,
    authError: state.authError,
    error: state.error,
    toolCount: state.toolNames.length + (state.nativeRegistered ? 1 : 0),
    tools: state.nativeRegistered ? [NATIVE_UPLOAD_SPEC.name, ...state.toolNames] : [...state.toolNames],
    skillCount: state.skillCount,
    endpoint: state.cfg.apiUrl,
    apiBase: state.cfg.apiBase,
  };
}

function registerRoutes(ctx, state) {
  const disposers = [];
  const register = (path, handler) => {
    try {
      disposers.push(ctx.webServer.register({ kind: 'exact', path: `${ROUTE_PREFIX}${path}`, handler }));
    } catch (error) {
      log(ctx, 'warn', `Failed to register ${path}`, error);
    }
  };

  register('/status', async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: 'GET only' });
    return sendJson(res, 200, statusView(state));
  });

  register('/credential', async (req, res) => {
    try {
      if (req.method === 'POST') {
        const raw = await readBody(req);
        let body;
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          return sendJson(res, 400, { ok: false, message: 'Invalid JSON body' });
        }
        const auth = normalizeAuth({ mode: body.mode, secret: body.secret, projectId: body.projectId });
        if (!auth) return sendJson(res, 400, { ok: false, message: 'A non-empty credential is required' });
        await writeAuth(ctx, auth);
        state.auth = auth;
        await connect(ctx, state);
        return sendJson(res, 200, statusView(state));
      }
      if (req.method === 'DELETE') {
        await clearAuth(ctx);
        state.auth = null;
        await disconnect(state);
        state.status = 'unconfigured';
        state.error = '';
        return sendJson(res, 200, statusView(state));
      }
      return sendJson(res, 405, { ok: false, message: 'POST or DELETE only' });
    } catch (error) {
      return sendJson(res, 500, { ok: false, message: error?.message || String(error) });
    }
  });

  register('/reconnect', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'POST only' });
    try {
      state.auth = await readAuth(ctx);
      await connect(ctx, state);
      return sendJson(res, 200, statusView(state));
    } catch (error) {
      return sendJson(res, 500, { ok: false, message: error?.message || String(error) });
    }
  });

  return () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch {
        // Route disposal is best effort.
      }
    }
  };
}

export async function apply(ctx, config = {}) {
  const state = {
    ctx,
    cfg: normalizeConfig({ ...DEFAULTS, ...(config || {}) }),
    auth: null,
    client: null,
    toolDisposers: [],
    toolNames: [],
    nativeRegistered: false,
    uploadDisposer: null,
    connected: false,
    authOk: null,
    authError: '',
    error: '',
    status: 'idle',
    skillCount: 0,
    connecting: null,
  };

  const disposeRoutes = registerRoutes(ctx, state);

  try {
    state.uploadDisposer = ctx.tools.register(makeUploadToolDefinition(ctx, state));
    state.nativeRegistered = true;
  } catch (error) {
    log(ctx, 'warn', 'Failed to register stitch_upload_screen', error);
  }

  let skillRegistration = { count: 0, dispose: () => {} };
  if (state.cfg.enableSkills) {
    try {
      skillRegistration = await registerStitchSkills(ctx, { groups: state.cfg.skillGroups });
      state.skillCount = skillRegistration.count;
      log(ctx, 'info', `Registered ${state.skillCount} Stitch skills`);
    } catch (error) {
      log(ctx, 'warn', 'Failed to register Stitch skills', error);
    }
  }

  state.auth = await readAuth(ctx);
  if (state.auth && state.cfg.autoConnect) {
    void connect(ctx, state);
  } else {
    state.status = state.auth ? 'ready' : 'unconfigured';
  }

  return async () => {
    disposeRoutes();
    await disconnect(state);
    try {
      state.uploadDisposer?.();
    } catch {
      // Native tool disposal is best effort.
    }
    state.nativeRegistered = false;
    skillRegistration.dispose();
  };
}

export default {
  name,
  inject,
  Config,
  apply,
};
