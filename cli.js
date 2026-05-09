#!/usr/bin/env node
/**
 * paw-plan CLI — sends status events to the Agent Journey Widget
 *
 * Usage: paw-plan <action> [message/file]
 *
 * Actions:
 *   vision <text>     Set the OKR / north star vision (always visible in pergamino)
 *   sync <file.md>    Parse Markdown (tasks) and set plan
 *   set-plan <json>   Set implementation plan directly
 *   progress <idx>    Mark task N as done
 *   done <idx> [msg]  Alias for progress
 *   working           Character is working (attack)
 *   exploring         Character is exploring (walk)
 *   error <msg>       Something went wrong (die)
 *   ping              Keep alive
 */

import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const action = args.find(a => !a.startsWith('--'));
const rest = args.filter(a => a !== action && !a.startsWith('--'));
const arg = rest.join(' ');

// Parse flags --project-id=XYZ --project-name=ABC
const projectIdFlag = process.argv.find(a => a.startsWith('--project-id='))?.split('=')[1];
const projectNameFlag = process.argv.find(a => a.startsWith('--project-name='))?.split('=')[1];

// ID basado en el path del repo (base64 corto) para consistencia
const repoPath = process.cwd();
const defaultProjectId = Buffer.from(repoPath).toString('base64').substring(0, 10).replace(/[/+=]/g, '');
const defaultProjectName = path.basename(repoPath);

const projectId = projectIdFlag || defaultProjectId;
const projectName = projectNameFlag || defaultProjectName;

let msg;

if (action === 'vision') {
    if (!arg) {
        console.error('Usage: paw-plan vision "Tu OKR o visión del proyecto"');
        process.exit(1);
    }
    msg = { type: 'SET_VISION', text: arg };
    console.log(`Setting vision: "${arg}"`);

// Parse plan from Markdown (e.g., task.md or implementation_plan.md)
} else if (action === 'sync') {
    const filePath = arg || 'task.md';
    try {
        const content = fs.readFileSync(path.resolve(filePath), 'utf8');
        // Regex to find tasks like "- [ ] Task" or "- [x] Task"
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

        msg = { type: 'SET_PLAN', plan };

        // Also build UPDATE_PROGRESS for already-done tasks
        const doneUpdates = [];
        plan.forEach((task, i) => {
            if (task.status === 'x') {
                doneUpdates.push({ type: 'UPDATE_PROGRESS', index: i, message: `✅ ${task.title}` });
            }
        });
        // Attach so the WS sender can send them in order
        msg._followUp = doneUpdates;

        console.log(`Syncing plan from ${filePath} (${plan.length} tasks, ${doneUpdates.length} done)...`);
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        process.exit(1);
    }

} else if (action === 'set-plan') {
    let plan;
    try { plan = JSON.parse(arg); } catch {
        console.error('set-plan requires valid JSON: \'[{"title":"...","desc":"..."}]\'');
        process.exit(1);
    }
    msg = { type: 'SET_PLAN', plan };

} else if (action === 'progress' || action === 'done') {
    const [indexStr, ...msgParts] = rest;
    const index = parseInt(indexStr);
    if (isNaN(index)) {
        console.error(`Usage: paw-plan ${action} <index> [message]`);
        process.exit(1);
    }
    msg = { type: 'UPDATE_PROGRESS', index, message: msgParts.join(' ') };

} else {
    const ACTION_MAP = {
        // keep-alive
        ping:         { type: 'PING' },

        // trabajo activo
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

        // estados pasivos
        idle:         { type: 'STOP' },
        sleeping:     { type: 'SLEEPING' },
        sleep:        { type: 'SLEEPING' },

        // necesita input
        waiting:      { type: 'WAITING_INPUT', message: arg },
        'wait-input': { type: 'WAITING_INPUT', message: arg },

        // progreso
        'all-done':   { type: 'ALL_DONE', message: arg },

        // problemas
        danger:       { type: 'DANGER',        message: arg },
        error:        { type: 'MISTAKE',        message: arg },
        die:          { type: 'MISTAKE',        message: arg },
        fall:         { type: 'PLAN_CHANGED',   message: arg },
    };

    if (!action || !ACTION_MAP[action]) {
        console.log('Paw-Plan CLI — Help');
        console.log('');
        console.log('  paw-plan vision "OKR..."       North star del proyecto');
        console.log('  paw-plan sync [file.md]        Carga plan desde markdown (default: task.md)');
        console.log('  paw-plan done <index>          Marca tarea como completa');
        console.log('  paw-plan all-done              Todas las tareas completas');
        console.log('');
        console.log('  paw-plan working               Codificando — attack');
        console.log('  paw-plan running               Ejecutando tests/scripts — run');
        console.log('  paw-plan exploring             Leyendo archivos — walk');
        console.log('  paw-plan thinking              Planificando — idle');
        console.log('  paw-plan climbing              Refactor profundo — stairs');
        console.log('  paw-plan waiting "msg"         Necesita input del usuario — run urgente');
        console.log('');
        console.log('  paw-plan idle                  Detiene animación activa');
        console.log('  paw-plan sleeping              Espera larga');
        console.log('  paw-plan danger "msg"          Situación de riesgo — hurt');
        console.log('  paw-plan error "msg"           Error — die');
        console.log('  paw-plan fall "msg"            Plan cambió — fall');
        console.log('');
        process.exit(1);
    }
    msg = ACTION_MAP[action];
}

const ws = new WebSocket('ws://127.0.0.1:9123');

ws.on('open', () => {
    const { _followUp, ...mainMsg } = msg;
    const finalMsg = { ...mainMsg, projectId, projectName };
    ws.send(JSON.stringify(finalMsg));
    console.log(`Event [${action}] sent for project: ${projectName} (#${projectId.substring(0,4)})`);

    // Send follow-up messages (e.g. UPDATE_PROGRESS for done tasks) with delays
    if (_followUp && _followUp.length > 0) {
        _followUp.forEach((fu, i) => {
            setTimeout(() => {
                const fuMsg = { ...fu, projectId, projectName };
                ws.send(JSON.stringify(fuMsg));
            }, (i + 1) * 200);
        });
        setTimeout(() => ws.close(), (_followUp.length + 1) * 200 + 100);
    } else {
        setTimeout(() => ws.close(), 100);
    }
});

ws.on('error', (err) => {
    // Silent fail if widget not open, but warn in console
    console.log('Widget not reachable (is it running on port 9123?)');
    process.exit(0);
});
ws.on('close', () => process.exit(0));
