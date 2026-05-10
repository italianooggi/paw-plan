# Engineering Guide — Paw Plan Widget

## Overview

This repo contains two independent but complementary pieces:

| Piece | Location | Nature |
|-------|----------|--------|
| **Widget** | repo root | Electron desktop app — the cat on screen |
| **paw-plan CLI** | `packages/paw-plan/` | npm package — what agents and users run |

They communicate over **WebSocket on port 9123**. The CLI sends events, the widget reacts visually.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  AI Agent / Developer (terminal)                    │
│                                                     │
│  paw-plan set-plan / done / working / all-done ...  │
└────────────────────┬────────────────────────────────┘
                     │ WebSocket ws://127.0.0.1:9123
                     ▼
┌─────────────────────────────────────────────────────┐
│  Electron Main Process  (src/main/main.js)          │
│                                                     │
│  • WebSocket server (ws package)                    │
│  • One BrowserWindow per projectId                  │
│  • Reads .paw-plan/state.json on window creation    │
│  • Routes messages via IPC to renderer              │
└────────────────────┬────────────────────────────────┘
                     │ Electron IPC (contextBridge)
                     ▼
┌─────────────────────────────────────────────────────┐
│  Renderer  (src/renderer/app.js)                    │
│                                                     │
│  • Canvas-based pixel art cat                       │
│  • Animation state machine                          │
│  • Plan/progress display                            │
│  • Drag, pergamino log, progress bar                │
└─────────────────────────────────────────────────────┘
```

### Key files

```
src/main/main.js          Electron main — WS server, window manager, IPC
src/main/preload.cjs      Context bridge — exposes electronAPI to renderer
src/renderer/app.js       All visual logic — canvas, animations, state
src/renderer/index.html   Widget HTML shell
src/renderer/style.css    Pergamino, footer, toast, progress bar
src/assets/               Spritesheet (pixelart_gato.webp), icons, tiles
packages/paw-plan/cli.js  CLI — parses commands, writes state, sends WS events
packages/paw-plan/        Separate git repo + npm package
sprite_scope.html         Spritesheet calibration tool (open in browser)
```

---

## Module system — critical constraint

**Never add `"type": "module"` to the root `package.json`.** Electron 33 requires CJS for the main process. All files under `src/main/` use `require()`. `preload.cjs` is explicitly `.cjs` — Electron sandboxing requirement.

`packages/paw-plan/` has its own `"type": "module"` because it runs outside Electron as a standard Node CLI.

---

## Running the widget

```bash
npm install
npm start
```

The widget starts silently — no windows open until an agent sends the first message or you run `paw-plan ping` from a project directory.

To bring it to a known state from any project:

```bash
paw-plan ping          # opens the cat window, restores saved plan if exists
paw-plan set-plan '[{"title":"Task 1"},{"title":"Task 2"}]'
```

---

## State persistence

Each project gets a `.paw-plan/` directory at its root (gitignored via `.paw-plan/.gitignore`).

```
your-project/
└── .paw-plan/
    ├── .gitignore      # contains: * / !.gitignore
    └── state.json      # source of truth for plan state
```

`state.json` schema:

```json
{
  "version": 1,
  "projectId": "...",
  "projectName": "...",
  "history": [
    {
      "startedAt": "ISO date",
      "endedAt": "ISO date",
      "status": "completed | partial | not-started",
      "pinned": false,
      "summary": {
        "headline": "≤100 chars",
        "outcome": "≤300 chars",
        "keyDecisions": []
      }
    }
  ],
  "current": {
    "startedAt": "ISO date",
    "vision": "...",
    "tasks": [{ "title": "...", "status": "pending | active | done" }],
    "discoveries": [{ "title": "...", "status": "done", "relatedTaskIndex": 0, "at": "ISO date" }],
    "blockers": [],
    "lastTouchedFiles": []
  }
}
```

**Limits:** history max 3 (pinned don't rotate), tasks max 8, discoveries max 20, headline ≤100 chars, outcome ≤300 chars, keyDecisions max 5.

**Flow on widget startup:** `paw-plan ping` → widget creates window → reads `state.json` → sends `RESTORE_STATE` to renderer → toast "Plan restaurado 🐾".

**Flow on plan replacement:** new `set-plan` → CLI archives current plan to history → widget shows toast "Plan reemplazado 🐾" (non-blocking, 3s).

---

## WebSocket protocol

All messages are JSON with at minimum `{ type, projectId, projectName, projectPath }`.

| type | direction | effect |
|------|-----------|--------|
| `PING` | CLI → widget | wake up, create window if needed |
| `SET_VISION` | CLI → widget | update vision text |
| `SET_PLAN` | CLI → widget | load new plan |
| `UPDATE_PROGRESS` | CLI → widget | mark task done |
| `ALL_DONE` | CLI → widget | festive celebration |
| `WORKING / RUNNING / EXPLORING / THINKING / CLIMBING` | CLI → widget | animation state |
| `WAITING_INPUT` | CLI → widget | urgent run animation |
| `SLEEPING / STOP` | CLI → widget | passive states |
| `MISTAKE / DANGER / PLAN_CHANGED` | CLI → widget | problem animations |
| `RESTORE_STATE` | main → renderer | hydrate from state.json |
| `GET_STATE` | CLI → widget | request current state (returns JSON) |
| `STATE` | widget → CLI | response to GET_STATE |

---

## paw-plan CLI — two repos, one package

`packages/paw-plan/` is a **separate git repository** with its own `origin` pointing to `https://github.com/italianooggi/paw-plan`. It lives inside this repo as a subdirectory but is **not tracked by the outer git**.

