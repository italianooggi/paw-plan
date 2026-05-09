# widget-trip-agent — Antigravity/Gemini Context

See `AGENTS.md` for the full paw-plan work protocol. It applies to you too.

## Project summary

Electron desktop widget with a pixel art cat that reflects AI agent work state.
Controlled via `paw-plan` CLI (WebSocket on port 9123).

## Stack

- Electron 33 (CJS main process — no ESM in root)
- Vanilla JS canvas renderer (no framework)
- WebSocket server (`ws` package) for agent communication
- `paw-plan` npm package for CLI control

## What to be aware of

- Never add `"type": "module"` to the root `package.json` — breaks Electron
- `preload.cjs` must stay `.cjs` — Electron sandboxing requirement
- `packages/paw-plan/` is a separate git repo with its own npm publish cycle
- Animations use only the v2 spritesheet positions in `src/renderer/app.js`
