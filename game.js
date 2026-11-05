const canvas = document.getElementById('cubeCanvas');
const ctx = canvas.getContext('2d');
const flash = document.getElementById('flash');
const chromatic = document.getElementById('chromatic');
const rollText = document.getElementById('rollText');
const rarityTable = document.getElementById('rarityTable');
const inventoryEl = document.getElementById('inventory');
const lastRollEl = document.getElementById('lastRoll');
const luckEl = document.getElementById('luck');
const speedEl = document.getElementById('speed');
const rollsEl = document.getElementById('rolls');
const creditsEl = document.getElementById('credits');
const shopBtn = document.getElementById('shopBtn');
const shopModal = document.getElementById('shopModal');
const shopItems = document.getElementById('shopItems');
const shopCredits = document.getElementById('shopCredits');
const shopClose = document.getElementById('shopClose');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const upgrades = [
  { id: 'auto', name: 'Auto Roll', desc: 'rolls automatically based on speed', cost: 100 },
  { id: 'x10', name: 'x10 Multiplier', desc: 'roll 10 cubes at once', cost: 500 },
  { id: 'x100', name: 'x100 Multiplier', desc: 'roll 100 cubes at once', cost: 2500 },
];

const rarities = [
  { name: 'Dust',      odds: 1.5,       cap: 2,        color: '#8a9199', glow: '#aab4bd', luck: 0.1,   speed: 0.02,  particles: 12,  shake: 2,   flash: 0.02, chroma: 0 },
  { name: 'Scrap',     odds: 3,         cap: 5,        color: '#6b9e5e', glow: '#9eff8a', luck: 0.25,  speed: 0.04,  particles: 16,  shake: 3,   flash: 0.03, chroma: 0 },
  { name: 'Common',    odds: 8,         cap: 10,       color: '#d8e6f2', glow: '#ffffff', luck: 0.5,   speed: 0.06,  particles: 20,  shake: 4,   flash: 0.04, chroma: 0 },
  { name: 'Uncommon',  odds: 25,        cap: 50,       color: '#5ad06a', glow: '#8eff9e', luck: 1.5,   speed: 0.10,  particles: 28,  shake: 5,   flash: 0.06, chroma: 0.05 },
  { name: 'Rare',      odds: 120,       cap: 300,      color: '#5ad0ff', glow: '#9eefff', luck: 8,     speed: 0.18,  particles: 40,  shake: 7,   flash: 0.10, chroma: 0.1 },
  { name: 'Epic',      odds: 800,       cap: 2000,     color: '#b85aff', glow: '#e5a0ff', luck: 40,    speed: 0.30,  particles: 60,  shake: 10,  flash: 0.16, chroma: 0.18 },
  { name: 'Legendary', odds: 6000,      cap: 20000,    color: '#ffce5a', glow: '#ffeeaa', luck: 250,   speed: 0.55,  particles: 90,  shake: 14,  flash: 0.25, chroma: 0.28 },
  { name: 'Mythic',    odds: 60000,     cap: 200000,   color: '#ff4a4a', glow: '#ffaaaa', luck: 1800,  speed: 1.0,   particles: 130, shake: 20,  flash: 0.38, chroma: 0.40 },
  { name: 'Divine',    odds: 800000,    cap: 3000000,  color: '#a0f0ff', glow: '#e0ffff', luck: 15000, speed: 2.0,   particles: 180, shake: 28,  flash: 0.55, chroma: 0.55 },
  { name: 'Cosmic',    odds: 12000000,  cap: 60000000, color: 'rainbow',  glow: '#ffffff', luck: 250000,speed: 5.0,   particles: 260, shake: 40,  flash: 0.75, chroma: 0.72 },
  { name: 'Null',      odds: 250000000, cap: 1500000000,color:'#0a0a0a', glow: '#ffffff', luck: 5000000,speed: 15.0,  particles: 360, shake: 60,  flash: 0.90, chroma: 0.90 },
  { name: '???',       odds: 10000000000,cap:100000000000,color:'prism',  glow: '#ffffff', luck: 200000000,speed:50.0, particles: 500, shake: 100, flash: 1.00, chroma: 1.00 },
];

