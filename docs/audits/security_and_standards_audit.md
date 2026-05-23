# Gentleman Guardian Angel (GGA) — Security and Standards Audit
**Project**: `widget-trip-agent` (`paw-plan`)
**Role**: Senior Architect / Lead Security Engineer
**Date**: May 2026

---

## 1. Overview & Attack Surface Mapping

The `widget-trip-agent` is a desktop application written in Electron that starts a local WebSocket server to receive state and task updates from various AI agents or terminal commands using the `paw-plan` CLI.

### Trust Boundaries
* **CLI to Daemon Boundary**: The `paw-plan` CLI executes on the developer's local machine and communicates with the Electron Main Process via a WebSocket connection on port `9123`.
* **Electron Main to Renderer Boundary**: Communication occurs through the Electron IPC context bridge (`preload.cjs`), which exposes specific API methods to the renderer window.

```
+------------------+                   +--------------------+
|  paw-plan CLI    | --(localhost:9123)-->| Electron Main      |
+------------------+     [WebSocket]   +--------------------+
                                                 |
                                            (IPC Bridge)
                                                 v
                                       +--------------------+
                                       | Electron Renderer  |
                                       +--------------------+
```

---

## 2. STRIDE Threat Modeling

### [S] Spoofing
* **Threat**: Any local script or remote machine on the same local network can connect to port `9123` and masquerade as a legitimate agent workspace, spoofing status messages, changing plans, and showing fake alerts.
* **Risk**: **High**
* **Root Cause**: The WebSocket server in `src/main/main.js` does not bind to localhost (`127.0.0.1`) explicitly, meaning it listens on `0.0.0.0` (all interfaces) by default. Additionally, there is no handshake token or handshake authentication.
* **Remediation**: Bind the WS server to `127.0.0.1` explicitly.

### [T] Tampering
* **Threat**: Script injection (XSS) in the Renderer Process. If a malicious agent or workspace passes a task title or message with HTML tags (e.g., `<img src=x onerror="...">`), it will be parsed and executed in the Electron window context.
* **Risk**: **Medium**
* **Root Cause**: In `src/renderer/app.js`, user-supplied fields like `task.title` and logs are rendered using `innerHTML` without HTML escaping.
* **Remediation**: Use HTML escaping when setting `innerHTML` or rewrite rendering to use `textContent` where applicable.

### [R] Repudiation
* **Threat**: Lack of logs. If an unexpected operation is performed, there are no log files tracking which process or workspace requested it.
* **Risk**: **Low**
* **Root Cause**: State is saved in a local `.paw-plan/state.json` file, but there are no persistent transaction logs or connections histories.
* **Remediation**: Add basic debug logging on connection start in the main process (which is currently logged only to stdout).

### [I] Information Disclosure
* **Threat**: Exposure of active project metadata and plans. If the WS server is exposed on the network, anyone can scan port `9123` and read the project path and task lists.
* **Risk**: **Medium**
* **Root Cause**: Lack of local-only network binding.
* **Remediation**: Bind to `127.0.0.1`.

### [D] Denial of Service (DoS)
* **Threat**: Operating System Freeze / Memory Exhaustion. A simple script can connect to port `9123` and send thousands of messages with random `projectId`s. Since Electron lazily creates a new window for each unseen `projectId`, this would trigger the creation of thousands of Chromium renderer windows, instantly exhausting system RAM and freezing the user's OS.
* **Risk**: **Critical**
* **Root Cause**: `src/main/main.js` automatically spawns a new window for every connection with an unknown `projectId` without limiting the maximum number of windows.
* **Remediation**: Introduce a limit on the number of concurrently open project windows (e.g., `MAX_WINDOWS = 10`) and ignore/reject incoming requests exceeding this threshold.

### [E] Elevation of Privilege
* **Threat**: Renderer escaping to execute local shell commands.
* **Risk**: **Low** (Well mitigated)
* **Root Cause/Status**: The app correctly sets `contextIsolation: true` and `nodeIntegration: false`, and exposes a minimal preload IPC context bridge. No arbitrary command execution paths exist from the renderer to the main process.

---

## 3. Technical Debt & Code Standards

* **CommonJS in Main Process**: Electron requires CommonJS in the main process because `"type": "module"` is omitted in the root. While standard for older Electron apps, modern architecture favors explicit file structure separation.
* **Git Upstream**: The repository previously lacked upstream tracking for the `main` branch. This was resolved during this audit.
* **No Git Hooks**: Staging is not audited before commits, meaning secrets or incorrect branch formats could easily slip through.

---

## 4. Scoring Summary

| Threat Area | Initial Score (Risk) | Status | Mitigation Action |
|-------------|----------------------|--------|-------------------|
| **Spoofing** | High | Open | Bind WS to `127.0.0.1` |
| **Tampering** | Medium | Open | Escape HTML in renderer `app.js` |
| **Repudiation** | Low | Managed | Internal CLI state archiving |
| **Information Disclosure** | Medium | Open | Bind WS to `127.0.0.1` |
| **Denial of Service** | Critical | Open | Add `MAX_WINDOWS` limit |
| **Elevation of Privilege** | Low | Safe | Preload context isolation |

---

## 5. Security Patches (Remediation Plan)

### Patch 1: Securing WebSocket Server and Preventing OS-Freeze DoS
* **File**: [main.js](file:///c:/Users/Gus/Documents/Repositorios/widget-trip-agent/src/main/main.js)
* **Change**: Bind to `127.0.0.1` and limit maximum concurrent windows.

```javascript
// Add constant
const MAX_WINDOWS = 8;

// Inside startWebSocketServer
wss = new WebSocketServer({ port: 9123, host: '127.0.0.1' });

// Inside wss.on('connection') message handler
if (!windows.has(projectId)) {
  if (windows.size >= MAX_WINDOWS) {
    console.warn(`[Security Alert] Max windows limit reached (${MAX_WINDOWS}). Connection rejected for projectId: ${projectId}`);
    return;
  }
  createProjectWindow(projectId, data.projectName || projectId, data.projectPath || null);
}
```

### Patch 2: Mitigating XSS in Renderer
* **File**: [app.js](file:///c:/Users/Gus/Documents/Repositorios/widget-trip-agent/src/renderer/app.js)
* **Change**: Escape HTML strings before inserting into innerHTML.

```javascript
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
```
Use `escapeHTML()` on variables like `task.title`, `data.text`, and log messages before rendering.
