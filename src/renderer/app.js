/**
 * Agent Journey Widget - Main Renderer Logic
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('widget-container');
const pergamino = document.getElementById('log-pergamino');
const milestoneTitle = document.getElementById('milestone-title');
const milestoneDesc = document.getElementById('milestone-desc');
const historyLogs = document.getElementById('history-logs');

// Configuración del Canvas (Internal Resolution)
canvas.width = 320;
canvas.height = 170;

// Sistema de Carga de Assets
const assets = {
    spritesheet: new Image(),
    milestone: new Image(),
    ground: new Image()
};

assets.spritesheet.src = '../assets/pixelart_gato.webp';
assets.milestone.src = '../assets/milestone.png';
assets.ground.src = '../assets/ground_tile.png';

// --- CONFIGURACIÓN DE SPRITES ---
const SPRITE_W = 114;
const SPRITE_H = 108;
const DISPLAY_SIZE = 52; 

const animations = {
    idle: { row: 0, startCol: 0, frames: 8, speed: 20, cellW: 114, cellH: 108, offsets: [[2,0],[1.5,0],[1,0],[0.5,0],[0,0],[-1.5,0],[-1.5,0],[-1.5,0]] },
    walk: { row: 1, startCol: 0, frames: 9, speed: 20, cellW: 114, cellH: 108, offsets: [[1.5,0],[1.5,0],[1,0],[0,0],[0,0.5],[-1,0],[-1.5,0],[-2,0],[0.5,0]] },
    jump: { row: 2, startCol: 0, frames: 7, speed: 20, rowY: 226, cellW: 114, cellH: 140, offsets: [[-0.5,-6.5],[-1.5,-6.5],[-0.5,-6.5],[0.5,-6.5],[1,-6.5],[-1,-6.5],[-1,-6.5]] },
    fall: { row: 3, startCol: 0, frames: 4, speed: 20, rowY: 361, cellW: 114, cellH: 132, offsets: [[0.5,2],[0,0],[0,-2],[-0.5,0]] },
    sleep: { row: 9, startCol: 1, frames: 5, speed: 20, cellW: 114, cellH: 108, offsets: [[1,0],[1,0],[0.5,0],[-1,0],[-2,-0.5]] },
    die: { row: 7, startCol: 6, frames: 3, speed: 20, colX: 685, rowY: 722, cellW: 114, cellH: 108, offsets: [[0.5,-0.5],[-0.5,0],[0,0]] },
};

const ACTION_BEHAVIORS = {
    idle:   { vx: 0,   vy: 0    },
    walk:   { vx: 1.5, vy: 0    },
    jump:   { vx: 1.8, vy: 0    },
    fall:   { vx: 0,   vy: 2.5  },
    land:   { vx: 0,   vy: 0    },
    dash:   { vx: 5,   vy: 0    },
    attack: { vx: 0,   vy: 0    },
    climb:  { vx: 0,   vy: -1   },
    hurt:   { vx: 0,   vy: 0    },
    die:    { vx: 0,   vy: 0    },
    sleep:  { vx: 0,   vy: 0    },
};

const BASE_Y = canvas.height - DISPLAY_SIZE - 8;
const CENTER_X = (canvas.width - DISPLAY_SIZE) / 2;

// Estado Global
let char = {
    x: CENTER_X,
    y: BASE_Y,
    state: 'idle',
    frame: 0,
    timer: 0,
    animSpeed: 5,
    flip: false,
    targetX: CENTER_X,
    pinned: false,
    loopVX: 0,
    loopVY: 0,
};

let processedSpritesheet = null;

const state = {
    projectId: 'default',
    projectName: 'General',
    accentColor: '#00ffcc',
    plan: [],
    currentHito: -1,
    logs: [],
    time: 0,
    weather: 'clear', 
    map: {
        tiles: [],
        hitosX: [],
        offsetX: 0,
        targetOffsetX: 0
    }
};

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 80%, 65%)`;
}

function updateProjectTheme(id, name) {
    state.projectId = id;
    state.projectName = name;
    state.accentColor = stringToColor(id);
    container.style.setProperty('--accent', state.accentColor);
    const tag = document.getElementById('project-tag');
    if (tag) tag.innerText = `${name} #${id.substring(0,4)}`;
}

function removeBlackBackground(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const tempCtx = canvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 20 && data[i+1] < 20 && data[i+2] < 20) data[i+3] = 0;
    }
    tempCtx.putImageData(imageData, 0, 0);
    return canvas;
}

assets.spritesheet.onload = () => { processedSpritesheet = removeBlackBackground(assets.spritesheet); };

function updateTime() {
    const hour = new Date().getHours();
    if (hour >= 19 || hour <= 6) container.style.setProperty('--glass-bg', 'rgba(10, 10, 20, 0.8)');
    else if (hour >= 17) container.style.setProperty('--glass-bg', 'rgba(40, 20, 10, 0.75)');
    else container.style.setProperty('--glass-bg', 'rgba(20, 20, 25, 0.7)');
}

function generateMap(numHitos) {
    state.map.tiles = [];
    state.map.hitosX = [];
    state.map.offsetX = 0;
    state.map.targetOffsetX = 0;
    const spacing = 120;
    for (let i = 0; i <= numHitos; i++) state.map.hitosX.push(CENTER_X + (i * spacing));
}

function drawCloud(x, y) {
    const cx = x + DISPLAY_SIZE / 2;
    const cy = y + DISPLAY_SIZE / 2;
    const blobs = [[0,2,36,0.72],[-22,6,26,0.45],[22,6,26,0.45],[0,-10,24,0.40],[-12,-15,18,0.32],[12,-15,18,0.32],[0,18,22,0.38]];
    ctx.save();
    blobs.forEach(([dx, dy, r, a]) => {
        const g = ctx.createRadialGradient(cx+dx, cy+dy, 0, cx+dx, cy+dy, r);
        g.addColorStop(0, `rgba(18,18,30,${a})`);
        g.addColorStop(0.55, `rgba(14,14,24,${(a * 0.45).toFixed(2)})`);
        g.addColorStop(1, 'rgba(8,8,16,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx+dx, cy+dy, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
}

function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (Math.abs(state.map.offsetX - state.map.targetOffsetX) > 0.5) state.map.offsetX += (state.map.targetOffsetX - state.map.offsetX) * 0.05;
    else state.map.offsetX = state.map.targetOffsetX;
    
    drawCloud(CENTER_X, char.y);
    drawCharacter();

    if (state.weather === 'rain') drawRain();
    requestAnimationFrame(draw);
}

function updateProgressBarUI() {
    const pBar = document.getElementById('progress-bar');
    const pContainer = document.getElementById('progress-container');
    if (!pBar || !pContainer) return;
    
    if (state.plan.length === 0) {
        pBar.style.width = '0%';
        pContainer.innerHTML = '<div id="progress-bar"></div>';
        return;
    }
    
    const progressIndex = Math.max(0, state.currentHito);
    const totalSegments = state.plan.length > 1 ? state.plan.length - 1 : 1;
    const progressWidth = (progressIndex / totalSegments) * 100;
    
    pContainer.innerHTML = '';
    const newBar = document.createElement('div');
    newBar.id = 'progress-bar';
    newBar.style.width = `${progressWidth}%`;
    pContainer.appendChild(newBar);
    
    for (let i = 0; i <= totalSegments; i++) {
        const tick = document.createElement('div');
        tick.className = 'progress-tick';
        tick.style.left = `${(i / totalSegments) * 100}%`;
        pContainer.appendChild(tick);
    }
}

function drawCharacter() {
    if (char.pinned && (char.loopVX !== 0 || char.loopVY !== 0)) {
        state.map.targetOffsetX += char.loopVX;
        state.map.offsetX = state.map.targetOffsetX;
        char.y += char.loopVY;
        char.x = CENTER_X;
        if (char.loopVY > 0 && char.y > canvas.height + 10) char.y = -DISPLAY_SIZE;
        if (char.loopVY < 0 && char.y < -DISPLAY_SIZE - 10) char.y = canvas.height;
    }
    if (!char.pinned) {
        let nextState = char.state;
        if (Math.abs(state.map.offsetX - state.map.targetOffsetX) > 1) {
            nextState = 'walk';
            char.flip = state.map.targetOffsetX < state.map.offsetX;
        } else {
            nextState = (state.currentHito === state.plan.length - 1 && state.plan.length > 0) ? 'sleep' : 'idle';
        }
        if (nextState !== char.state) { char.state = nextState; char.frame = 0; char.timer = 0; }
    }
    char.timer++;
    const anim = animations[char.state];
    const speed = anim.speed ?? char.animSpeed;
    if (char.timer >= speed) {
        char.timer = 0; char.frame++;
        if (char.frame >= anim.frames) char.frame = char.state === 'sleep' ? anim.frames - 1 : 0;
    }
    const imgSource = processedSpritesheet || (assets.spritesheet.complete ? assets.spritesheet : null);
    if (!imgSource) return;
    const srcW = anim.cellW ?? SPRITE_W, srcH = anim.cellH ?? SPRITE_H;
    const sourceX = anim.colX != null ? anim.colX + char.frame * srcW : (anim.startCol + char.frame) * srcW;
    const sourceY = anim.rowY ?? (anim.row * SPRITE_H);
    const [ox, oy] = anim.offsets?.[char.frame] ?? [0, 0];
    const drawX = Math.round(char.x + ox), drawY = Math.round(char.y + oy);
    ctx.save();
    if (char.flip) { ctx.translate(drawX + DISPLAY_SIZE, 0); ctx.scale(-1, 1); ctx.drawImage(imgSource, sourceX, sourceY, srcW, srcH, 0, drawY, DISPLAY_SIZE, DISPLAY_SIZE); }
    else { ctx.drawImage(imgSource, sourceX, sourceY, srcW, srcH, drawX, drawY, DISPLAY_SIZE, DISPLAY_SIZE); }
    ctx.restore();
}

function drawRain() {
    ctx.strokeStyle = 'rgba(100, 150, 255, 0.4)'; ctx.lineWidth = 1;
    for(let i=0; i<20; i++) {
        const x = (Date.now() * 0.2 + i * 50) % canvas.width, y = (Date.now() * 0.5 + i * 30) % 115;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 5); ctx.stroke();
    }
}

window.electronAPI.onAgentData((data) => {
    wakeUp();
    if (data.projectId && data.projectId !== state.projectId) updateProjectTheme(data.projectId, data.projectName || data.projectId);
    switch(data.type) {
        case 'INIT_PROJECT': updateProjectTheme(data.projectId, data.projectName); break;
        case 'SET_PLAN':
            state.plan = data.plan; state.currentHito = -1; state.map.targetOffsetX = 0;
            updateProgressBarUI();
            char.targetX = CENTER_X; char.x = CENTER_X; char.pinned = false; char.loopVX = 0; char.loopVY = 0; char.y = BASE_Y;
            generateMap(data.plan.length); updateLog('Nuevo Viaje', 'Plan con ' + data.plan.length + ' tareas');
            playStartSound(); _triggerLoopAction('dash');
            setTimeout(() => { char.pinned = false; char.loopVX = 0; }, 1500);
            break;
        case 'UPDATE_PROGRESS':
            state.currentHito = data.index; char.pinned = false; char.loopVX = 0; char.loopVY = 0; char.y = BASE_Y;
            updateProgressBarUI();
            updateLog(state.plan[data.index]?.title || 'Tarea completada', data.message || '');
            playMilestoneSound(); _triggerLoopAction('jump');
            setTimeout(() => { char.pinned = false; char.loopVX = 0; char.loopVY = 0; char.y = BASE_Y; state.map.targetOffsetX = state.map.hitosX[data.index] - CENTER_X; }, 2000);
            break;
        case 'MISTAKE': playSadSound(); _triggerLoopAction('die'); updateLog('Nos equivocamos', data.message || ''); break;
        case 'PLAN_CHANGED': _triggerLoopAction('fall'); updateLog('Plan actualizado', data.message || ''); playNotificationSound(); break;
        case 'WORKING': if (!char.pinned) { char.state = 'attack'; char.frame = 0; char.timer = 0; } break;
        case 'EXPLORING': if (!char.pinned) { char.state = 'walk'; char.frame = 0; char.timer = 0; } break;
        case 'DANGER': playDangerSound(); _triggerLoopAction('hurt'); setTimeout(() => { char.pinned = false; }, 2000); break;
        case 'FORCE_STATE':
            if (animations[data.state]) { char.state = data.state; char.frame = 0; char.timer = 0; char.pinned = true; char.loopVX = 0; char.loopVY = 0;
                if (data.x !== undefined) { char.x = data.x; char.targetX = data.x; }
                if (data.flip !== undefined) char.flip = data.flip;
            }
            break;
        case 'LOOP_ACTION': {
            const b = ACTION_BEHAVIORS[data.action]; if (!b || !animations[data.action]) break;
            if (data.action === 'die') playSadSound(); if (data.action === 'hurt') playDangerSound();
            _triggerLoopAction(data.action, data.flip); break;
        }
        case 'STOP': char.pinned = false; char.loopVX = 0; char.loopVY = 0; char.y = BASE_Y; char.targetX = char.x; break;
    }
});

function _triggerLoopAction(action, flip) {
    const b = ACTION_BEHAVIORS[action]; if (!b || !animations[action]) return;
    char.state = action; char.frame = 0; char.timer = 0; char.pinned = true; char.loopVX = b.vx; char.loopVY = b.vy;
    char.flip = flip !== undefined ? flip : b.vx < 0; char.y = BASE_Y; char.targetX = char.x;
}

function updateLog(title, desc) {
    milestoneTitle.innerText = title; milestoneDesc.innerText = desc;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const logItem = document.createElement('div'); logItem.innerHTML = `<strong>[${time}]</strong> ${title}`;
    historyLogs.prepend(logItem);
}

function beep(freq, duration, type = 'square', volume = 0.1) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    oscillator.connect(gainNode); gainNode.connect(audioCtx.destination);
    oscillator.start(); oscillator.stop(audioCtx.currentTime + duration);
}

function playNotificationSound() { beep(440, 0.1); }
function playMilestoneSound() { beep(523.25, 0.1); setTimeout(() => beep(659.25, 0.1), 100); }
function playStartSound() { [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 0.12), i * 80)); }
function playSadSound() { [392, 330, 294, 247, 220].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'sine', 0.08), i * 220)); }
function playDangerSound() { beep(200, 0.15, 'sawtooth', 0.08); setTimeout(() => beep(180, 0.2, 'sawtooth', 0.06), 160); }

let dragging = false, dragLastX = 0, dragLastY = 0;
canvas.addEventListener('mousedown', (e) => { dragging = true; dragLastX = e.screenX; dragLastY = e.screenY; e.preventDefault(); });
window.addEventListener('mousemove', (e) => { if (!dragging) return; const dx = e.screenX - dragLastX, dy = e.screenY - dragLastY; dragLastX = e.screenX; dragLastY = e.screenY; window.electronAPI.moveWindow(dx, dy); });
window.addEventListener('mouseup', () => { dragging = false; });
let didDrag = false;
canvas.addEventListener('mousedown', () => { didDrag = false; });
window.addEventListener('mousemove', () => { if (dragging) didDrag = true; });
container.addEventListener('click', () => { if (!didDrag) pergamino.classList.toggle('hidden'); });
document.getElementById('close-log').addEventListener('click', (e) => { e.stopPropagation(); pergamino.classList.add('hidden'); });

let lastMessageTime = Date.now();
const SLEEP_DELAY_MS = 2 * 60 * 1000;
setInterval(() => {
    if (char.pinned || char.state !== 'idle') return;
    if (Date.now() - lastMessageTime > SLEEP_DELAY_MS) { char.state = 'sleep'; char.frame = 0; char.timer = 0; }
}, 10000);

function wakeUp() {
    lastMessageTime = Date.now();
    if ((char.state === 'sleep') && !char.pinned) { char.state = 'idle'; char.frame = 0; char.timer = 0; }
}

char.y = BASE_Y; char.targetX = char.x; setInterval(updateTime, 60000); updateTime(); generateMap(0); draw();
