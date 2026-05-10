#!/usr/bin/env node
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const action = args.find(a => !a.startsWith('--'));
const rest = args.filter(a => a !== action && !a.startsWith('--'));
const arg = rest.join(' ');

const projectIdFlag = process.argv.find(a => a.startsWith('--project-id='))?.split('=')[1];
const projectNameFlag = process.argv.find(a => a.startsWith('--project-name='))?.split('=')[1];

const repoPath = process.cwd();
const defaultProjectId = Buffer.from(repoPath).toString('base64').substring(0, 10).replace(/[/+=]/g, '');
const defaultProjectName = path.basename(repoPath);

const projectId = projectIdFlag || defaultProjectId;
const projectName = projectNameFlag || defaultProjectName;
const projectPath = repoPath;

// --- State persistence ---

const STATE_DIR = path.join(projectPath, '.paw-plan');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const GITIGNORE_FILE = path.join(STATE_DIR, '.gitignore');

function ensureStateDir() {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    if (!fs.existsSync(GITIGNORE_FILE)) fs.writeFileSync(GITIGNORE_FILE, '*\n!.gitignore\n');
}

function readState() {
    ensureStateDir();
    if (!fs.existsSync(STATE_FILE)) return null;
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function writeState(state) {
    ensureStateDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function freshState() {
    return {
        version: 1,
        projectId,
        projectName,
        history: [],
        current: {
            startedAt: new Date().toISOString(),
            vision: '',
            tasks: [],
            discoveries: [],
            blockers: [],
            lastTouchedFiles: [],
        },
    };
}

function archiveCurrent(state, replacedAt) {
    const cur = state.current;
    if (!cur || cur.tasks.length === 0) return;

    const total = cur.tasks.length;
    const done = cur.tasks.filter(t => t.status === 'done').length;
    const status = done === 0 ? 'not-started' : done === total ? 'completed' : 'partial';

    const entry = {
        startedAt: cur.startedAt,
        endedAt: replacedAt || new Date().toISOString(),
        status,
        pinned: false,
        summary: {
            headline: (cur.vision || cur.tasks[0]?.title || '').substring(0, 100),
            outcome: `${done} de ${total} tarea${total !== 1 ? 's' : ''} completada${done !== 1 ? 's' : ''}.`,
            keyDecisions: [],
        },
    };

    const pinned = state.history.filter(h => h.pinned);
    const unpinned = state.history.filter(h => !h.pinned);
    const trimmed = unpinned.slice(0, 2); // max 3 total including new entry
    state.history = [entry, ...trimmed, ...pinned].slice(0, 3 + pinned.length);
}

function updateState(fn) {
    const state = readState() || freshState();
    fn(state);
    writeState(state);
    return state;
}

// --- CLI commands ---

let msg;

if (action === 'get-plan' || action === 'get-state') {
    const ws = new WebSocket('ws://127.0.0.1:9123');
    ws.on('open', () => ws.send(JSON.stringify({ type: 'GET_STATE', projectId, projectName, projectPath })));
    ws.on('message', (raw) => {
        const data = JSON.parse(raw);
        if (data.type === 'STATE') {
            if (data.error) { console.error('Error:', data.error); process.exit(1); }
            console.log(JSON.stringify(data, null, 2));
            ws.close();
        }
    });
    ws.on('error', () => { console.log('Widget not reachable (is it running on port 9123?)'); process.exit(1); });
    ws.on('close', () => process.exit(0));

} else if (action === 'vision') {
    if (!arg) { console.error('Usage: paw-plan vision "Your project vision"'); process.exit(1); }
    updateState(s => { s.current.vision = arg; });
    msg = { type: 'SET_VISION', text: arg };
    console.log(`Setting vision: "${arg}"`);

} else if (action === 'sync') {
    const filePath = arg || 'task.md';
    try {
        const content = fs.readFileSync(path.resolve(filePath), 'utf8');
        const taskRegex = /^\s*-\s*\[([ x/])\]\s*(.+)$/gm;
        const plan = [];
        let match;
        while ((match = taskRegex.exec(content)) !== null) {
            plan.push({ title: match[2].trim(), status: match[1] });
        }
        if (plan.length === 0) {
            console.error(`No tasks found in ${filePath}. Use format: - [ ] Task Name`);
            process.exit(1);
        }
        const doneUpdates = [];
        plan.forEach((task, i) => {
            if (task.status === 'x') doneUpdates.push({ type: 'UPDATE_PROGRESS', index: i, message: `✅ ${task.title}` });
        });

        const prevState = readState();
        const hadPlan = prevState?.current?.tasks?.length > 0;
        updateState(s => {
            if (hadPlan) archiveCurrent(s, new Date().toISOString());
            s.current.startedAt = new Date().toISOString();
            s.current.tasks = plan.map(t => ({ title: t.title, status: t.status === 'x' ? 'done' : 'pending' }));
            s.current.discoveries = [];
        });

        msg = { type: 'SET_PLAN', plan, hadPlan };
        msg._followUp = doneUpdates;
        console.log(`Syncing plan from ${filePath} (${plan.length} tasks, ${doneUpdates.length} done)...`);
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        process.exit(1);
    }

} else if (action === 'set-plan') {
    let plan;
    try { plan = JSON.parse(arg); } catch {
        console.error('set-plan requires valid JSON: \'[{"title":"..."}]\'');
        process.exit(1);
    }
    const prevState = readState();
    const hadPlan = prevState?.current?.tasks?.length > 0;
    updateState(s => {
        if (hadPlan) archiveCurrent(s, new Date().toISOString());
        s.current.startedAt = new Date().toISOString();
        s.current.tasks = plan.map(t => ({ title: t.title, status: 'pending' }));
        s.current.discoveries = [];
    });
    msg = { type: 'SET_PLAN', plan, hadPlan };

} else if (action === 'progress' || action === 'done') {
    const [indexStr, ...msgParts] = rest;
    const index = parseInt(indexStr);
    if (isNaN(index)) { console.error(`Usage: paw-plan ${action} <index>`); process.exit(1); }
    updateState(s => {
        if (s.current.tasks[index]) s.current.tasks[index].status = 'done';
    });
    msg = { type: 'UPDATE_PROGRESS', index, message: msgParts.join(' ') };

} else if (action === 'all-done') {
    updateState(s => {
        s.current.tasks.forEach(t => { t.status = 'done'; });
        s.current.endedAt = new Date().toISOString();
    });
    msg = { type: 'ALL_DONE', message: arg };

} else {
    const ACTION_MAP = {
        ping:         { type: 'PING' },
        working:      { type: 'WORKING' },
        attack:       { type: 'WORKING' },
        running:      { type: 'RUNNING' },
        run:          { type: 'RUNNING' },
        exploring:    { type: 'EXPLORING' },
        explore:      { type: 'EXPLORING' },
        thinking:     { type: 'THINKING' },
        think:        { type: 'THINKING' },
        climbing:     { type: 'CLIMBING' },
        climb:        { type: 'CLIMBING' },
        idle:         { type: 'STOP' },
        sleeping:     { type: 'SLEEPING' },
        sleep:        { type: 'SLEEPING' },
        waiting:      { type: 'WAITING_INPUT', message: arg },
        'wait-input': { type: 'WAITING_INPUT', message: arg },
        danger:       { type: 'DANGER',       message: arg },
        error:        { type: 'MISTAKE',       message: arg },
        die:          { type: 'MISTAKE',       message: arg },
        fall:         { type: 'PLAN_CHANGED',  message: arg },
    };

    if (!action || !ACTION_MAP[action]) {
        console.log('paw-plan — commands:\n');
        console.log('  vision "text"          North star del proyecto');
        console.log('  sync [file.md]         Carga plan desde markdown');
        console.log('  set-plan <json>        Setea plan desde JSON');
        console.log('  done <index>           Marca tarea como completa');
        console.log('  all-done               Todas las tareas completas');
        console.log('  get-plan               Lee estado actual del widget\n');
        console.log('  working / running / exploring / thinking / climbing');
        console.log('  waiting "msg"          Necesita input del usuario');
        console.log('  idle / sleeping / ping\n');
        console.log('  danger "msg"           Operación de riesgo');
        console.log('  error "msg"            Error grave');
        console.log('  fall "msg"             Plan cambió\n');
        process.exit(1);
    }
    msg = ACTION_MAP[action];
}

if (!msg) process.exit(0);

const ws = new WebSocket('ws://127.0.0.1:9123');

ws.on('open', () => {
    const { _followUp, ...mainMsg } = msg;
    const finalMsg = { ...mainMsg, projectId, projectName, projectPath };
    ws.send(JSON.stringify(finalMsg));
    console.log(`Event [${action}] sent for project: ${projectName} (#${projectId.substring(0, 4)})`);

    if (_followUp && _followUp.length > 0) {
        _followUp.forEach((fu, i) => {
            setTimeout(() => ws.send(JSON.stringify({ ...fu, projectId, projectName, projectPath })), (i + 1) * 200);
        });
        setTimeout(() => ws.close(), (_followUp.length + 1) * 200 + 100);
    } else {
        setTimeout(() => ws.close(), 100);
    }
});

ws.on('error', () => {
    console.log('Widget not reachable (is it running on port 9123?)');
    process.exit(0);
});
ws.on('close', () => process.exit(0));
