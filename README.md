# openai-image-mcp

An MCP server for generating and editing images with the OpenAI Images API. You pick the model on each call. It works with Claude Code, Claude Desktop, Cursor, and any other MCP client.

- **Model choice on every call:** `gpt-image-2.5-flare` (the default), `gpt-image-2.5-sunburst`, `gpt-image-2`, `gpt-image-1.5`, `chatgpt-image-latest`, `gpt-image-1-mini`, and their dated snapshots
- **Generation and editing:** text-to-image; editing and compositing with up to 16 input images; optional masks
- **Current API features:** custom sizes up to 3840x2160, `xhigh`/`max` quality, transparent backgrounds, png/jpeg/webp output, `moderation`, `safety_identifier`
- **Checks before you pay:** a parameter the chosen model doesn't support, or a retired model, fails locally with a clear message. Model IDs that aren't in the catalog are passed through to the API unchecked, so new models work right away.
- **Images saved to disk:** the tool returns file paths and can also return the images inline for preview

Requires Node.js 20 or later and an [OpenAI API key](https://platform.openai.com/api-keys). Some models need [organization verification](https://help.openai.com/en/articles/10910291-api-organization-verification).

## Install

### Claude Code

```bash
claude mcp add openai-image -e OPENAI_API_KEY=sk-... -- npx -y openai-image-mcp
```

### Claude Desktop / Cursor / other clients

```json
{
  "mcpServers": {
    "openai-image": {
      "command": "npx",
      "args": ["-y", "openai-image-mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "OPENAI_IMAGE_MODEL": "gpt-image-2.5-flare"
      }
    }
  }
}
```

### From source

```bash
git clone https://github.com/DaniilPak/openai-image-mcp.git
cd openai-image-mcp && npm install && npm run build
claude mcp add openai-image -e OPENAI_API_KEY=sk-... -- node "$PWD/dist/index.js"
```

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — (required) | API key |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-flare` | Default model when a call doesn't specify one |
| `OPENAI_IMAGE_OUTPUT_DIR` | `~/Pictures/openai-image-mcp` | Where images are saved |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Proxy or compatible endpoint |
| `OPENAI_ORG_ID` / `OPENAI_PROJECT_ID` | — | Sent as `OpenAI-Organization` / `OpenAI-Project` |
| `OPENAI_IMAGE_TIMEOUT_MS` | `600000` | Request timeout |

## Tools

### `generate_image`

| Param | Notes |
|---|---|
| `prompt` | Required, up to 32,000 characters |
| `model` | Any model ID; defaults to `OPENAI_IMAGE_MODEL` |
| `size` | `auto`, `1024x1024`, `1536x1024`, `1024x1536`; on gpt-image-2 and the 2.5 models, any `WxH` with both sides multiples of 16, aspect ratio between 1:3 and 3:1, and at most 3840x2160 (sizes above 2560x1440 are experimental) |
| `quality` | `auto`, `low`, `medium`, `high`; the 2.5 models also accept `xhigh` and `max` |
| `background` | `auto`, `opaque`, `transparent` (transparent needs png or webp output) |
| `output_format` / `output_compression` | `png`, `jpeg`, `webp`; compression is 0–100 and applies to jpeg/webp only |
| `n` | 1–10 |
| `moderation` | `auto` or `low` |
| `output_dir`, `filename_prefix` | Override where and under what name images are saved |
| `include_images` | Also return the images inline. Off by default because the data is large. |

### `edit_image`

Takes everything `generate_image` takes, plus:

| Param | Notes |
|---|---|
| `images` | 1–16 local paths (png/jpg/webp), http(s) URLs, data URLs, or OpenAI file IDs (`file-...`) |
| `mask` | Optional PNG whose transparent pixels mark the area to edit |
| `input_fidelity` | `low` or `high` on gpt-image-1.5 and chatgpt-image-latest; only `low` on gpt-image-1-mini; leave it out on gpt-image-2 and newer |

### `list_models`

Returns the model catalog with each model's capabilities, the default model, and the retired models.

## Models

| Model | Best for | Custom sizes | xhigh/max | Transparent |
|---|---|---|---|---|
| `gpt-image-2.5-flare` | Fast everyday generation (default) | ✓ | ✓ | ✓ |
| `gpt-image-2.5-sunburst` | Premium quality, precise edits | ✓ | ✓ | ✓ |
| `gpt-image-2` | General use, high-fidelity inputs | ✓ | — | preview |
| `gpt-image-1.5` / `chatgpt-image-latest` | Fixed sizes, `input_fidelity` | — | — | ✓ |
| `gpt-image-1-mini` | Lowest cost | — | — | ✓ |

Retired models are rejected with a suggested replacement: `gpt-image-1` (shut down 2026-10-23), and `dall-e-2` and `dall-e-3` (removed 2026-05-12).

The catalog follows the [Images API reference](https://developers.openai.com/api/reference/resources/images/methods/generate) and [changelog](https://developers.openai.com/api/docs/changelog) as of October 2026.

## Example prompts

- "Generate a 1920x1088 hero image of a misty mountain lake at dawn with gpt-image-2.5-sunburst, max quality"
- "Make a transparent-background webp logo of a fox, 1024x1024"
- "Edit ~/Desktop/room.jpg: replace the sofa with a green velvet one, keep everything else"

## Development

```bash
npm install
npm test      # build + unit tests
npm run dev   # tsc --watch
```

## License

[MIT](LICENSE)
