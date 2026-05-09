/**
 * Agent Journey Widget - Main Renderer Logic
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('widget-container');
const pergamino = document.getElementById('log-pergamino');
const historyLogs = document.getElementById('history-logs');
const taskList = document.getElementById('task-list');
const currentTaskLabel = document.getElementById('current-task');
const visionSection = document.getElementById('vision-section');
const visionText = document.getElementById('vision-text');

canvas.width = 320;
canvas.height = 170;

const assets = {
    spritesheet: new Image(),
    milestone: new Image(),
    ground: new Image()
};

assets.spritesheet.src = '../assets/pixelart_gato.webp';
assets.milestone.src = '../assets/milestone.png';
assets.ground.src = '../assets/ground_tile.png';

const SPRITE_W = 114;
const SPRITE_H = 108;
const DISPLAY_SIZE = 52;

const animations = {
    idle:   { startCol: 0, frames: 8, speed: 19, cellW: 116, cellH: 108, rowY: 0,   offsets: Array(8).fill([0,0]) },
    walk:   { startCol: 0, frames: 9, speed: 20, cellW: 114, cellH: 108, rowY: 117, offsets: Array(9).fill([0,0]) },
    jump:   { startCol: 0, frames: 7, speed: 20, cellW: 115, cellH: 140, rowY: 226, offsets: Array(7).fill([0,0]) },
    fall:   { startCol: 0, frames: 4, speed: 20, cellW: 114, cellH: 122, rowY: 363, offsets: Array(4).fill([0,0]) },
    run:    { startCol: 1, frames: 6, speed: 8,  cellW: 121, cellH: 107, rowY: 487, offsetX: -28, offsetY: 0,   offsets: Array(6).fill([0,0]) },
    attack: { startCol: 1, frames: 5, speed: 12, cellW: 126, cellH: 108, rowY: 596, offsetX: -42, offsetY: 9,   offsets: Array(5).fill([0,0]) },
    stairs: { startCol: 1, frames: 4, speed: 20, cellW: 114, cellH: 119, rowY: 704, offsetX: 0,   offsetY: 3,   offsets: Array(4).fill([0,0]) },
    hurt:   { startCol: 7, frames: 3, speed: 20, cellW: 111, cellH: 126, rowY: 704, offsetX: -83, offsetY: 3,   offsets: Array(3).fill([0,0]) },
    die:    { startCol: 1, frames: 7, speed: 20, cellW: 116, cellH: 110, rowY: 704, offsetX: -12, offsetY: 133, offsets: Array(7).fill([0,0]) },
    sleep:  { startCol: 1, frames: 5, speed: 20, cellW: 116, cellH: 110, rowY: 704, offsetX: -2,  offsetY: 242, offsets: Array(5).fill([0,0]) },
};

const ACTION_BEHAVIORS = {
    idle:    { vx: 0,   vy: 0    },
    walk:    { vx: 1.5, vy: 0    },
    run:     { vx: 3.5, vy: 0    },
    jump:    { vx: 0,   vy: 0    },
    fall:    { vx: 0,   vy: 2.5  },
    attack:  { vx: 0,   vy: 0    },
    stairs:  { vx: 0,   vy: -1   },
    hurt:    { vx: 0,   vy: 0    },
    die:     { vx: 0,   vy: 0    },
    sleep:   { vx: 0,   vy: 0    },
};

const BASE_Y = canvas.height - DISPLAY_SIZE - 8;
const CENTER_X = (canvas.width - DISPLAY_SIZE) / 2;

let char = {
    x: CENTER_X, y: BASE_Y,
    state: 'idle', frame: 0, timer: 0, animSpeed: 5,
    flip: false, targetX: CENTER_X,
    pinned: false, loopVX: 0, loopVY: 0,
};

let processedSpritesheet = null;

const state = {
    projectId: 'default',
    projectName: 'General',
    accentColor: '#00ffcc',
    vision: '',
    plan: [],
    currentHito: -1,
    logs: [],
    time: 0,
    weather: 'clear',
    map: { tiles: [], hitosX: [], offsetX: 0, targetOffsetX: 0 }
};

// --- Helpers ---

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 80%, 65%)`;
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
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const tempCtx = c.getContext('2d');
    tempCtx.drawImage(img, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, c.width, c.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 20 && data[i+1] < 20 && data[i+2] < 20) data[i+3] = 0;
    }
    tempCtx.putImageData(imageData, 0, 0);
    return c;
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

// --- UI: Plan & Vision ---

function renderTaskList() {
    if (!taskList) return;
    if (state.plan.length === 0) {
        taskList.innerHTML = '<p class="no-plan">Sin plan activo</p>';
        return;
    }
    taskList.innerHTML = state.plan.map((task, i) => {
        const isProgressDone = i < state.currentHito;
        const isProgressCurrent = i === state.currentHito;
        const isFileDone = task.status === 'x' || task.status === '/';
        const isDone = isProgressDone || (state.currentHito === -1 && isFileDone);
        const isCurrent = isProgressCurrent;

        const cls = 'task-item' + (isDone ? ' done' : '') + (isCurrent ? ' current' : '');
        const icon = isDone ? '✓' : isCurrent ? '→' : '○';
        return `<div class="${cls}"><span class="task-icon">${icon}</span><span class="task-title">${task.title}</span></div>`;
    }).join('');
}

function updateCurrentTaskDisplay() {
    if (!currentTaskLabel) return;
    if (state.currentHito >= 0 && state.plan[state.currentHito]) {
        currentTaskLabel.innerText = '→ ' + state.plan[state.currentHito].title;
    } else if (state.plan.length > 0) {
        const firstPending = state.plan.find(t => t.status !== 'x' && t.status !== '/');
        currentTaskLabel.innerText = firstPending ? '○ ' + firstPending.title : '✓ Plan completo';
    } else {
        currentTaskLabel.innerText = '';
    }
}

function updateVisionDisplay() {
    if (!visionSection || !visionText) return;
    if (state.vision) {
        visionText.innerText = state.vision;
        visionSection.classList.remove('hidden');
    } else {
        visionSection.classList.add('hidden');
    }
}

function addToHistory(title, desc) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const entry = document.createElement('div');
    entry.innerHTML = `<strong>[${time}]</strong> ${title}${desc ? ' — ' + desc : ''}`;
    historyLogs.prepend(entry);
}

// --- Progress bar ---

function updateProgressBarUI() {
    const pBar = document.getElementById('progress-bar');
    const pContainer = document.getElementById('progress-container');
    if (!pBar || !pContainer) return;
    if (state.plan.length === 0) { pBar.style.width = '0%'; return; }

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

// --- Canvas drawing ---

function drawCloud(x, y) {
    const cx = x + DISPLAY_SIZE / 2, cy = y + DISPLAY_SIZE / 2;
    const blobs = [[0,2,36,0.72],[-22,6,26,0.45],[22,6,26,0.45],[0,-10,24,0.40],[-12,-15,18,0.32],[12,-15,18,0.32],[0,18,22,0.38]];
    ctx.save();
    blobs.forEach(([dx, dy, r, a]) => {
        const g = ctx.createRadialGradient(cx+dx, cy+dy, 0, cx+dx, cy+dy, r);
        g.addColorStop(0, `rgba(18,18,30,${a})`);
        g.addColorStop(0.55, `rgba(14,14,24,${(a*0.45).toFixed(2)})`);
        g.addColorStop(1, 'rgba(8,8,16,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx+dx, cy+dy, r, 0, Math.PI*2); ctx.fill();
    });
    ctx.restore();
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
    const sourceX = (anim.startCol + char.frame) * srcW + (anim.offsetX || 0);
    const sourceY = (anim.rowY ?? 0) + (anim.offsetY || 0);
    const [ox, oy] = anim.offsets?.[char.frame] ?? [0, 0];
    const drawX = Math.round(char.x + ox), drawY = Math.round(char.y + oy);
    ctx.save();
    if (char.flip) {
        ctx.translate(drawX + DISPLAY_SIZE, 0); ctx.scale(-1, 1);
        ctx.drawImage(imgSource, sourceX, sourceY, srcW, srcH, 0, drawY, DISPLAY_SIZE, DISPLAY_SIZE);
    } else {
        ctx.drawImage(imgSource, sourceX, sourceY, srcW, srcH, drawX, drawY, DISPLAY_SIZE, DISPLAY_SIZE);
    }
    ctx.restore();
}

function drawRain() {
    ctx.strokeStyle = 'rgba(100, 150, 255, 0.4)'; ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
        const x = (Date.now() * 0.2 + i * 50) % canvas.width, y = (Date.now() * 0.5 + i * 30) % 115;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 5); ctx.stroke();
    }
}

function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (Math.abs(state.map.offsetX - state.map.targetOffsetX) > 0.5)
        state.map.offsetX += (state.map.targetOffsetX - state.map.offsetX) * 0.05;
    else state.map.offsetX = state.map.targetOffsetX;

    drawCloud(CENTER_X, char.y);
    drawCharacter();
    if (state.weather === 'rain') drawRain();
    requestAnimationFrame(draw);
}

// --- Action helpers ---

function _triggerLoopAction(action, flip) {
    const b = ACTION_BEHAVIORS[action];
    if (!b || !animations[action]) return;
    char.state = action; char.frame = 0; char.timer = 0;
    char.pinned = true; char.loopVX = b.vx; char.loopVY = b.vy;
    char.flip = flip !== undefined ? flip : b.vx < 0;
    char.y = BASE_Y; char.targetX = char.x;
}

function doJump(height, duration, onDone) {
    char.state = 'jump'; char.frame = 0; char.timer = 0;
    char.pinned = true; char.loopVX = 0; char.loopVY = 0;
    const start = Date.now();
    const arc = () => {
        const t = Math.min((Date.now() - start) / duration, 1);
        char.y = BASE_Y - Math.sin(t * Math.PI) * height;
        if (t < 1) requestAnimationFrame(arc);
        else { char.y = BASE_Y; onDone && onDone(); }
    };
    requestAnimationFrame(arc);
}

function doRun(duration, flip, onDone) {
    char.state = 'run'; char.frame = 0; char.timer = 0;
    char.pinned = true; char.loopVX = flip ? -3.5 : 3.5; char.loopVY = 0;
    char.flip = flip;
    setTimeout(() => { char.loopVX = 0; onDone && onDone(); }, duration);
}

function celebrateTaskDone() {
    doJump(45, 600, () => {
        char.state = 'idle'; char.frame = 0; char.timer = 0;
        char.pinned = false;
    });
}

function celebrateAllDone() {
    // Sonido de fiesta — escala ascendente rápida + fanfarria
    [523, 659, 784, 1047, 784, 1047, 1319, 1047, 1319].forEach((f, i) =>
        setTimeout(() => beep(f, 0.14, 'square', 0.12), i * 70));

    // Secuencia: run → jump → run back → jump → jump alto → idle
    doRun(500, false, () => {
        doJump(55, 500, () => {
            beep(1047, 0.12, 'square', 0.1);
            doRun(400, true, () => {
                doJump(55, 500, () => {
                    beep(1319, 0.15, 'square', 0.12);
                    setTimeout(() => {
                        doJump(70, 600, () => {
                            [784, 1047, 1319].forEach((f, i) =>
                                setTimeout(() => beep(f, 0.2, 'square', 0.1), i * 90));
                            char.state = 'idle'; char.frame = 0; char.timer = 0;
                            char.pinned = false;
                        });
                    }, 200);
                });
            });
        });
    });
}

// --- Sound ---

function beep(freq, duration, type = 'square', volume = 0.1) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
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

// --- WebSocket event handler ---

function wakeUp() {
    lastMessageTime = Date.now();
    if (char.state === 'sleep' && !char.pinned) { char.state = 'idle'; char.frame = 0; char.timer = 0; }
}

window.electronAPI.onAgentData((data) => {
    wakeUp();
    if (data.projectId && data.projectId !== state.projectId)
        updateProjectTheme(data.projectId, data.projectName || data.projectId);

    switch (data.type) {
        case 'INIT_PROJECT':
            updateProjectTheme(data.projectId, data.projectName);
            break;

        case 'SET_VISION':
            state.vision = data.text || '';
            updateVisionDisplay();
            addToHistory('Visión', data.text);
            break;

        case 'SET_PLAN':
            state.plan = data.plan;
            state.currentHito = -1;
            state.map.targetOffsetX = 0;
            char.targetX = CENTER_X; char.x = CENTER_X;
            char.pinned = false; char.loopVX = 0; char.loopVY = 0; char.y = BASE_Y;
            generateMap(data.plan.length);
            updateProgressBarUI();
            renderTaskList();
            updateCurrentTaskDisplay();
            addToHistory('Nuevo plan', data.plan.length + ' tareas');
            playStartSound();
            _triggerLoopAction('run');
            setTimeout(() => { char.pinned = false; char.loopVX = 0; }, 1500);
            break;

        case 'UPDATE_PROGRESS':
            state.currentHito = data.index;
            char.pinned = false; char.loopVX = 0; char.loopVY = 0; char.y = BASE_Y;
            updateProgressBarUI();
            renderTaskList();
            updateCurrentTaskDisplay();
            addToHistory(state.plan[data.index]?.title || 'Tarea completada', data.message || '');
            playMilestoneSound();
            celebrateTaskDone();
            setTimeout(() => {
                state.map.targetOffsetX = (state.map.hitosX[data.index] ?? 0) - CENTER_X;
            }, 700);
            break;

        case 'ALL_DONE':
            state.currentHito = state.plan.length - 1;
            updateProgressBarUI();
            renderTaskList();
            updateCurrentTaskDisplay();
            addToHistory('¡Todo completado!', data.message || '');
            celebrateAllDone();
            break;

        case 'WORKING':
            if (!char.pinned) {
                char.state = 'attack'; char.frame = 0; char.timer = 0;
                char.pinned = true; char.loopVX = 0; char.loopVY = 0;
                setTimeout(() => { char.pinned = false; }, 1200);
            }
            break;

        case 'RUNNING':
            char.state = 'run'; char.frame = 0; char.timer = 0;
            char.pinned = true; char.loopVX = ACTION_BEHAVIORS.run.vx; char.loopVY = 0;
            char.flip = false;
            setTimeout(() => { char.pinned = false; char.loopVX = 0; }, 2000);
            break;

        case 'EXPLORING':
            if (!char.pinned) { char.state = 'walk'; char.frame = 0; char.timer = 0; }
            break;

        case 'THINKING':
            if (!char.pinned) { char.state = 'idle'; char.frame = 0; char.timer = 0; }
            break;

        case 'CLIMBING':
            char.state = 'stairs'; char.frame = 0; char.timer = 0;
            char.pinned = true; char.loopVX = 0; char.loopVY = ACTION_BEHAVIORS.stairs.vy;
            setTimeout(() => { char.pinned = false; char.loopVY = 0; char.y = BASE_Y; }, 2500);
            break;

        case 'WAITING_INPUT':
            char.state = 'run'; char.frame = 0; char.timer = 0;
            char.pinned = true; char.loopVX = ACTION_BEHAVIORS.run.vx; char.loopVY = 0;
            char.flip = false;
            playNotificationSound();
            addToHistory('Esperando input', data.message || '');
            setTimeout(() => { char.pinned = false; char.loopVX = 0; }, 3000);
            break;

        case 'SLEEPING':
            if (!char.pinned) { char.state = 'sleep'; char.frame = 0; char.timer = 0; }
            break;

        case 'MISTAKE':
            playSadSound();
            char.state = 'die'; char.frame = 0; char.timer = 0;
            char.pinned = true; char.loopVX = 0; char.loopVY = 0;
            addToHistory('Error', data.message || '');
            setTimeout(() => { char.pinned = false; char.state = 'idle'; char.frame = 0; }, 2500);
            break;

        case 'PLAN_CHANGED':
            char.state = 'fall'; char.frame = 0; char.timer = 0;
            char.pinned = true; char.loopVX = 0; char.loopVY = ACTION_BEHAVIORS.fall.vy;
            addToHistory('Plan actualizado', data.message || '');
            playNotificationSound();
            setTimeout(() => { char.pinned = false; char.loopVY = 0; char.y = BASE_Y; }, 1500);
            break;

        case 'DANGER':
            playDangerSound();
            char.state = 'hurt'; char.frame = 0; char.timer = 0;
            char.pinned = true; char.loopVX = 0; char.loopVY = 0;
            addToHistory('Peligro', data.message || '');
            setTimeout(() => { char.pinned = false; }, 900);
            break;

        case 'STOP':
            char.pinned = false; char.loopVX = 0; char.loopVY = 0;
            char.y = BASE_Y; char.targetX = char.x;
            break;

        case 'PING':
            break;
    }
});

// --- Drag to move window ---

let dragging = false, dragLastX = 0, dragLastY = 0, didDrag = false;
canvas.addEventListener('mousedown', (e) => { dragging = true; didDrag = false; dragLastX = e.screenX; dragLastY = e.screenY; e.preventDefault(); });
window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    didDrag = true;
    const dx = e.screenX - dragLastX, dy = e.screenY - dragLastY;
    dragLastX = e.screenX; dragLastY = e.screenY;
    window.electronAPI.moveWindow(dx, dy);
});
window.addEventListener('mouseup', () => { dragging = false; });
container.addEventListener('click', () => { if (!didDrag) pergamino.classList.toggle('hidden'); });
document.getElementById('close-log').addEventListener('click', (e) => { e.stopPropagation(); pergamino.classList.add('hidden'); });

// --- Sleep / wake system ---

let lastMessageTime = Date.now();
const SLEEP_DELAY_MS = 2 * 60 * 1000;
setInterval(() => {
    if (char.pinned || char.state !== 'idle') return;
    if (Date.now() - lastMessageTime > SLEEP_DELAY_MS) { char.state = 'sleep'; char.frame = 0; char.timer = 0; }
}, 10000);

// --- Init ---
char.y = BASE_Y; char.targetX = char.x;
setInterval(updateTime, 60000);
updateTime();
generateMap(0);
renderTaskList();
draw();