let inventory = {};
let baseLuck = 1;
let rolls = 0;
let credits = 0;
let autoRoll = false;
let multiplier = 1;
let unlocked = { auto: false, x10: false, x100: false };
let currentRarity = rarities[0];
let particles = [];
let shake = 0;
let chroma = 0;
let cubeRot = 0;
let lastRollTime = 0;
let autoTimer = 0;
let autoInterval = 1000;

function formatNum(n) {
  if (n < 1000) return n.toFixed(n < 10 ? 2 : 0);
  const suffixes = ['K','M','B','T','qd','Qn','sx','Sp','O','N','de'];
  const exp = Math.floor(Math.log10(n) / 3);
  if (exp >= suffixes.length) return n.toExponential(2);
  const short = n / Math.pow(10, exp * 3);
  return short.toFixed(2) + suffixes[exp - 1];
}

function getTotals() {
  let luck = baseLuck;
  let speed = 1;
  for (const r of rarities) {
    const count = inventory[r.name] || 0;
    luck += count * r.luck;
    speed += count * r.speed;
  }
  return { luck, speed };
}

function getProbabilities() {
  const totals = getTotals();
  const luck = totals.luck;
  const weights = rarities.map(r => {
    const eff = Math.min(r.odds <= 1 ? 1 : (1 / r.odds) * luck, (1 / r.odds) * r.cap);
    return eff;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / total);
}

function rollOne() {
  const probs = getProbabilities();
  const x = Math.random();
  let cum = 0;
  for (let i = 0; i < rarities.length; i++) {
    cum += probs[i];
    if (x <= cum) return rarities[i];
  }
  return rarities[rarities.length - 1];
}

function triggerRoll(count = 1) {
  let best = null;
  for (let i = 0; i < count; i++) {
    const r = rollOne();
    inventory[r.name] = (inventory[r.name] || 0) + 1;
    baseLuck += 0.02;
    rolls++;
    credits += multiplier;
    if (!best || rarities.indexOf(r) > rarities.indexOf(best)) best = r;
  }
  currentRarity = best;
  const idx = rarities.indexOf(best);
  triggerEffects(best);
  playTone(idx);
  updateUI();
  showRollText(best);
}

function triggerEffects(r) {
  shake = Math.max(shake, r.shake);
  chroma = Math.min(1, chroma + r.chroma);
  flash.style.opacity = r.flash;
  setTimeout(() => { flash.style.opacity = 0; }, 80);
  spawnParticles(r.particles, r.color, r.glow);
}

function spawnParticles(n, color, glow) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 8;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      size: 2 + Math.random() * 4,
      color,
      glow
    });
  }
}

function playTone(rarityIndex) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = rarityIndex > 7 ? 'sawtooth' : 'sine';
  osc.frequency.value = 220 + rarityIndex * 90 + Math.random() * 40;
  gain.gain.value = 0.05;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.25);
}

function showRollText(r) {
  rollText.querySelector('.rarity-name').textContent = r.name;
  rollText.querySelector('.rarity-name').style.color = r.color === 'rainbow' ? '#fff' : r.color === 'prism' ? '#fff' : r.color;
  rollText.querySelector('.rarity-tag').textContent = 'CUBE ROLLED';
  rollText.style.opacity = 1;
  rollText.style.transform = 'translateX(-50%) scale(1.1)';
  lastRollTime = Date.now();
  setTimeout(() => {
    if (Date.now() - lastRollTime >= 900) {
      rollText.style.opacity = 0;
      rollText.style.transform = 'translateX(-50%) scale(1)';
    }
  }, 1000);
}

function getRarityColor(r, t) {
  if (r.color === 'rainbow') {
    const hue = (t * 120) % 360;
    return `hsl(${hue}, 90%, 60%)`;
  }
  if (r.color === 'prism') {
    const hue = (t * 240) % 360;
    return `hsl(${hue}, 100%, 70%)`;
  }
  return r.color;
}

