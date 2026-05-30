# paw-plan — Agent Work Protocol

This repo contains a pixel art cat widget that lives on the desktop and reflects
your work state in real time. **Using this protocol is mandatory on any task with more than one step.**

The cat reacts to what you're doing. It sees when you're coding, when you find an error,
when you finish something important. If you ignore it, it falls asleep.

---

## Setup

```bash
paw-plan ping 2>/dev/null || npm install -g paw-plan
```

The widget must be running (`npm start` in this repo) for commands to have effect.
If it's not running, all commands fail silently — do not report the error or interrupt work.

---

## Before starting: vision + plan

For any non-trivial task, set context first:

```bash
paw-plan vision "What this task is ultimately about"
```

Then commit to a plan:

```bash
# Sync the general plan / roadmap (e.g., todo.md or general task list)
paw-plan sync todo.md
```

**Rules for a good plan:**
- **Sync the General Plan / Roadmap**: The plan displayed by the cat widget must be the overall roadmap or project milestone checklist (e.g., `todo.md` or `general_plan.md` in the root).
- **DO NOT sync short-term plans**: Never run `paw-plan sync task.md` with turn-specific checklists containing micro-steps like "Read relevant files", "Implement change", "Verify results". Those are temporary and reset the cat's progress. Keep those in your conversation artifacts `task.md` but do not sync them to the cat.
- **Milestone-oriented**: Plan items should represent clear project milestones or complete feature steps (e.g., "Implement JWT Auth", "Design Glassmorphic HUD").
- **Update via roadmap or done**: To mark progress, modify the general roadmap file and run `paw-plan sync todo.md` again, or use `paw-plan done <index>`.

---

## During work: state + progress

### Report your actual state
```bash
paw-plan working          # editing files, writing code
paw-plan running          # executing tests, builds, scripts
paw-plan exploring        # reading files, searching codebase
paw-plan thinking         # planning, waiting for an API response
paw-plan climbing         # deep refactor, heavily nested code
```

### Mark progress
```bash
paw-plan done <index>     # mark task complete (0-based)
paw-plan all-done         # everything done — triggers full celebration
```

### Needs user input
```bash
paw-plan waiting "what you need from the user"
```

---

## Problems and changes

```bash
paw-plan danger "msg"     # destructive or irreversible operation
paw-plan error "msg"      # serious error or exception
paw-plan fall "msg"       # plan changed mid-flight
```

---

## Passive states

```bash
paw-plan idle             # stop current animation
paw-plan sleeping         # long wait (> 30s)
paw-plan ping             # keep-alive, wakes the cat
```

---

## Which command to use when

| What you're actually doing       | Command      |
|----------------------------------|--------------|
| Editing files with any tool      | `working`    |
| Running bash, tests, builds      | `running`    |
| Reading/searching files          | `exploring`  |
| Calling external API, waiting    | `thinking`   |
| Refactoring deeply nested code   | `climbing`   |
| Need user decision or approval   | `waiting`    |

---

## Full flow for a typical task

```
[User asks something]
  → paw-plan ping                     # wake the cat
  → paw-plan exploring                # read relevant files
  → paw-plan set-plan '[...]'        # commit to a plan
  → paw-plan working                  # work on task 0
  → paw-plan done 0                   # ✅ task 0 complete
  → paw-plan running                  # run tests
  → paw-plan done 1                   # ✅ task 1 complete
  → paw-plan all-done                 # 🎉 everything done
```
