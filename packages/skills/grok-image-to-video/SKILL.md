---
name: grok-image-to-video
description: "Animate a local image into a short mp4 video through Poiera using xAI Grok Imagine."
version: 1.0.0
author: Ekko
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [xAI, Grok, image-to-video, video-generation, media]
prerequisites:
  commands: [curl]
---

# Grok Image To Video

Use this skill when the user wants to animate a local image into a short video with xAI Grok Imagine.

Do not use any built-in image or video generation tool as a fallback. If the Poiera endpoint returns `401`, `403`, connection failure, or any other error, stop and report the error to the user.

## Workflow

Call the local Poiera media endpoint. Pass a local image path; the server will check for xAI credentials, read the file, convert it to a base64 data URI, call xAI, poll until completion, and optionally save the generated mp4.

Endpoint:

```bash
POST <Poiera base URL>/api/hermes/media/grok-image-to-video
```

Resolve the Poiera base URL in this order:

1. `POIERA_URL` environment variable, if set.
2. `http://127.0.0.1:${PORT}`, if `PORT` is set.
3. `http://127.0.0.1:8648` for local development.

When Poiera is running from the provided Docker Compose setup, the default external URL is `http://127.0.0.1:6060`.

Authentication:

The endpoint is protected by Poiera auth. Always send the Poiera server bearer token. This token is accepted only by Poiera media generation endpoints for agent skills; it is not a general login token.

Resolve the token in this order:

1. `AUTH_TOKEN` environment variable, if set.
2. `${POIERA_HOME}/.token`, if `POIERA_HOME` is set.
3. `~/.poiera/.token`.

Profile selection:

Use the current Hermes profile from the run instructions by sending `X-Hermes-Profile`.

If the run instructions include `[Current Hermes profile: <name>]`, include:

```bash
-H "X-Hermes-Profile: <name>"
```

Replace `<name>` with the exact profile name from the run instructions. Never send a placeholder value such as `<name>` or `<current-hermes-profile>`.

If no current profile is provided, omit the header and let the server fall back to the current Hermes active profile.

Required JSON fields:

- `image_path`: local path to a png, jpeg, or webp image.
- `prompt`: motion and style instructions for the generated video.

Optional JSON fields:

- `duration`: seconds, 1 to 15. Defaults to 8.
- `output_path`: local path where the server should save the mp4. If omitted, the server saves to `${POIERA_HOME:-~/.poiera}/media/<request_id>.mp4` and creates the `media` directory if needed.
- `timeout_ms`: maximum wait time. Defaults to 600000.

Example:

```bash
TOKEN="${AUTH_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -n "${POIERA_HOME:-}" ] && [ -f "$POIERA_HOME/.token" ]; then
  TOKEN="$(cat "$POIERA_HOME/.token")"
fi
if [ -z "$TOKEN" ] && [ -f "$HOME/.poiera/.token" ]; then
  TOKEN="$(cat "$HOME/.poiera/.token")"
fi
if [ -z "$TOKEN" ]; then
  echo "Missing Poiera token. Check AUTH_TOKEN, POIERA_HOME, or ~/.poiera/.token." >&2
  exit 1
fi

BASE_URL="${POIERA_URL:-}"
if [ -z "$BASE_URL" ]; then
  BASE_URL="http://127.0.0.1:${PORT:-8648}"
fi
BASE_URL="${BASE_URL%/}"

curl -sS -X POST "$BASE_URL/api/hermes/media/grok-image-to-video" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "image_path": "/absolute/path/to/input.png",
    "prompt": "Animate the subject with a slow cinematic push-in and subtle natural motion.",
    "duration": 8,
    "output_path": "/absolute/path/to/output.mp4"
  }'
```

If the response has `code: "missing_xai_token"`, tell the user to set `XAI_API_KEY` or complete xAI OAuth login in Poiera before retrying.

Return the generated `output_path`.
