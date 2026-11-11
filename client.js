window.__ModuleLoader__.load({
  id: 'dsh-stitch',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;

    const ROW_KEY = 'dsh-stitch#dsh-stitch';
    const BASE = '/api/dsh-stitch';

    const T = {
      zh: {
        title: 'Google Stitch',
        subtitle: '通过 MCP 连接 Stitch，管理凭据并加载官方 Agent Skills。',
        status: '状态',
        unconfigured: '未配置',
        connecting: '连接中',
        connected: '已连接',
        authError: '认证失败',
        error: '连接失败',
        tools: '工具',
        skills: '技能',
        endpoint: 'MCP 端点',
        authMode: '认证方式',
        apiKey: 'API Key',
        oauth: 'OAuth Access Token',
        secret: '凭据',
        apiKeyPlaceholder: '粘贴 Stitch API Key',
        oauthPlaceholder: '粘贴 Google OAuth access token',
        projectId: 'Google Cloud 项目 ID（OAuth 可选）',
        projectIdHint: 'OAuth 模式会作为 X-Goog-User-Project 发送。',
        save: '保存并测试',
        saving: '连接中…',
        clear: '清除凭据',
        reconnect: '重新连接',
        link: '创建 API Key',
        help: '在 Stitch Settings → API Keys 创建密钥。若端点拒绝 API Key，请改用 OAuth access token：gcloud auth application-default print-access-token。',
        failed: '失败',
        saved: '已保存',
        keyHint: '已保存的凭据不会回显。',
        apiKeyRejected: '该 Stitch 端点当前拒绝 API Key（API keys are not supported）。请切换到 OAuth Access Token 模式，填入 `gcloud auth application-default print-access-token` 的输出，并填写项目 ID。',
        toolsList: '已注册工具',
        refresh: '刷新',
      },
      en: {
        title: 'Google Stitch',
        subtitle: 'Connect Stitch over MCP, manage credentials, and load the official Agent Skills.',
        status: 'Status',
        unconfigured: 'Not configured',
        connecting: 'Connecting',
        connected: 'Connected',
        authError: 'Authentication failed',
        error: 'Connection failed',
        tools: 'tools',
        skills: 'skills',
        endpoint: 'MCP endpoint',
        authMode: 'Authentication',
        apiKey: 'API key',
        oauth: 'OAuth access token',
        secret: 'Credential',
        apiKeyPlaceholder: 'Paste a Stitch API key',
        oauthPlaceholder: 'Paste a Google OAuth access token',
        projectId: 'Google Cloud project ID (OAuth, optional)',
        projectIdHint: 'Sent as X-Goog-User-Project in OAuth mode.',
        save: 'Save and test',
        saving: 'Connecting…',
        clear: 'Clear credential',
        reconnect: 'Reconnect',
        link: 'Create API key',
        help: 'Create a key in Stitch Settings → API Keys. If the endpoint rejects API keys, use an OAuth access token from gcloud auth application-default print-access-token.',
        failed: 'failed',
        saved: 'Saved',
        keyHint: 'Stored credentials are never shown again.',
        apiKeyRejected: 'This Stitch endpoint rejects API keys. Switch to OAuth access token, paste the output of `gcloud auth application-default print-access-token`, and set the project ID.',
        toolsList: 'Registered tools',
        refresh: 'Refresh',
      },
    };

    const zh = typeof navigator !== 'undefined' && String(navigator.language || '').toLowerCase().startsWith('zh');
    const t = zh ? T.zh : T.en;

    const styles = {
      page: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0', color: 'inherit' },
      card: {
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))',
        borderRadius: '12px',
        padding: '16px',
        background: 'var(--dsw-alias-bg-layer-1, transparent)',
      },
      header: { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
      title: { margin: 0, fontSize: '16px', fontWeight: 600 },
      subtitle: { margin: '4px 0 0', fontSize: '13px', opacity: 0.7 },
      pill: (tone) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))',
        color:
          tone === 'ok'
            ? 'var(--dsw-alias-state-success-primary, #2e7d32)'
            : tone === 'bad'
              ? 'var(--dsw-alias-state-error-primary, #c62828)'
              : 'inherit',
      }),
      dot: (tone) => ({
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background:
          tone === 'ok'
            ? 'var(--dsw-alias-state-success-primary, #2e7d32)'
            : tone === 'bad'
              ? 'var(--dsw-alias-state-error-primary, #c62828)'
              : 'var(--dsw-alias-text-secondary, #888)',
      }),
      meta: { display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px', opacity: 0.8 },
      label: { display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '9px 11px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))',
        background: 'var(--dsw-alias-bg-base, transparent)',
        color: 'inherit',
        font: 'inherit',
      },
      row: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' },
      button: (primary) => ({
        padding: '8px 15px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))',
        background: primary ? 'var(--dsw-alias-brand-primary, #247bbf)' : 'transparent',
        color: primary ? 'var(--dsw-alias-bg-base, #fff)' : 'inherit',
        cursor: 'pointer',
        fontWeight: 500,
      }),
      ghostButton: (active) => ({
        padding: '6px 12px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))',
        background: active ? 'var(--dsw-alias-brand-primary, #247bbf)' : 'transparent',
        color: active ? 'var(--dsw-alias-bg-base, #fff)' : 'inherit',
        cursor: 'pointer',
        fontSize: '13px',
      }),
      hint: { fontSize: '12px', opacity: 0.65, marginTop: '6px', lineHeight: 1.5 },
      error: {
        marginTop: '12px',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-state-error-primary, #c62828)',
        color: 'var(--dsw-alias-state-error-primary, #c62828)',
        fontSize: '12px',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.5,
      },
      toolList: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' },
      code: {
        fontSize: '11px',
        padding: '2px 7px',
        borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12))',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      },
    };

    async function readJson(response) {
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
      }
    }

    function StatusPill({ data }) {
      const status = data?.status;
      if (!data?.configured) return h('span', { style: styles.pill('idle') }, h('span', { style: styles.dot('idle') }), t.unconfigured);
      if (status === 'connecting') return h('span', { style: styles.pill('idle') }, h('span', { style: styles.dot('idle') }), t.connecting);
      if (data.authOk === true && data.connected) return h('span', { style: styles.pill('ok') }, h('span', { style: styles.dot('ok') }), t.connected);
      if (status === 'auth-error') return h('span', { style: styles.pill('bad') }, h('span', { style: styles.dot('bad') }), t.authError);
      if (status === 'error') return h('span', { style: styles.pill('bad') }, h('span', { style: styles.dot('bad') }), t.error);
      return h('span', { style: styles.pill('idle') }, h('span', { style: styles.dot('idle') }), status || t.unconfigured);
    }

    function ConfigPage() {
      const [data, setData] = useState(null);
      const [mode, setMode] = useState('api-key');
      const [secret, setSecret] = useState('');
      const [projectId, setProjectId] = useState('');
      const [busy, setBusy] = useState('');
      const [message, setMessage] = useState('');
      const [showSecret, setShowSecret] = useState(false);
      const [loading, setLoading] = useState(true);

      const refresh = useCallback(async () => {
        try {
          const response = await fetch(`${BASE}/status`, { headers: { accept: 'application/json' } });
          const body = await readJson(response);
          if (!body.ok) throw new Error(body.message || `HTTP ${response.status}`);
          setData(body);
          if (body.auth?.mode) setMode(body.auth.mode);
          if (body.auth?.projectId) setProjectId(body.auth.projectId);
        } catch (error) {
          setMessage(error?.message || String(error));
        } finally {
          setLoading(false);
        }
      }, []);

      useEffect(() => {
        void refresh();
      }, [refresh]);

      const save = async () => {
        const value = secret.trim();
        if (!value) return;
        setBusy('save');
        setMessage('');
        try {
          const response = await fetch(`${BASE}/credential`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ mode, secret: value, projectId: mode === 'oauth' ? projectId.trim() : '' }),
          });
          const body = await readJson(response);
          if (!response.ok || !body.ok) throw new Error(body.message || `HTTP ${response.status}`);
          setData(body);
          setSecret('');
          if (body.authOk === false) {
            setMessage(body.authError || t.failed);
          } else {
            setMessage(t.saved);
          }
        } catch (error) {
          setMessage(error?.message || String(error));
        } finally {
          setBusy('');
        }
      };

      const clear = async () => {
        setBusy('clear');
        setMessage('');
        try {
          const response = await fetch(`${BASE}/credential`, { method: 'DELETE', headers: { accept: 'application/json' } });
          const body = await readJson(response);
          if (!response.ok || !body.ok) throw new Error(body.message || `HTTP ${response.status}`);
          setData(body);
          setSecret('');
          setProjectId('');
          setMessage('');
        } catch (error) {
          setMessage(error?.message || String(error));
        } finally {
          setBusy('');
        }
      };

      const reconnect = async () => {
        setBusy('reconnect');
        setMessage('');
        try {
          const response = await fetch(`${BASE}/reconnect`, { method: 'POST', headers: { accept: 'application/json' } });
          const body = await readJson(response);
          if (!response.ok || !body.ok) throw new Error(body.message || `HTTP ${response.status}`);
          setData(body);
          if (body.authOk === false) setMessage(body.authError || t.failed);
        } catch (error) {
          setMessage(error?.message || String(error));
        } finally {
          setBusy('');
        }
      };

      const rejection =
        message && /API keys are not supported/i.test(message)
          ? t.apiKeyRejected
          : message && /401|Unauthorized|invalid authentication/i.test(message)
            ? t.apiKeyRejected
            : '';

      if (loading && !data) {
        return h('div', { style: styles.page }, h('div', { style: styles.card }, '…'));
      }

      const tools = Array.isArray(data?.tools) ? data.tools : [];

      return h(
        'div',
        { style: styles.page },
        h(
          'div',
          { style: styles.card },
          h(
            'div',
            { style: styles.header },
            h('div', null, h('h3', { style: styles.title }, t.title), h('p', { style: styles.subtitle }, t.subtitle)),
            h(StatusPill, { data }),
          ),
          h(
            'div',
            { style: { ...styles.meta, marginTop: '14px' } },
            h('span', null, `${t.endpoint}: `, h('span', { style: styles.code }, data?.endpoint || '—')),
            h('span', null, `${data?.toolCount ?? 0} ${t.tools}`),
            h('span', null, `${data?.skillCount ?? 0} ${t.skills}`),
          ),
        ),
        h(
          'div',
          { style: styles.card },
          h('div', { style: { ...styles.label, marginBottom: '10px' } }, t.authMode),
          h(
            'div',
            { style: { ...styles.row, marginBottom: '14px' } },
            h('button', { type: 'button', style: styles.ghostButton(mode === 'api-key'), onClick: () => setMode('api-key') }, t.apiKey),
            h('button', { type: 'button', style: styles.ghostButton(mode === 'oauth'), onClick: () => setMode('oauth') }, t.oauth),
          ),
          h('label', { style: styles.label }, `${mode === 'oauth' ? t.oauth : t.apiKey}${data?.auth?.configured ? ` · ${data.auth.hint}` : ''}`),
          h(
            'div',
            { style: { position: 'relative' } },
            h('input', {
              type: showSecret ? 'text' : 'password',
              value: secret,
              autoComplete: 'off',
              spellCheck: false,
              placeholder: mode === 'oauth' ? t.oauthPlaceholder : t.apiKeyPlaceholder,
              style: styles.input,
              onChange: (event) => setSecret(event.target.value),
            }),
          ),
          h(
            'div',
            { style: { ...styles.row, marginTop: '8px', justifyContent: 'space-between' } },
            h(
              'button',
              { type: 'button', style: { ...styles.button(false), padding: '4px 10px', fontSize: '12px' }, onClick: () => setShowSecret((value) => !value) },
              showSecret ? '🙈' : '👁',
            ),
            data?.auth?.configured
              ? h('span', { style: styles.hint }, t.keyHint)
              : null,
          ),
          mode === 'oauth'
            ? h(
                'div',
                { style: { marginTop: '12px' } },
                h('label', { style: styles.label }, t.projectId),
                h('input', {
                  type: 'text',
                  value: projectId,
                  spellCheck: false,
                  style: styles.input,
                  onChange: (event) => setProjectId(event.target.value),
                }),
                h('div', { style: styles.hint }, t.projectIdHint),
              )
            : null,
          h(
            'div',
            { style: { ...styles.row, marginTop: '16px' } },
            h(
              'button',
              { type: 'button', style: styles.button(true), disabled: busy !== '' || secret.trim() === '', onClick: save },
              busy === 'save' ? t.saving : t.save,
            ),
            data?.configured
              ? h('button', { type: 'button', style: styles.button(false), disabled: busy !== '' || !data?.connected, onClick: reconnect }, t.reconnect)
              : null,
            data?.configured
              ? h('button', { type: 'button', style: styles.button(false), disabled: busy !== '', onClick: clear }, t.clear)
              : null,
            h(
              'a',
              { href: 'https://stitch.withgoogle.com/settings', target: '_blank', rel: 'noreferrer', style: { fontSize: '13px', marginLeft: 'auto' } },
              t.link,
            ),
          ),
          h('div', { style: styles.hint }, t.help),
          rejection ? h('div', { style: styles.error }, rejection) : null,
          !rejection && message && message !== t.saved ? h('div', { style: styles.error }, message) : null,
        ),
        tools.length > 0
          ? h(
              'div',
              { style: styles.card },
              h('div', { style: { ...styles.label, marginBottom: 0 } }, `${t.toolsList} (${tools.length})`),
              h(
                'div',
                { style: styles.toolList },
                tools.map((name) => h('span', { key: name, style: styles.code }, name)),
              ),
            )
          : null,
      );
    }

    return {
      name: 'dsh-stitch-client',
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('plugins.row.config', () =>
          ctx.slots.register({ name: 'plugins.row.config', key: ROW_KEY }, ConfigPage),
        );
      },
    };
  },
});
