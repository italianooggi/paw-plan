# paw-plan 🐾

CLI for the **Paw Plan Widget** — a pixel art cat on your desktop that reflects your AI agent's work state in real time.

## Installation

```bash
npm install -g paw-plan
```

The widget must be running for commands to have effect. Start it from the [widget-trip-agent](https://github.com/italianooggi/widget-trip-agent) repo with `npm start`.

## Usage

### Vision + plan

```bash
paw-plan vision "Refactor the auth module"
paw-plan set-plan '[{"title":"Read current code"},{"title":"Write tests"},{"title":"Implement change"}]'
paw-plan sync task.md   # load plan from a markdown file with checkboxes
```

### Work state

```bash
paw-plan working      # editing files → attack animation
paw-plan running      # running tests/builds → run animation
paw-plan exploring    # reading files → walk animation
paw-plan thinking     # planning, waiting for API → idle animation
paw-plan climbing     # deep refactor, nested code → stairs animation
```

### Progress

```bash
paw-plan done 0       # mark task 0 complete (0-based index)
paw-plan done 1
paw-plan all-done     # everything done → festive celebration
```

### Needs user input

```bash
paw-plan waiting "need you to approve this change"
```

### Problems

```bash
paw-plan danger "about to drop the DB"   # hurt animation
paw-plan error "build exploded"          # die animation
paw-plan fall "changed approach"         # fall animation
```

### Passive states

```bash
paw-plan idle         # stop current animation
paw-plan sleeping     # long wait (> 30s)
paw-plan ping         # keep-alive, wakes the cat
```

## Typical flow

```
paw-plan ping
paw-plan vision "What we're building"
paw-plan set-plan '[{"title":"Step 1"},{"title":"Step 2"}]'
paw-plan exploring    # reading files
paw-plan working      # writing code
paw-plan done 0
paw-plan running      # running tests
paw-plan done 1
paw-plan all-done
```

## License

MIT
