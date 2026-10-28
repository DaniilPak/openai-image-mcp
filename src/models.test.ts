import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkParams, findModel } from './models.js';
import { slug, toImageRef } from './openai.js';

test('resolves dated snapshots to base model', () => {
  assert.equal(findModel('gpt-image-2-2026-04-21')?.id, 'gpt-image-2');
  assert.equal(findModel('gpt-image-2.5-flare-2026-09-08')?.id, 'gpt-image-2.5-flare');
  assert.equal(findModel('unknown-model'), undefined);
});

test('rejects retired models', () => {
  for (const model of ['gpt-image-1', 'dall-e-3', 'dall-e-2']) {
    assert.match(checkParams({ model }).errors[0], /gpt-image-2.5-flare/);
  }
});

test('xhigh/max only on 2.5 models', () => {
  assert.deepEqual(checkParams({ model: 'gpt-image-2.5-sunburst', quality: 'max' }).errors, []);
  assert.equal(checkParams({ model: 'gpt-image-2', quality: 'xhigh' }).errors.length, 1);
});

test('custom sizes', () => {
  assert.deepEqual(checkParams({ model: 'gpt-image-2', size: '1536x864' }).errors, []);
  assert.deepEqual(checkParams({ model: 'gpt-image-2.5-flare', size: '3840x2160' }).errors, []);
  assert.match(checkParams({ model: 'gpt-image-2', size: '1000x1000' }).errors[0], /multiples of 16/);
  assert.match(checkParams({ model: 'gpt-image-2', size: '3200x512' }).errors[0], /aspect ratio/);
  assert.match(checkParams({ model: 'gpt-image-2', size: '4096x2304' }).errors[0], /maximum/);
  assert.match(checkParams({ model: 'gpt-image-1.5', size: '1536x864' }).errors[0], /only supports/);
  assert.deepEqual(checkParams({ model: 'gpt-image-1.5', size: '1536x1024' }).errors, []);
  assert.ok(checkParams({ model: 'gpt-image-2', size: '3840x2160' }).notes.some((n) => /experimental/.test(n)));
});

test('transparent background needs png/webp', () => {
  assert.equal(
    checkParams({ model: 'gpt-image-2.5-flare', background: 'transparent', output_format: 'jpeg' }).errors.length,
    1
  );
  assert.ok(checkParams({ model: 'gpt-image-2', background: 'transparent' }).notes.some((n) => /preview/.test(n)));
});

test('input_fidelity per model', () => {
  assert.deepEqual(checkParams({ model: 'gpt-image-1.5', input_fidelity: 'high' }).errors, []);
  assert.equal(checkParams({ model: 'gpt-image-1-mini', input_fidelity: 'high' }).errors.length, 1);
  assert.match(checkParams({ model: 'gpt-image-2', input_fidelity: 'low' }).errors[0], /omit/);
});

test('unknown models pass through with a note', () => {
  const r = checkParams({ model: 'gpt-image-3', quality: 'max', size: '999x999' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.notes.length, 1);
});

test('image refs', async () => {
  assert.deepEqual(await toImageRef('file-abc123'), { file_id: 'file-abc123' });
  assert.deepEqual(await toImageRef('https://x.test/a.png'), { image_url: 'https://x.test/a.png' });
  await assert.rejects(toImageRef('/nope/missing.png'), /not found/);
  await assert.rejects(toImageRef('/nope/file.gif'), /Unsupported/);
});

test('slug', () => {
  assert.equal(slug('A cat, in space!'), 'a-cat-in-space');
  assert.equal(slug('日本'), 'image');
});