function draw() {
  const t = Date.now() / 1000;
  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  if (shake > 0) {
    const s = shake;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    shake *= 0.92;
    if (shake < 0.3) shake = 0;
  }

  ctx.clearRect(0, 0, w, h);

  // background vignette
  const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.6);
  grad.addColorStop(0, 'rgba(20, 40, 58, 0.35)');
  grad.addColorStop(1, 'rgba(2, 3, 4, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // central cube
  const size = Math.min(w, h) * 0.22;
  const cx = w / 2;
  const cy = h / 2;
  cubeRot += 0.01 + (getTotals().speed * 0.002);

  const col = getRarityColor(currentRarity, t);
  const glow = currentRarity.glow;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(cubeRot);

  ctx.shadowColor = glow;
  ctx.shadowBlur = 40 + Math.sin(t * 4) * 10;
  ctx.fillStyle = col;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.strokeRect(-size / 2, -size / 2, size, size);

  // inner cross
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(-size / 2, -size / 2);
  ctx.lineTo(size / 2, size / 2);
  ctx.moveTo(size / 2, -size / 2);
  ctx.lineTo(-size / 2, size / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= p.decay;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    const pc = getRarityColor({ color: p.color }, t);
    ctx.globalAlpha = p.life;
    ctx.fillStyle = pc;
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 8;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;

  ctx.restore();

  // chromatic overlay
  chromatic.style.opacity = Math.max(0, chroma * 0.35);
  chroma *= 0.96;
  if (chroma < 0.01) chroma = 0;

  requestAnimationFrame(draw);
}

function updateUI() {
  const totals = getTotals();
  luckEl.textContent = formatNum(totals.luck) + 'x';
  speedEl.textContent = formatNum(totals.speed) + '/s';
  rollsEl.textContent = formatNum(rolls);
  creditsEl.textContent = formatNum(credits);

  autoInterval = 1000 / totals.speed;

  renderControls();
  renderShop();
  renderRarityTable(totals.luck);
  renderInventory();
  lastRollEl.innerHTML = `last roll: <strong style="color:${currentRarity.color === 'rainbow' ? '#fff' : currentRarity.color === 'prism' ? '#fff' : currentRarity.color}">${currentRarity.name}</strong>`;
}

function renderRarityTable(luck) {
  const probs = getProbabilities();
  rarityTable.innerHTML = '';
  for (let i = rarities.length - 1; i >= 0; i--) {
    const r = rarities[i];
    const p = probs[i];
    const odds = p > 0 ? Math.round(1 / p) : '∞';
    const row = document.createElement('div');
    row.className = 'rarity-row';
    row.innerHTML = `
      <div style="display:flex;align-items:center;flex:1">
        <div class="dot" style="background:${r.color === 'rainbow' ? 'linear-gradient(45deg,#f0a,#0ff,#8f0)' : r.color === 'prism' ? 'conic-gradient(#f0a,#0ff,#8f0,#f0a)' : r.color}; color:${r.color}"></div>
        <span class="name">${r.name}</span>
      </div>
      <span class="odds">1/${formatNum(odds)}</span>
    `;
    rarityTable.appendChild(row);
  }
}

function renderInventory() {
  inventoryEl.innerHTML = '';
  const list = rarities.slice().reverse().filter(r => inventory[r.name]);
  if (list.length === 0) {
    inventoryEl.innerHTML = '<div style="color:var(--muted);font-size:11px;text-align:center;padding-top:20px">no auras yet. roll.</div>';
    return;
  }
  for (const r of list) {
    const count = inventory[r.name];
    const item = document.createElement('div');
    item.className = 'inv-item';
    item.innerHTML = `
      <div class="icon" style="background:${r.color === 'rainbow' ? 'linear-gradient(45deg,#f0a,#0ff,#8f0)' : r.color === 'prism' ? 'conic-gradient(#f0a,#0ff,#8f0,#f0a)' : r.color}; color:${r.color}"></div>
      <div class="info">
        <div class="name" style="color:${r.color === 'rainbow' || r.color === 'prism' ? '#fff' : r.color}">${r.name}</div>
        <div class="count">x${formatNum(count)}</div>
      </div>
      <div class="bonus">+${formatNum(count * r.luck)}x luck<br>+${formatNum(count * r.speed)}/s</div>
    `;
    inventoryEl.appendChild(item);
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function setMultiplier(n) {
  const key = n === 1 ? null : (n === 10 ? 'x10' : 'x100');
  if (key && !unlocked[key]) return;
  multiplier = n;
  renderControls();
}

function toggleAuto() {
  if (!unlocked.auto) return;
  autoRoll = !autoRoll;
  document.getElementById('autoBtn').classList.toggle('active', autoRoll);
}

function renderControls() {
  const autoBtn = document.getElementById('autoBtn');
  autoBtn.classList.toggle('active', autoRoll);
  autoBtn.classList.toggle('locked', !unlocked.auto);
  autoBtn.textContent = unlocked.auto ? 'AUTO' : 'AUTO 100';

  document.querySelectorAll('#controls button[data-mult]').forEach(b => {
    const n = parseInt(b.dataset.mult);
    const key = n === 10 ? 'x10' : 'x100';
    const own = n === 1 || unlocked[key];
    b.classList.toggle('active', multiplier === n);
    b.classList.toggle('locked', !own);
    b.textContent = own ? 'x' + n : 'x' + n + ' ' + upgrades.find(u => u.id === key).cost;
  });
}

function openShop() {
  shopModal.classList.add('open');
  renderShop();
}

function closeShop() {
  shopModal.classList.remove('open');
}

function buyUpgrade(id) {
  const up = upgrades.find(u => u.id === id);
  if (unlocked[id] || credits < up.cost) return;
  credits -= up.cost;
  unlocked[id] = true;
  if (id === 'x10' && multiplier === 100 && !unlocked.x100) multiplier = 1;
  if (id === 'auto') autoRoll = true;
  renderControls();
  renderShop();
  updateUI();
}

function renderShop() {
  shopCredits.textContent = formatNum(credits);
  shopItems.innerHTML = '';
  for (const up of upgrades) {
    const owned = unlocked[up.id];
    const canBuy = credits >= up.cost && !owned;
    const item = document.createElement('div');
    item.className = 'shop-item' + (owned ? ' owned' : '');
    item.innerHTML = `
      <div class="info">
        <div class="name">${up.name}</div>
        <div class="desc">${up.desc}</div>
      </div>
      <button ${canBuy ? '' : 'disabled'}>${owned ? 'OWNED' : up.cost + ' CR'}</button>
    `;
    if (!owned) {
      item.querySelector('button').addEventListener('click', () => buyUpgrade(up.id));
    }
    shopItems.appendChild(item);
  }
}

canvas.addEventListener('click', () => triggerRoll(multiplier));
window.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    triggerRoll(multiplier);
  }
});
window.addEventListener('resize', resize);

document.getElementById('rollBtn').addEventListener('click', () => triggerRoll(multiplier));
document.getElementById('autoBtn').addEventListener('click', toggleAuto);
document.querySelectorAll('#controls button[data-mult]').forEach(b => {
  b.addEventListener('click', () => setMultiplier(parseInt(b.dataset.mult)));
});
shopBtn.addEventListener('click', openShop);
shopClose.addEventListener('click', closeShop);
shopModal.addEventListener('click', e => { if (e.target === shopModal) closeShop(); });

let lastAuto = 0;
function loop(ts) {
  if (autoRoll) {
    if (ts - lastAuto > autoInterval) {
      triggerRoll(multiplier);
      lastAuto = ts;
    }
  }
  requestAnimationFrame(loop);
}

resize();
updateUI();
draw();
requestAnimationFrame(loop);
