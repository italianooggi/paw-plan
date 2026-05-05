<div align="center">
  <!-- Replace with an actual logo/image if you want, or keep the cat sprite -->
  <h1>🐾 Paw Plan</h1>
  <p><em>Your AI agents code. Your pixel companion watches over them.</em></p>
</div>

<br />

## Why code alone? 

Building software with AI agents is incredible, but it can sometimes feel a bit... cold. You spin up an agent, give it a task, and stare at a terminal output scrolling by. 

**Paw Plan** changes that. 

We believe that monitoring your AI's progress should be visual, relaxing, and fun. Paw Plan gives you a little pixel-art cat that lives on your screen. When your AI agent starts working, the cat wakes up. As the agent completes tasks, the cat journeys forward across the screen. If your agent hits an error, the cat reacts. 

It's a small touch, but having a digital companion keeping track of your multi-agent workflows makes the development process feel much more human and connected. It reduces the cognitive load of reading terminal logs and turns progress tracking into a delightful experience.

## 🌟 Features

* **Visual Progress Tracking**: Your markdown `task.md` checklists are instantly synced to a visual progress bar and a journey map. 
* **Multi-Project Support**: Working on 3 different repositories? Paw Plan spawns a distinct cat window for each project, automatically assigning a unique accent color based on the project ID.
* **Agent-Aware Animations**: The companion responds to what your agent is doing—running sprints (`dash`), reading code (`exploring`), implementing features (`working`), or encountering bugs (`error`).
* **Unobtrusive & Lightweight**: A transparent, borderless Electron widget that stays politely out of your way while keeping you informed.

## 🚀 Getting Started

Paw Plan consists of two parts: the visual **Electron Widget** and the **CLI tool** that your agents use to report progress.

### 1. Launch the Companion
Clone the repository and start the widget:
```bash
git clone https://github.com/italianooggi/paw-plan.git
cd paw-plan
npm install
npm start
```

### 2. Connect Your Agents
Agents can use the included CLI to sync their task lists and report status to the widget over WebSockets:

```bash
# Sync a task list to spawn the cat
node packages/paw-plan/cli.js sync task.md --project-name="My Awesome App"

# Tell the cat the agent is working
node packages/paw-plan/cli.js working

# Report an error
node packages/paw-plan/cli.js error "Failed to compile!"
```
*(Check out the `packages/paw-plan` directory or the Agent `SKILL.md` for full CLI documentation).*

## 🤝 Let's Build Together

This project started as a fun experiment to make AI-assisted coding feel a bit warmer. We'd absolutely love your help to make it better! 

Whether you want to:
* Add new companions (a dog? a tiny wizard? a little robot?)
* Improve the pixel art animations or add new emotional states
* Create integrations/plugins for other AI frameworks (CrewAI, AutoGen, LangChain, etc.)
* Fix bugs or refine the widget UI

**Every contribution is welcome.** We value a friendly, open community. Don't worry if your code isn't perfect—open a Pull Request, share your ideas in the Issues, and let's build something cool together. We are all learning!

## 📜 License

MIT License - code freely, play freely!
