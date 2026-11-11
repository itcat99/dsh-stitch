const str = (description) => ({ type: 'string', description });
const obj = (description) => ({ type: 'object', description, additionalProperties: true });
const strArray = (description) => ({ type: 'array', items: { type: 'string' }, description });
const objArray = (description) => ({ type: 'array', items: { type: 'object', additionalProperties: true }, description });

const DEVICE = {
  type: 'string',
  enum: ['DEVICE_TYPE_UNSPECIFIED', 'MOBILE', 'DESKTOP', 'TABLET', 'AGNOSTIC'],
  description: 'Target device type.',
};
const MODEL = {
  type: 'string',
  description: 'Optional model id, for example GEMINI_3_FLASH or GEMINI_3_1_PRO.',
};

/** Compact, hand-written parameter schemas for the Stitch MCP tool surface. */
export const TOOL_SPECS = [
  {
    name: 'create_project',
    description: 'Create a new Stitch project container for UI designs.',
    parameters: { type: 'object', properties: { title: str('Project display name.') }, required: ['title'] },
  },
  {
    name: 'get_project',
    description: 'Get one Stitch project by resource name, including its screens.',
    parameters: { type: 'object', properties: { name: str('Project resource name, e.g. projects/123.') }, required: ['name'] },
  },
  {
    name: 'update_project',
    description: 'Update a Stitch project title, background theme, visibility, or screen instances.',
    parameters: {
      type: 'object',
      properties: {
        name: str('Project resource name.'),
        title: str('New title.'),
        updateMask: str('Comma-separated field mask, e.g. "title".'),
        visibility: str('Project visibility.'),
        backgroundTheme: obj('Background theme object.'),
        screenInstances: objArray('Screen instance objects.'),
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a Stitch project permanently.',
    parameters: { type: 'object', properties: { name: str('Project resource name.') }, required: ['name'] },
  },
  {
    name: 'list_projects',
    description: 'List Stitch projects visible to the current credential. Use this to discover project ids.',
    parameters: { type: 'object', properties: { filter: str('Optional filter, e.g. owned or shared.') } },
  },
  {
    name: 'list_screens',
    description: 'List all screens in a Stitch project.',
    parameters: { type: 'object', properties: { projectId: str('Project id without the projects/ prefix.') }, required: ['projectId'] },
  },
  {
    name: 'get_screen',
    description: 'Get one screen by resource name, including its HTML download URL and screenshot URL.',
    parameters: { type: 'object', properties: { name: str('Screen resource name, e.g. projects/1/screens/2.') }, required: ['name'] },
  },
  {
    name: 'update_screen',
    description: 'Replace a screen HTML or screenshot payload.',
    parameters: {
      type: 'object',
      properties: {
        name: str('Screen resource name.'),
        htmlCodeBase64: str('Base64-encoded HTML.'),
        screenshotBase64: str('Base64-encoded screenshot.'),
        updateMask: str('Comma-separated field mask.'),
      },
      required: ['name'],
    },
  },
  {
    name: 'download_file',
    description: 'Download a Stitch file resource by name.',
    parameters: { type: 'object', properties: { name: str('File resource name.') }, required: ['name'] },
  },
  {
    name: 'generate_screen_from_text',
    description:
      'Generate a new Stitch screen from a text prompt. Enhance the prompt first (layout, sections, content; no colors/fonts) and pass a design system when the project has one.',
    parameters: {
      type: 'object',
      properties: {
        projectId: str('Project id without the projects/ prefix.'),
        prompt: str('Enhanced generation prompt.'),
        designSystem: str('Optional design system asset name.'),
        deviceType: DEVICE,
        modelId: MODEL,
      },
      required: ['projectId', 'prompt'],
    },
    timeoutMs: 300000,
  },
  {
    name: 'edit_screens',
    description: 'Edit one or more existing Stitch screens with a targeted text prompt.',
    parameters: {
      type: 'object',
      properties: {
        projectId: str('Project id.'),
        selectedScreenIds: strArray('Screen ids to edit.'),
        prompt: str('Specific edit instruction.'),
        deviceType: DEVICE,
        modelId: MODEL,
      },
      required: ['projectId', 'selectedScreenIds', 'prompt'],
    },
    timeoutMs: 300000,
  },
  {
    name: 'generate_variants',
    description: 'Generate design variants for existing Stitch screens.',
    parameters: {
      type: 'object',
      properties: {
        projectId: str('Project id.'),
        selectedScreenIds: strArray('Screen ids to vary.'),
        prompt: str('Direction for the variants.'),
        deviceType: DEVICE,
        modelId: MODEL,
        variantOptions: obj('Variant options: variantCount 1-5, creativeRange REFINE|EXPLORE|REIMAGINE, aspects array.'),
      },
      required: ['projectId', 'selectedScreenIds', 'prompt'],
    },
    timeoutMs: 300000,
  },
  {
    name: 'upload_design_md',
    description: 'Upload a DESIGN.md document to a Stitch project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: str('Project id.'),
        designMdBase64: str('Base64-encoded DESIGN.md content. Prefer the native stitch_upload_screen tool for local files.'),
      },
      required: ['projectId', 'designMdBase64'],
    },
  },
  {
    name: 'create_design_system',
    description: 'Create a Stitch design system with colors, typography, spacing, and component tokens.',
    parameters: {
      type: 'object',
      properties: {
        projectId: str('Optional project id to associate with.'),
        designSystem: obj('Design system object: displayName, theme (colors, fonts, roundness, spacing), designTokens.'),
      },
      required: ['designSystem'],
    },
  },
  {
    name: 'create_design_system_from_design_md',
    description: 'Create a Stitch design system from a project DESIGN.md and optional screen instance.',
    parameters: {
      type: 'object',
      properties: {
        projectId: str('Project id.'),
        deviceType: DEVICE,
        selectedScreenInstance: obj('Optional screen instance object from get_project.'),
      },
      required: ['projectId'],
    },
  },
  {
    name: 'update_design_system',
    description: 'Update an existing Stitch design system.',
    parameters: {
      type: 'object',
      properties: {
        name: str('Design system asset resource name.'),
        projectId: str('Project id.'),
        designSystem: obj('Updated design system object.'),
      },
      required: ['name', 'projectId', 'designSystem'],
    },
  },
  {
    name: 'list_design_systems',
    description: 'List design systems, optionally for one project.',
    parameters: { type: 'object', properties: { projectId: str('Optional project id.') } },
  },
  {
    name: 'apply_design_system',
    description: 'Apply a design system asset to one or more screen instances.',
    parameters: {
      type: 'object',
      properties: {
        projectId: str('Project id.'),
        assetId: str('Design system asset id from list_design_systems.'),
        selectedScreenInstances: objArray('Screen instances to update, as returned by get_project.'),
      },
      required: ['projectId', 'assetId', 'selectedScreenInstances'],
    },
  },
];

export const NATIVE_UPLOAD_SPEC = {
  name: 'stitch_upload_screen',
  description:
    'Upload a local image, HTML file, or DESIGN.md into a Stitch project without emitting base64 through the model. Reads the file from the session workspace and posts it to Stitch with the configured credential.',
  parameters: {
    type: 'object',
    properties: {
      project_id: str('Stitch project id.'),
      file_path: str('Workspace-relative or absolute-inside-workspace path.'),
      title: str('Optional screen title.'),
      generated_by: str('Optional generatedBy marker for HTML/Markdown uploads.'),
    },
    required: ['project_id', 'file_path'],
  },
};
