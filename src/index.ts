#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MODELS, RETIRED, checkParams } from './models.js';
import { DEFAULT_MODEL, OUTPUT_DIR, editImage, generateImage, type ImageResult } from './openai.js';

const server = new McpServer({ name: 'openai-image', version: '1.0.0' });

const fail = (err: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
});

const modelList = MODELS.map((m) => m.id).join(', ');

const common = {
  prompt: z.string().min(1).max(32000).describe('What to generate. Describe style in the prompt.'),
  model: z
    .string()
    .default(DEFAULT_MODEL)
    .describe(
      `OpenAI image model. Known: ${modelList}. Dated snapshots (e.g. gpt-image-2-2026-04-21) also work. ` +
        `Default: ${DEFAULT_MODEL}. Call list_models for capabilities.`
    ),
  size: z
    .string()
    .optional()
    .describe(
      '"auto", "1024x1024", "1536x1024" (landscape), "1024x1536" (portrait). gpt-image-2 and 2.5 models also accept ' +
        'any WIDTHxHEIGHT: multiples of 16, aspect 1:3–3:1, max 3840x2160 (e.g. "1920x1088", "3840x2160").'
    ),
  quality: z
    .enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
    .optional()
    .describe('Default "auto". xhigh and max are only on gpt-image-2.5-flare / -sunburst.'),
  background: z
    .enum(['auto', 'opaque', 'transparent'])
    .optional()
    .describe('"transparent" needs output_format png or webp.'),
  output_format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Default png.'),
  output_compression: z.number().int().min(0).max(100).optional().describe('0–100, jpeg/webp only.'),
  n: z.number().int().min(1).max(10).optional().describe('Number of images (1–10). Default 1.'),
  moderation: z.enum(['auto', 'low']).optional().describe('"low" = less restrictive filtering.'),
  output_dir: z.string().optional().describe(`Where to save files. Default ${OUTPUT_DIR}.`),
  filename_prefix: z.string().optional().describe('File name prefix. Defaults to a slug of the prompt.'),
  include_images: z
    .boolean()
    .default(false)
    .describe('Also return the images inline so the client can display them. Large; off by default.'),
};

function toContent(result: ImageResult, notes: string[], includeImages: boolean) {
  const summary = {
    model: result.model,
    files: result.files.map((f) => ({ path: f.path, bytes: f.bytes })),
    size: result.size,
    quality: result.quality,
    background: result.background,
    output_format: result.output_format,
    usage: result.usage,
    ...(notes.length ? { notes } : {}),
  };
  const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [
    { type: 'text', text: JSON.stringify(summary, null, 2) },
  ];
  if (includeImages) {
    for (const f of result.files) content.push({ type: 'image', data: f.b64, mimeType: f.mimeType });
  }
  return { content };
}

function validate(params: Parameters<typeof checkParams>[0]) {
  const { errors, notes } = checkParams(params);
  if (errors.length) throw new Error(errors.join('\n'));
  return notes;
}

server.registerTool(
  'generate_image',
  {
    title: 'Generate image (OpenAI)',
    description:
      'Generate images from a text prompt with the OpenAI Images API. Choose the model per call. ' +
      'Images are saved to disk and their paths returned.',
    inputSchema: common,
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ include_images, ...opts }) => {
    try {
      const notes = validate(opts);
      return toContent(await generateImage(opts), notes, include_images);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'edit_image',
  {
    title: 'Edit image (OpenAI)',
    description:
      'Edit or combine existing images with a prompt (e.g. "put the product from image 1 on the background from image 2"). ' +
      'Optional mask: transparent pixels mark the area to change. Results are saved to disk.',
    inputSchema: {
      ...common,
      images: z
        .array(z.string())
        .min(1)
        .max(16)
        .describe('1–16 input images: local file paths (png/jpg/webp), http(s) URLs, data URLs, or OpenAI file IDs.'),
      mask: z
        .string()
        .optional()
        .describe('Mask image (same forms as images). PNG with alpha; same size as the first image.'),
      input_fidelity: z
        .enum(['low', 'high'])
        .optional()
        .describe('How closely to preserve input details/faces. gpt-image-1.5: low|high; gpt-image-1-mini: low; omit for gpt-image-2+.'),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ include_images, ...opts }) => {
    try {
      const notes = validate(opts);
      return toContent(await editImage(opts), notes, include_images);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'list_models',
  {
    title: 'List OpenAI image models',
    description: 'List supported OpenAI image models with their capabilities, the default model, and retired models.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => ({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ default: DEFAULT_MODEL, output_dir: OUTPUT_DIR, models: MODELS, retired: RETIRED }, null, 2),
      },
    ],
  })
);

await server.connect(new StdioServerTransport());
console.error(`openai-image MCP server running (default model: ${DEFAULT_MODEL}, output: ${OUTPUT_DIR})`);