```
widget-trip-agent/   ← git repo A (this repo)
└── packages/
    └── paw-plan/    ← git repo B (separate, published to npm)
```

### Publishing a new CLI version

```bash
cd packages/paw-plan
git add cli.js README.md package.json
git commit -m "feat: description of change"
npm version minor          # or patch / major
npm publish --access public
cd ../..
```

After publishing, update the global install:
```bash
npm install -g paw-plan
```

### CLI development (local testing without publishing)

```bash
node packages/paw-plan/cli.js <command>
# example:
node packages/paw-plan/cli.js set-plan '[{"title":"Test"}]'
```

**Note on Windows PowerShell:** JSON quoting requires escaped double quotes or a variable:
```powershell
$plan = '[{"title":"Task A"},{"title":"Task B"}]'
paw-plan set-plan $plan
```
From bash (Claude Code, WSL, Git Bash) single quotes work normally.

---

## Git workflow — widget repo

### Branch strategy

```
main          ← stable, always runnable
feat/*        ← new features
fix/*         ← bug fixes
chore/*       ← deps, config, docs
```

### Typical feature flow

```bash
git checkout -b feat/my-feature
# work...
git add <files>
git commit -m "feat: description"
git push origin feat/my-feature
# open PR to main
```

### PR rules

- PRs merge into `main`
- One feature per PR
- Title follows conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- No build step required — Electron runs from source
- Test manually: `npm start` and run through the affected interactions

### What NOT to commit

```
.paw-plan/         # agent state — gitignored per project
dist/              # electron-builder output
node_modules/
```

---

## Building the installer

Requires the new dev dependency installed first:

```bash
npm install
npm run build        # generates dist/Paw Plan Widget Setup x.x.x.exe
```

The installer is per-user (no admin required), creates a Start Menu shortcut, and supports optional autostart via the system tray right-click menu.

**Icon note:** `src/assets/gato_solo.png` is used as the app icon. For best results in the Windows taskbar, a 256×256 version is recommended. Current pixel art size works but may appear blurry at large sizes.

---

## Onboarding a new developer

1. Clone the repo: `git clone https://github.com/italianooggi/paw-plan.git`  
   *(note: this is the paw-plan repo; the widget repo URL may differ)*
2. `npm install` at the root
3. `npm start` — widget appears in system tray
4. From any project directory: `paw-plan ping` to open the cat window
5. Read `AGENTS.md` for the full paw-plan protocol
6. Read `sprite_scope.html` (open in browser) if touching animations

### Key concepts to understand first

- **projectId** = base64 of `process.cwd()`, truncated to 10 chars. Each directory = one cat window.
- **Messages are buffered** if they arrive before the window finishes loading (`pendingMessages` map in main.js).
- **Animations use v2 spritesheet positions only** — the `animations` object in `app.js` maps state names to pixel coordinates in `pixelart_gato.webp`.
- **The renderer never talks back** except via the `GET_STATE` / `RESTORE_STATE` round-trip.

### Touching animations

Open `sprite_scope.html` in a browser. It shows the spritesheet with a grid and lets you calibrate `cellW`, `cellH`, `rowY`, `offsetX`, `offsetY` for each animation row. Copy the values into the `animations` object in `src/renderer/app.js`.

### Adding a new paw-plan command

1. Add the action to `ACTION_MAP` in `packages/paw-plan/cli.js`
2. Add the handler in the `switch` in `src/renderer/app.js`
3. If it affects state, update `updateState()` in cli.js and `RESTORE_STATE` hydration in app.js
4. Update `AGENTS.md`, `packages/paw-plan/README.md`, and both skill files

---

## System tray behavior

The widget runs as a tray app — no windows appear on startup. Windows are created on first WebSocket message per project. Closing all windows does NOT quit the app; use tray → Salir. "Iniciar con Windows" toggle calls `app.setLoginItemSettings()`.

---

## Skill files (AI agent instructions)

Two skill files teach AI agents how to use paw-plan:

| File | Language | Audience |
|------|----------|----------|
| `~/.claude/skills/paw-plan/SKILL.md` | English | Claude Code |
| `~/.claude/skills/gato-widget/SKILL.md` | Spanish | Same, Spanish sessions |

Both include: setup check → widget detection → request user to start if not running → full command reference.

`AGENTS.md` at the repo root is the universal version read by any AI coding tool (Gemini, OpenCode, etc.).
