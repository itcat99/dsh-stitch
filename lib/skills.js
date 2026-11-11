import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url));

const PREAMBLE = `> **DSH runtime context (added by dsh-stitch)**
>
> - Stitch MCP tools are registered under the prefix \`mcp__stitch__\`: for
>   example \`mcp__stitch__list_projects\`,
>   \`mcp__stitch__generate_screen_from_text\`, \`mcp__stitch__get_screen\`.
>   They are already in the tool list; do not search MCP config files and do
>   not ask for a tool prefix.
> - The Stitch credential is managed by DSH. Never ask the user to paste it
>   into the conversation.
> - For local uploads use the native \`stitch_upload_screen\` tool instead of
>   scripts that need \`--api-key\`.
> - Write generated artifacts under the session workspace (the project root),
>   normally in \`.stitch/\`.
> - Resolve relative resource paths against the base directory named in
>   \`<skill_resources>\`.

`;

function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return text;
  const after = text.indexOf('\n', end + 4);
  return after === -1 ? '' : text.slice(after + 1);
}

async function readManifest() {
  const text = await fs.readFile(path.join(SKILLS_DIR, 'manifest.json'), 'utf8');
  return JSON.parse(text);
}

export async function registerStitchSkills(ctx, options) {
  const skills = ctx.get('skills');
  if (!skills || typeof skills.register !== 'function') {
    return { count: 0, dispose: () => {}, warning: 'skills service is not mounted' };
  }
  const manifest = await readManifest();
  const groups = new Set(options.groups ?? ['design', 'build', 'utilities']);
  const disposers = [];
  let count = 0;
  for (const entry of manifest.skills) {
    if (!groups.has(entry.group)) continue;
    const directory = path.join(SKILLS_DIR, entry.dir);
    let body;
    try {
      body = await fs.readFile(path.join(directory, 'SKILL.md'), 'utf8');
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-stitch] cannot read skill ${entry.name}: ${error?.message || error}`);
      continue;
    }
    const content = `${PREAMBLE}${stripFrontmatter(body).trimStart()}`;
    try {
      disposers.push(
        skills.register({
          name: entry.name,
          description: entry.description,
          whenToUse: entry.description,
          content,
          source: `dsh-stitch (google-labs-code/stitch-skills@${manifest.commit.slice(0, 7)})`,
          resourceBase: { kind: 'directory', path: directory },
          invocation: { modelInvocable: true, userInvocable: true },
        }),
      );
      count += 1;
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-stitch] cannot register skill ${entry.name}: ${error?.message || error}`);
    }
  }
  return {
    count,
    dispose: () => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose();
        } catch {
          // Disposal is best effort.
        }
      }
    },
  };
}
