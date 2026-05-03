# paw-plan 🐾

CLI notifier for the **Agent Journey Widget**. Sends real-time status events from AI agents to the widget for visual progress tracking.

## Installation

```bash
npm install -g paw-plan
```

## Usage

Ensure the **Agent Journey Widget** is running (default port 9123).

### 1. Syncing a Plan
The CLI can parse a Markdown file (like `task.md` or `implementation_plan.md`) and generate a journey map in the widget.

```bash
paw-plan sync task.md
```

### 2. Updating Progress
Mark a task as completed by index (0-based).

```bash
paw-plan done 0 "Finished research"
```

### 3. Status Animations
Trigger specific animations for the character:

```bash
paw-plan working    # Animation: attack
paw-plan exploring  # Animation: walk
paw-plan error "..." # Animation: die
paw-plan ping       # Wake up the widget
```

## License
MIT
