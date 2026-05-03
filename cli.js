#!/usr/bin/env node
/**
 * paw-plan CLI — sends status events to the Agent Journey Widget
 *
 * Usage: paw-plan <action> [message/file]
 *
 * Actions:
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

const [,, action, ...rest] = process.argv;
const arg = rest.join(' ');

let msg;

// Parse plan from Markdown (e.g., task.md or implementation_plan.md)
if (action === 'sync') {
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
        console.log(`Syncing plan from ${filePath} (${plan.length} tasks)...`);
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
        ping:    { type: 'PING' },
        jump:    { type: 'LOOP_ACTION', action: 'jump' },
        die:     { type: 'MISTAKE',     message: arg },
        error:   { type: 'MISTAKE',     message: arg },
        fall:    { type: 'PLAN_CHANGED', message: arg },
        attack:  { type: 'WORKING' },
        working: { type: 'WORKING' },
        explore: { type: 'EXPLORING' },
        exploring: { type: 'EXPLORING' },
        danger:  { type: 'DANGER' },
        walk:    { type: 'LOOP_ACTION', action: 'walk' },
        dash:    { type: 'LOOP_ACTION', action: 'dash' },
        idle:    { type: 'STOP' },
        sleep:   { type: 'LOOP_ACTION', action: 'sleep' },
    };

    if (!action || !ACTION_MAP[action]) {
        console.log('Paw-Plan CLI — Help');
        console.log('Usage:');
        console.log('  paw-plan sync [file.md]    (Default: task.md)');
        console.log('  paw-plan done <index>      (Marks task as complete)');
        console.log('  paw-plan working           (Animation: attack)');
        console.log('  paw-plan exploring         (Animation: walk)');
        console.log('  paw-plan error "message"   (Animation: die)');
        process.exit(1);
    }
    msg = ACTION_MAP[action];
}

const ws = new WebSocket('ws://localhost:9123');

ws.on('open', () => {
    ws.send(JSON.stringify(msg));
    console.log(`Event sent to widget: ${msg.type}`);
    setTimeout(() => ws.close(), 100);
});

ws.on('error', (err) => {
    // Silent fail if widget not open, but warn in console
    console.log('Widget not reachable (is it running on port 9123?)');
    process.exit(0);
});
ws.on('close', () => process.exit(0));
