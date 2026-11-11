# dsh-stitch

Google Stitch for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

- A settings panel for the Stitch credential (API key or OAuth access token).
- The complete Stitch MCP tool surface, registered as native tools named
  `mcp__stitch__<tool>`.
- A native `stitch_upload_screen` tool for local images, HTML, and DESIGN.md
  files, so base64 never passes through the model.
- The official [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills)
  Agent Skills, vendored and registered as `stitch-*` skills.

Credentials live in the DSH credential store. They are never written to
`cordis.patch.yml`, logs, tool results, or the settings UI.

## Install

```bash
# from this directory, with a DSH profile
dsh plugin install .        # or use the Plugin Manager UI
```

Or through the agent-facing Plugin Manager: install this directory as a bundle,
then restart the session if DSH asks for it. The bundle inserts one `dsh-stitch`
row with no credential.

## Configure

Open **Settings → Plugins → Google Stitch** and fill the credential.

| Mode | Header | When to use |
| --- | --- | --- |
| API key | `X-Goog-Api-Key` | The setup shown in the Stitch MCP docs. Create a key at <https://stitch.withgoogle.com/settings>. |
| OAuth access token | `Authorization: Bearer …` + optional `X-Goog-User-Project` | Use when the endpoint reports `API keys are not supported by this API`. Get a short-lived token with `gcloud auth application-default print-access-token`; set the Google Cloud project ID. |

The live `https://stitch.googleapis.com/mcp` endpoint currently accepts
`initialize` and `tools/list` without auth but rejects API-key-authenticated
`tools/call` with `API keys are not supported by this API`. The panel surfaces
that message and offers the OAuth mode; both modes are implemented, so a
deployment or key that does accept API keys works unchanged.

OAuth tokens expire (usually after an hour). Return to the panel and paste a
fresh token.

## Tools

The plugin discovers the server's tool list at connect time. With the current
server that is:

| Tool | Purpose |
| --- | --- |
| `mcp__stitch__create_project` / `get_project` / `update_project` / `delete_project` / `list_projects` | Project management |
| `mcp__stitch__list_screens` / `get_screen` / `update_screen` / `download_file` | Screen management |
| `mcp__stitch__generate_screen_from_text` | Generate a screen from a prompt |
| `mcp__stitch__edit_screens` / `generate_variants` | Edit or vary existing screens |
| `mcp__stitch__upload_design_md` | Upload DESIGN.md through MCP |
| `mcp__stitch__create_design_system` / `create_design_system_from_design_md` / `update_design_system` / `list_design_systems` / `apply_design_system` | Design systems |
| `stitch_upload_screen` | Native upload of a workspace image/HTML/MD file |

Parameter schemas are intentionally compact; nested objects accept the Stitch
API shape described by the upstream tool schema.

## Skills

16 skills from the Apache-2.0 `stitch-skills` repository are registered with
`ctx.skills.register`, grouped as:

- **design**: generate-design, manage-design-system, extract-design-md,
  extract-static-html, code-to-design, upload-to-stitch
- **build**: react-components, react-native, react-vite-dashboard, remotion,
  shadcn-ui
- **utilities**: design-md, enhance-prompt, site-md, stitch-loop, taste-design

Each skill is loaded with its original `SKILL.md`, references, examples, and
scripts, plus a short DSH runtime preamble that maps the MCP tool prefix and
forbids scavenging credentials. `upload-to-stitch` was adapted to call
`stitch_upload_screen` instead of the Python API-key script. See
`skills/NOTICE` for the pinned commit and local modifications.

Toggle groups with the `skillGroups` config field; disable all with
`enableSkills: false`.

## Configuration

| Field | Default | Meaning |
| --- | --- | --- |
| `apiUrl` | `https://stitch.googleapis.com/mcp` | MCP endpoint |
| `apiBase` | `https://stitch.googleapis.com` | REST base for `stitch_upload_screen` |
| `toolCallTimeoutMs` | `180000` | Per-call timeout; generation tools also declare a 300 s cooperative timeout |
| `enableSkills` | `true` | Register the bundled skills |
| `skillGroups` | `design`, `build`, `utilities` | Skill groups to register |
| `autoConnect` | `true` | Connect at startup when a credential exists |
| `maxUploadBytes` | `20971520` | Upload size limit (20 MiB) |

Environment fallback (when no stored record exists) is `STITCH_API_KEY`,
`STITCH_ACCESS_TOKEN`, and `STITCH_PROJECT_ID`. A stored record always wins.

## Security

- The credential is stored as a `grant` record at `dsh-stitch/auth` through
  `ctx.credentials.modifyRecord`; the local store writes it to the profile's
  credentials file with owner-only permissions.
- `GET /api/dsh-stitch/status` reports only mode, configured state, a four
  character hint, and the project ID.
- Uploads are restricted to files inside the session workspace and the
  configured size limit.
- No credential is logged. MCP errors are passed through with the credential
  redacted by construction (it only appears in request headers).

## Development

```bash
npm run check
node --test test/*.test.mjs
```

`skills/manifest.json` records the upstream commit. To refresh the vendored
skills, copy the `plugins/*/skills/*` directories from a new upstream checkout
and update the manifest and `NOTICE`.

## License

MIT for the plugin. Vendored skills are Apache-2.0; see `skills/LICENSE` and
`skills/NOTICE`.
