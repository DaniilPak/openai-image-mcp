// Model catalog and client-side parameter checks, based on the OpenAI Images API
// reference (developers.openai.com/api/reference/resources/images) as of 2026-10.

export type Quality = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Background = 'auto' | 'opaque' | 'transparent';
export type OutputFormat = 'png' | 'jpeg' | 'webp';
export type InputFidelity = 'low' | 'high';

export interface ModelInfo {
  id: string;
  summary: string;
  /** Any WIDTHxHEIGHT (multiples of 16, 1:3–3:1, up to 3840x2160) instead of the fixed presets. */
  customSizes: boolean;
  qualities: Quality[];
  transparent: boolean | 'preview';
  /** Accepted input_fidelity values on edits; empty = the parameter must be omitted. */
  inputFidelity: InputFidelity[];
}

const BASE_QUALITIES: Quality[] = ['auto', 'low', 'medium', 'high'];
const MAX_QUALITIES: Quality[] = [...BASE_QUALITIES, 'xhigh', 'max'];

export const MODELS: ModelInfo[] = [
  {
    id: 'gpt-image-2.5-flare',
    summary: 'Newest (Sep 2026). Fast, default choice for everyday generation.',
    customSizes: true,
    qualities: MAX_QUALITIES,
    transparent: true,
    inputFidelity: [],
  },
  {
    id: 'gpt-image-2.5-sunburst',
    summary: 'Newest (Sep 2026). Premium quality, best for precise edits.',
    customSizes: true,
    qualities: MAX_QUALITIES,
    transparent: true,
    inputFidelity: [],
  },
  {
    id: 'gpt-image-2',
    summary: 'Apr 2026. Flexible sizes, high-fidelity image inputs. Transparent background in preview.',
    customSizes: true,
    qualities: BASE_QUALITIES,
    transparent: 'preview',
    inputFidelity: [],
  },
  {
    id: 'gpt-image-1.5',
    summary: 'Dec 2025. Fixed sizes; supports input_fidelity high/low on edits.',
    customSizes: false,
    qualities: BASE_QUALITIES,
    transparent: true,
    inputFidelity: ['low', 'high'],
  },
  {
    id: 'chatgpt-image-latest',
    summary: 'Alias tracking the image model used in ChatGPT. Fixed sizes.',
    customSizes: false,
    qualities: BASE_QUALITIES,
    transparent: true,
    inputFidelity: ['low', 'high'],
  },
  {
    id: 'gpt-image-1-mini',
    summary: 'Oct 2025. Cheapest. Fixed sizes; input_fidelity low only.',
    customSizes: false,
    qualities: BASE_QUALITIES,
    transparent: true,
    inputFidelity: ['low'],
  },
];

export const RETIRED: Record<string, string> = {
  'gpt-image-1': 'shut down on 2026-10-23',
  'dall-e-2': 'removed from the API on 2026-05-12',
  'dall-e-3': 'removed from the API on 2026-05-12',
};

export const PRESET_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'] as const;
const MAX_EDGE = 3840;
const MAX_PIXELS = 3840 * 2160;
const EXPERIMENTAL_PIXELS = 2560 * 1440;

/** Resolves dated snapshots like `gpt-image-2-2026-04-21` to their base model. */
export function findModel(id: string): ModelInfo | undefined {
  const base = id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  return MODELS.find((m) => m.id === base);
}

export interface ImageParams {
  model: string;
  size?: string;
  quality?: Quality;
  background?: Background;
  output_format?: OutputFormat;
  output_compression?: number;
  input_fidelity?: InputFidelity;
}

/**
 * Returns human-readable problems (empty = OK) and non-fatal notes.
 * Unknown model IDs pass through unchecked so new models work without a release.
 */
export function checkParams(p: ImageParams): { errors: string[]; notes: string[] } {
  const errors: string[] = [];
  const notes: string[] = [];
  const base = p.model.replace(/-\d{4}-\d{2}-\d{2}$/, '');

  if (RETIRED[base]) {
    errors.push(
      `Model "${p.model}" was ${RETIRED[base]}. Use gpt-image-2.5-flare or gpt-image-2.5-sunburst.`
    );
    return { errors, notes };
  }

  if (p.background === 'transparent' && p.output_format === 'jpeg') {
    errors.push('background "transparent" requires output_format "png" or "webp".');
  }
  if (p.output_compression !== undefined && (p.output_format ?? 'png') === 'png') {
    notes.push('output_compression only applies to jpeg/webp; ignored for png.');
  }

  if (p.size && p.size !== 'auto' && !/^\d+x\d+$/.test(p.size)) {
    errors.push(`size "${p.size}" must be "auto" or WIDTHxHEIGHT, e.g. "1536x864".`);
  }

  const model = findModel(p.model);
  if (!model) {
    notes.push(`"${p.model}" is not in the built-in catalog; parameters were sent unchecked.`);
    return { errors, notes };
  }

  if (p.quality && !model.qualities.includes(p.quality)) {
    errors.push(`quality "${p.quality}" is not supported by ${model.id} (use ${model.qualities.join(', ')}).`);
  }
  if (p.background === 'transparent' && model.transparent === 'preview') {
    notes.push(`Transparent backgrounds are in preview for ${model.id}.`);
  }
  if (p.input_fidelity && !model.inputFidelity.includes(p.input_fidelity)) {
    errors.push(
      model.inputFidelity.length
        ? `input_fidelity "${p.input_fidelity}" is not supported by ${model.id} (use ${model.inputFidelity.join(', ')}).`
        : `${model.id} does not accept input_fidelity; omit it.`
    );
  }

  if (p.size && /^\d+x\d+$/.test(p.size)) {
    if (!model.customSizes) {
      if (!(PRESET_SIZES as readonly string[]).includes(p.size)) {
        errors.push(`${model.id} only supports sizes ${PRESET_SIZES.join(', ')}.`);
      }
    } else {
      errors.push(...checkCustomSize(p.size));
      const [w, h] = p.size.split('x').map(Number);
      if (w * h > EXPERIMENTAL_PIXELS) notes.push('Resolutions above 2560x1440 are experimental.');
    }
  }

  return { errors, notes };
}

export function checkCustomSize(size: string): string[] {
  const [w, h] = size.split('x').map(Number);
  const errors: string[] = [];
  if (w % 16 || h % 16) errors.push(`size ${size}: width and height must be multiples of 16.`);
  if (Math.max(w, h) / Math.min(w, h) > 3) errors.push(`size ${size}: aspect ratio must be between 1:3 and 3:1.`);
  if (Math.max(w, h) > MAX_EDGE || w * h > MAX_PIXELS) errors.push(`size ${size}: maximum is 3840x2160.`);
  return errors;
}
