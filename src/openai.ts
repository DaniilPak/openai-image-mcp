import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Background, InputFidelity, OutputFormat, Quality } from './models.js';

const expandHome = (p: string) => p.replace(/^~(?=$|\/)/, os.homedir());

export const OUTPUT_DIR = path.resolve(
  expandHome(process.env.OPENAI_IMAGE_OUTPUT_DIR ?? path.join(os.homedir(), 'Pictures', 'openai-image-mcp'))
);
export const DEFAULT_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2.5-flare';
const BASE_URL = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS ?? 10 * 60 * 1000);
const MAX_INPUT_BYTES = 50 * 1024 * 1024;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export interface CommonOptions {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: Quality;
  background?: Background;
  output_format?: OutputFormat;
  output_compression?: number;
  moderation?: 'auto' | 'low';
  safety_identifier?: string;
  /** Overrides OUTPUT_DIR for this call. */
  output_dir?: string;
  filename_prefix?: string;
}

export interface EditOptions extends CommonOptions {
  /** Local paths, http(s) URLs, data URLs, or OpenAI file IDs ("file-..."). */
  images: string[];
  mask?: string;
  input_fidelity?: InputFidelity;
}

export interface SavedImage {
  path: string;
  bytes: number;
  b64: string;
  mimeType: string;
}

export interface ImageResult {
  model: string;
  files: SavedImage[];
  size?: string;
  quality?: string;
  background?: string;
  output_format: OutputFormat;
  usage?: unknown;
}

interface ApiResponse {
  data?: { b64_json?: string; url?: string }[];
  size?: string;
  quality?: string;
  background?: string;
  output_format?: OutputFormat;
  usage?: unknown;
}

export async function generateImage(opts: CommonOptions): Promise<ImageResult> {
  const res = await post<ApiResponse>('/images/generations', requestBody(opts));
  return save(opts, res);
}

export async function editImage(opts: EditOptions): Promise<ImageResult> {
  const body: Record<string, unknown> = {
    ...requestBody(opts),
    images: await Promise.all(opts.images.map(toImageRef)),
    input_fidelity: opts.input_fidelity,
  };
  if (opts.mask) body.mask = await toImageRef(opts.mask);
  const res = await post<ApiResponse>('/images/edits', body);
  return save(opts, res);
}

function requestBody(o: CommonOptions): Record<string, unknown> {
  return {
    model: o.model,
    prompt: o.prompt,
    n: o.n,
    size: o.size,
    quality: o.quality,
    background: o.background,
    output_format: o.output_format,
    output_compression: o.output_compression,
    moderation: o.moderation,
    safety_identifier: o.safety_identifier,
  };
}

/** Converts a user-supplied image reference into the JSON shape /images/edits expects. */
export async function toImageRef(ref: string): Promise<{ image_url: string } | { file_id: string }> {
  if (/^file-[A-Za-z0-9_-]+$/.test(ref)) return { file_id: ref };
  if (/^(https?:|data:)/i.test(ref)) return { image_url: ref };

  const file = path.resolve(expandHome(ref));
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unsupported image type for ${file} (use png, jpg or webp).`);
  const stat = await fs.stat(file).catch(() => {
    throw new Error(`Image not found: ${file}`);
  });
  if (stat.size > MAX_INPUT_BYTES) throw new Error(`Image too large (>50 MB): ${file}`);
  const data = await fs.readFile(file);
  return { image_url: `data:${mime};base64,${data.toString('base64')}` };
}

async function post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set. Add it to the MCP server env.');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (process.env.OPENAI_ORG_ID) headers['OpenAI-Organization'] = process.env.OPENAI_ORG_ID;
  if (process.env.OPENAI_PROJECT_ID) headers['OpenAI-Project'] = process.env.OPENAI_PROJECT_ID;

  const res = await fetch(BASE_URL + endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body), // undefined fields are dropped
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const msg = json?.error?.message ?? (text.slice(0, 500) || res.statusText);
    throw new Error(`OpenAI API ${res.status}: ${msg}`);
  }
  return json as T;
}

async function save(opts: CommonOptions, res: ApiResponse): Promise<ImageResult> {
  const format = res.output_format ?? opts.output_format ?? 'png';
  const dir = path.resolve(expandHome(opts.output_dir ?? OUTPUT_DIR));
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix = slug(opts.filename_prefix || opts.prompt);
  const files: SavedImage[] = [];

  for (const [i, item] of (res.data ?? []).entries()) {
    let buf: Buffer;
    if (item.b64_json) buf = Buffer.from(item.b64_json, 'base64');
    else if (item.url) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
    else continue;
    const file = path.join(dir, `${stamp}-${prefix}${res.data!.length > 1 ? `-${i + 1}` : ''}.${format}`);
    await fs.writeFile(file, buf);
    files.push({ path: file, bytes: buf.length, b64: buf.toString('base64'), mimeType: `image/${format}` });
  }
  if (!files.length) throw new Error('OpenAI returned no images.');

  return {
    model: opts.model,
    files,
    size: res.size,
    quality: res.quality,
    background: res.background,
    output_format: format,
    usage: res.usage,
  };
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/, '') || 'image'
  );
}
