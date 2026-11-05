const canvas = document.getElementById('cubeCanvas');
const ctx = canvas.getContext('2d');
const flash = document.getElementById('flash');
const chromatic = document.getElementById('chromatic');
const rollText = document.getElementById('rollText');
const rarityTable = document.getElementById('rarityTable');
const inventoryEl = document.getElementById('inventory');
const lastRollEl = document.getElementById('lastRoll');
const luckEl = document.getElementById('luck');
const rollsEl = document.getElementById('rolls');
const creditsEl = document.getElementById('credits');
const shopBtn = document.getElementById('shopBtn');
const shopModal = document.getElementById('shopModal');
const shopItems = document.getElementById('shopItems');
const shopCredits = document.getElementById('shopCredits');
const shopClose = document.getElementById('shopClose');
const achievementsBtn = document.getElementById('achievementsBtn');
const achievementsModal = document.getElementById('achievementsModal');
const achievementsList = document.getElementById('achievementsList');
const achievementsClose = document.getElementById('achievementsClose');
const changelogBtn = document.getElementById('changelogBtn');
const changelogModal = document.getElementById('changelogModal');
const changelogList = document.getElementById('changelogList');
const changelogClose = document.getElementById('changelogClose');
const toast = document.getElementById('toast');
const bestRollStat = document.getElementById('bestRollStat');
const playtimeStat = document.getElementById('playtimeStat');
const resetSaveBtn = document.getElementById('resetSaveBtn');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const upgrades = [
  { id: 'auto', name: 'Auto Roll', desc: 'rolls automatically every 0.8s', cost: 100, type: 'unlock' },
  { id: 'x10', name: 'x10 Multiplier', desc: 'roll 10 cubes at once', cost: 500, type: 'unlock' },
  { id: 'x100', name: 'x100 Multiplier', desc: 'roll 100 cubes at once', cost: 50000, type: 'unlock' },
  { id: 'luckBracelet', name: 'Luck Bracelet', desc: '+0.5 permanent luck', cost: 1000, type: 'stack', effect: { luck: 0.5 }, max: 10 },
  { id: 'luckyGloves', name: 'Lucky Gloves', desc: '+2 permanent luck', cost: 5000, type: 'stack', effect: { luck: 2 }, max: 5 },
  { id: 'fortuneTalisman', name: 'Fortune Talisman', desc: '+10 permanent luck', cost: 25000, type: 'stack', effect: { luck: 10 }, max: 3 },
];

const achievements = [
  { id: 'roll10', name: 'Just Getting Started', desc: 'roll 10 times', check: () => rolls >= 10, reward: { luck: 0.1 } },
  { id: 'roll100', name: 'Dedication', desc: 'roll 100 times', check: () => rolls >= 100, reward: { luck: 0.25 } },
  { id: 'roll1000', name: 'Addicted', desc: 'roll 1,000 times', check: () => rolls >= 1000, reward: { luck: 0.75 } },
  { id: 'roll10000', name: 'No Life', desc: 'roll 10,000 times', check: () => rolls >= 10000, reward: { luck: 2 } },
  { id: 'roll100000', name: 'Touch Grass', desc: 'roll 100,000 times', check: () => rolls >= 100000, reward: { luck: 5 } },
  { id: 'credits100', name: 'Pocket Change', desc: 'earn 100 credits', check: () => credits >= 100, reward: { luck: 0.1 } },
  { id: 'credits1000', name: 'Big Spender', desc: 'earn 1,000 credits', check: () => credits >= 1000, reward: { luck: 0.25 } },
  { id: 'credits10000', name: 'Economy Crusher', desc: 'earn 10,000 credits', check: () => credits >= 10000, reward: { luck: 0.75 } },
  { id: 'rare', name: 'First Spark', desc: 'roll a Rare cube', check: () => (inventory['Rare'] || 0) > 0, reward: { luck: 0.15 } },
  { id: 'celestial', name: 'Divine Light', desc: 'roll a Celestial cube', check: () => (inventory['Celestial'] || 0) > 0, reward: { luck: 0.25 } },
  { id: 'epic', name: 'Purple Haze', desc: 'roll an Epic cube', check: () => (inventory['Epic'] || 0) > 0, reward: { luck: 0.35 } },
  { id: 'frosted', name: 'Ice Cold', desc: 'roll a Frosted cube', check: () => (inventory['Frosted'] || 0) > 0, reward: { luck: 0.5 } },
  { id: 'legendary', name: 'Golden Child', desc: 'roll a Legendary cube', check: () => (inventory['Legendary'] || 0) > 0, reward: { luck: 1 } },
  { id: 'auric', name: 'Gold Rush', desc: 'roll an Auric cube', check: () => (inventory['Auric'] || 0) > 0, reward: { luck: 0.5 } },
  { id: 'mythic', name: 'Red Alert', desc: 'roll a Mythic cube', check: () => (inventory['Mythic'] || 0) > 0, reward: { luck: 1 } },
  { id: 'mystic', name: 'Wizard', desc: 'roll a Mystic cube', check: () => (inventory['Mystic'] || 0) > 0, reward: { luck: 3 } },
  { id: 'divine', name: 'Blessed', desc: 'roll a Divine cube', check: () => (inventory['Divine'] || 0) > 0, reward: { luck: 2 } },
  { id: 'nebula', name: 'Space Walk', desc: 'roll a Nebula cube', check: () => (inventory['Nebula'] || 0) > 0, reward: { luck: 5 } },
  { id: 'cosmic', name: 'Star Born', desc: 'roll a Cosmic cube', check: () => (inventory['Cosmic'] || 0) > 0, reward: { luck: 8 } },
  { id: 'ascended', name: 'Above All', desc: 'roll an Ascended cube', check: () => (inventory['Ascended'] || 0) > 0, reward: { luck: 5 } },
  { id: 'null', name: 'Error 404', desc: 'roll a Null cube', check: () => (inventory['Null'] || 0) > 0, reward: { luck: 15 } },
  { id: 'radiant', name: 'Glory', desc: 'roll a Radiant cube', check: () => (inventory['Radiant'] || 0) > 0, reward: { luck: 25 } },
  { id: 'ethereal', name: 'Ghost', desc: 'roll an Ethereal cube', check: () => (inventory['Ethereal'] || 0) > 0, reward: { luck: 40 } },
  { id: 'transcendent', name: 'Beyond', desc: 'roll a Transcendent cube', check: () => (inventory['Transcendent'] || 0) > 0, reward: { luck: 60 } },
  { id: 'quantum', name: 'Schrödinger', desc: 'roll a Quantum cube', check: () => (inventory['Quantum'] || 0) > 0, reward: { luck: 80 } },
  { id: 'abyss', name: 'Deep Dive', desc: 'roll an Abyss cube', check: () => (inventory['Abyss'] || 0) > 0, reward: { luck: 100 } },
  { id: 'eternal', name: 'Timeless', desc: 'roll an Eternal cube', check: () => (inventory['Eternal'] || 0) > 0, reward: { luck: 150 } },
  { id: 'sovereign', name: 'King', desc: 'roll a Sovereign cube', check: () => (inventory['Sovereign'] || 0) > 0, reward: { luck: 200 } },
  { id: 'infinity', name: 'Endless', desc: 'roll an Infinity cube', check: () => (inventory['Infinity'] || 0) > 0, reward: { luck: 300 } },
  { id: 'oblivion', name: 'Forgotten', desc: 'roll an Oblivion cube', check: () => (inventory['Oblivion'] || 0) > 0, reward: { luck: 500 } },
  { id: 'genesis', name: 'Creator', desc: 'roll a Genesis cube', check: () => (inventory['Genesis'] || 0) > 0, reward: { luck: 750 } },
  { id: 'apotheosis', name: 'Ascension', desc: 'roll an Apotheosis cube', check: () => (inventory['Apotheosis'] || 0) > 0, reward: { luck: 1500 } },
  { id: 'omnipotent', name: 'God Mode', desc: 'roll an Omnipotent cube', check: () => (inventory['Omnipotent'] || 0) > 0, reward: { luck: 2500 } },
  { id: 'absolute', name: 'Final Form', desc: 'roll an Absolute cube', check: () => (inventory['Absolute'] || 0) > 0, reward: { luck: 5000 } },
  { id: 'secret', name: '????', desc: 'roll a ??? cube', check: () => (inventory['???'] || 0) > 0, reward: { luck: 50000 } },
  { id: 'unlockAuto', name: 'Lazy Mode', desc: 'buy auto roll', check: () => unlocked.auto, reward: { luck: 0.1 } },
  { id: 'unlockX10', name: 'Bulk Buyer', desc: 'buy x10 multiplier', check: () => unlocked.x10, reward: { luck: 0.2 } },
  { id: 'unlockX100', name: 'Whale', desc: 'buy x100 multiplier', check: () => unlocked.x100, reward: { luck: 1 } },
];

const changelog = [
  { version: 'v0.5', note: 'removed speed stat, credits scale with rarity, x100 is 50k, 33 rarities, luck caps at 100M (bracelets bypass)' },
  { version: 'v0.4', note: 'added achievements that give permanent luck/speed boosts + update log' },
  { version: 'v0.3', note: 'added localStorage save/load, nerfed auto roll to half speed' },
  { version: 'v0.2', note: 'added shop: auto roll, x10, x100 locked behind credits' },
  { version: 'v0.1', note: 'initial release: rolling, rarities, inventory, particles' },
];

let achievementsUnlocked = {};

const rarities = [
  { name: 'Dust',        odds: 1.5,        cap: 2,          color: '#8a9199', glow: '#aab4bd', luck: 0.1,     particles: 12,  shake: 2,    flash: 0.02, chroma: 0 },
  { name: 'Scrap',       odds: 3,          cap: 5,          color: '#6b9e5e', glow: '#9eff8a', luck: 0.25,    particles: 16,  shake: 3,    flash: 0.03, chroma: 0 },
  { name: 'Common',      odds: 8,          cap: 10,         color: '#d8e6f2', glow: '#ffffff', luck: 0.5,     particles: 20,  shake: 4,    flash: 0.04, chroma: 0 },
  { name: 'Good',        odds: 16,         cap: 24,         color: '#5af0a0', glow: '#a0ffd0', luck: 1.0,     particles: 24,  shake: 4.5,  flash: 0.05, chroma: 0 },
  { name: 'Uncommon',    odds: 25,         cap: 50,         color: '#5ad06a', glow: '#8eff9e', luck: 1.5,     particles: 28,  shake: 5,    flash: 0.06, chroma: 0.05 },
  { name: 'Rare',        odds: 120,        cap: 300,        color: '#5ad0ff', glow: '#9eefff', luck: 8,       particles: 40,  shake: 7,    flash: 0.10, chroma: 0.1 },
  { name: 'Celestial',   odds: 300,        cap: 900,        color: '#f0e6a0', glow: '#fff8c0', luck: 18,      particles: 48,  shake: 8,    flash: 0.12, chroma: 0.12 },
  { name: 'Epic',        odds: 800,        cap: 2000,       color: '#b85aff', glow: '#e5a0ff', luck: 40,      particles: 60,  shake: 10,   flash: 0.16, chroma: 0.18 },
  { name: 'Frosted',     odds: 2500,       cap: 8000,       color: '#00f0d0', glow: '#80fff0', luck: 100,     particles: 72,  shake: 11,   flash: 0.19, chroma: 0.22 },
  { name: 'Legendary',   odds: 6000,       cap: 20000,      color: '#ffce5a', glow: '#ffeeaa', luck: 250,     particles: 90,  shake: 14,   flash: 0.25, chroma: 0.28 },
  { name: 'Auric',       odds: 25000,      cap: 100000,     color: '#d4af37', glow: '#ffe070', luck: 750,     particles: 110, shake: 16,   flash: 0.30, chroma: 0.32 },
  { name: 'Mythic',      odds: 60000,      cap: 200000,     color: '#ff4a4a', glow: '#ffaaaa', luck: 1800,    particles: 130, shake: 20,   flash: 0.38, chroma: 0.40 },
  { name: 'Mystic',      odds: 400000,     cap: 2500000,    color: '#a020f0', glow: '#d080ff', luck: 12000,   particles: 170, shake: 25,   flash: 0.50, chroma: 0.50 },
  { name: 'Divine',      odds: 800000,     cap: 3000000,    color: '#a0f0ff', glow: '#e0ffff', luck: 15000,   particles: 180, shake: 28,   flash: 0.55, chroma: 0.55 },
  { name: 'Nebula',      odds: 5000000,    cap: 25000000,   color: '#4050ff', glow: '#8090ff', luck: 80000,   particles: 220, shake: 34,   flash: 0.65, chroma: 0.62 },
  { name: 'Cosmic',      odds: 12000000,   cap: 60000000,   color: 'rainbow',  glow: '#ffffff', luck: 250000,  particles: 260, shake: 40,   flash: 0.75, chroma: 0.72 },
  { name: 'Ascended',    odds: 150000000,  cap: 800000000,  color: '#ff8040', glow: '#ffbc80', luck: 2500000, particles: 320, shake: 50,   flash: 0.82, chroma: 0.78 },
  { name: 'Null',        odds: 250000000,  cap: 1500000000, color:'#0a0a0a',  glow: '#ffffff', luck: 5000000, particles: 360, shake: 60,   flash: 0.90, chroma: 0.90 },
  { name: 'Radiant',     odds: 3000000000, cap: 20000000000,color: '#fff0c0', glow: '#fffee0', luck: 50000000,particles: 430, shake: 80,   flash: 0.95, chroma: 0.95 },
  { name: 'Ethereal',    odds: 10000000000,cap: 65000000000,color: '#c0c0ff', glow: '#e0e0ff', luck: 150000000,particles: 460, shake: 90,   flash: 0.96, chroma: 0.96 },
  { name: 'Transcendent',odds: 35000000000,cap: 210000000000,color:'#ff60ff', glow: '#ffb0ff', luck: 450000000,particles: 490, shake: 100,  flash: 0.97, chroma: 0.97 },
  { name: 'Quantum',     odds: 130000000000,cap: 715000000000,color:'#00ffff', glow: '#a0ffff', luck: 1400000000,particles: 520, shake: 110,  flash: 0.975,chroma: 0.975},
  { name: 'Abyss',       odds: 500000000000,cap: 2500000000000,color:'#1a0a30', glow: '#7030ff', luck: 5000000000,particles: 550, shake: 120,  flash: 0.98, chroma: 0.98 },
  { name: 'Eternal',     odds: 1800000000000,cap: 8100000000000,color:'#ffd700', glow: '#ffff80', luck: 20000000000,particles: 580, shake: 130,  flash: 0.985,chroma: 0.985},
  { name: 'Sovereign',   odds: 7000000000000,cap: 28000000000000,color:'#ff0040', glow: '#ff80a0', luck: 90000000000,particles: 610, shake: 140,  flash: 0.99, chroma: 0.99 },
  { name: 'Infinity',    odds: 30000000000000,cap: 105000000000000,color:'#8000ff', glow: '#c080ff', luck: 450000000000,particles: 640, shake: 150,  flash: 0.992,chroma: 0.992},
  { name: 'Oblivion',    odds: 120000000000000,cap: 360000000000000,color:'#050505', glow: '#ff0000', luck: 2500000000000,particles: 670, shake: 160,  flash: 0.994,chroma: 0.994},
  { name: 'Genesis',     odds: 500000000000000,cap: 1250000000000000,color:'#ffffff', glow: '#c0ffe0', luck: 15000000000000,particles: 700, shake: 170,  flash: 0.996,chroma: 0.996},
  { name: 'Apotheosis',  odds: 2000000000000000,cap: 4000000000000000,color:'#ff80c0', glow: '#ffc0e0', luck: 90000000000000,particles: 730, shake: 180,  flash: 0.998,chroma: 0.998},
  { name: 'Omnipotent',  odds: 8000000000000000,cap: 12800000000000000,color:'#00ff80', glow: '#80ffc0', luck: 600000000000000,particles: 760, shake: 190,  flash: 0.999,chroma: 0.999},
  { name: 'Absolute',    odds: 35000000000000000,cap: 42000000000000000,color:'#ff0000', glow: '#ffff00', luck: 5000000000000000,particles: 790, shake: 200,  flash: 1.00, chroma: 1.00 },
  { name: '???',         odds: 150000000000000000,cap:150000000000000000,color:'prism',    glow: '#ffffff', luck: 50000000000000000,particles: 850, shake: 220,  flash: 1.00, chroma: 1.00 },
];

let inventory = {};
let baseLuck = 1;
let rolls = 0;
let credits = 0;
let autoRoll = false;
let multiplier = 1;
let unlocked = { auto: false, x10: false, x100: false };
let shopCounts = { luckBracelet: 0, luckyGloves: 0, fortuneTalisman: 0 };
let currentRarity = rarities[0];
let particles = [];
let shake = 0;
let chroma = 0;
let cubeRot = 0;
let lastRollTime = 0;
let bestRarityIndex = 0;
let startTime = Date.now();
let autoInterval = 1000;

function formatNum(n) {
  if (n < 1000) return n.toFixed(n < 10 ? 2 : 0);
  const suffixes = ['K','M','B','T','qd','Qn','sx','Sp','O','N','de'];
  const exp = Math.floor(Math.log10(n) / 3);
  if (exp >= suffixes.length) return n.toExponential(2);
  const short = n / Math.pow(10, exp * 3);
  return short.toFixed(2) + suffixes[exp - 1];
}

function getAchievementBonus() {
  let luck = 0;
  for (const a of achievements) {
    if (achievementsUnlocked[a.id]) {
      luck += a.reward.luck || 0;
    }
  }
  return luck;
}

function getShopBonus() {
  let luck = 0;
  for (const up of upgrades) {
    if (up.type === 'stack') {
      luck += (shopCounts[up.id] || 0) * (up.effect.luck || 0);
    }
  }
  return luck;
}

function getTotals() {
  let luck = baseLuck + getAchievementBonus();
  for (const r of rarities) {
    luck += (inventory[r.name] || 0) * r.luck;
  }
  luck = Math.min(luck, 100000000);
  luck += getShopBonus();
  return luck;
}

function getProbabilities() {
  const luck = getTotals();
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
    const idx = rarities.indexOf(r);
    credits += multiplier * Math.floor(Math.pow(1.4, idx) * 2);
    if (!best || idx > rarities.indexOf(best)) best = r;
  }
  currentRarity = best;
  const idx = rarities.indexOf(best);
  if (idx > bestRarityIndex) bestRarityIndex = idx;
  triggerEffects(best);
  playTone(idx);
  updateUI();
  showRollText(best);
  checkAchievements();
  saveGame();
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

  const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.6);
  grad.addColorStop(0, 'rgba(20, 40, 58, 0.35)');
  grad.addColorStop(1, 'rgba(2, 3, 4, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const size = Math.min(w, h) * 0.22;
  const cx = w / 2;
  const cy = h / 2;
  cubeRot += 0.03;

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

  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(-size / 2, -size / 2);
  ctx.lineTo(size / 2, size / 2);
  ctx.moveTo(size / 2, -size / 2);
  ctx.lineTo(-size / 2, size / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();

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

  chromatic.style.opacity = Math.max(0, chroma * 0.35);
  chroma *= 0.96;
  if (chroma < 0.01) chroma = 0;

  requestAnimationFrame(draw);
}

function updateUI() {
  const luck = getTotals();
  luckEl.textContent = formatNum(luck) + 'x';
  rollsEl.textContent = formatNum(rolls);
  creditsEl.textContent = formatNum(credits);

  autoInterval = 800;

  renderControls();
  renderShop();
  renderRarityTable(luck);
  renderInventory();
  lastRollEl.innerHTML = `last roll: <strong style="color:${currentRarity.color === 'rainbow' ? '#fff' : currentRarity.color === 'prism' ? '#fff' : currentRarity.color}">${currentRarity.name}</strong>`;

  const best = rarities[bestRarityIndex];
  bestRollStat.innerHTML = `<span style="color:${best.color === 'rainbow' ? '#fff' : best.color === 'prism' ? '#fff' : best.color}">${best.name}</span>`;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const pt = elapsed < 60 ? elapsed + 's' : elapsed < 3600 ? Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's' : Math.floor(elapsed / 3600) + 'h ' + Math.floor((elapsed % 3600) / 60) + 'm';
  playtimeStat.textContent = pt;
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
      <div class="bonus">+${formatNum(count * r.luck)}x luck</div>
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
  if (autoRoll && n > 1) return;
  const key = n === 1 ? null : (n === 10 ? 'x10' : 'x100');
  if (key && !unlocked[key]) return;
  multiplier = n;
  renderControls();
}

function toggleAuto() {
  if (!unlocked.auto) return;
  autoRoll = !autoRoll;
  if (autoRoll) {
    multiplier = 1;
  }
  document.getElementById('autoBtn').classList.toggle('active', autoRoll);
  renderControls();
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
    const lockedByAuto = autoRoll && n > 1;
    b.classList.toggle('active', multiplier === n);
    b.classList.toggle('locked', !own || lockedByAuto);
    b.textContent = own ? 'x' + n : 'x' + n + ' ' + upgrades.find(u => u.id === key).cost;
    b.disabled = lockedByAuto;
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
  if (up.type === 'unlock') {
    if (unlocked[id] || credits < up.cost) return;
    credits -= up.cost;
    unlocked[id] = true;
    if (id === 'x10' && multiplier === 100 && !unlocked.x100) multiplier = 1;
    if (id === 'auto') autoRoll = true;
  } else {
    const count = shopCounts[id] || 0;
    if (count >= up.max || credits < up.cost) return;
    credits -= up.cost;
    shopCounts[id] = count + 1;
  }
  renderControls();
  renderShop();
  updateUI();
  saveGame();
}

function renderShop() {
  shopCredits.textContent = formatNum(credits);
  shopItems.innerHTML = '';
  for (const up of upgrades) {
    const isUnlock = up.type === 'unlock';
    const owned = isUnlock && unlocked[up.id];
    const count = shopCounts[up.id] || 0;
    const maxed = !isUnlock && count >= up.max;
    const canBuy = credits >= up.cost && !owned && !maxed;
    const item = document.createElement('div');
    item.className = 'shop-item' + ((owned || maxed) ? ' owned' : '');
    const countText = isUnlock ? '' : ` (${count}/${up.max})`;
    item.innerHTML = `
      <div class="info">
        <div class="name">${up.name}${countText}</div>
        <div class="desc">${up.desc}</div>
      </div>
      <button ${canBuy ? '' : 'disabled'}>${owned ? 'OWNED' : maxed ? 'MAXED' : up.cost + ' CR'}</button>
    `;
    if (!owned && !maxed) {
      item.querySelector('button').addEventListener('click', () => buyUpgrade(up.id));
    }
    shopItems.appendChild(item);
  }
}

function renderAchievements() {
  achievementsList.innerHTML = '';
  for (const a of achievements) {
    const own = achievementsUnlocked[a.id];
    const el = document.createElement('div');
    el.className = 'achievement' + (own ? ' unlocked' : '');
    const rwd = a.reward.luck ? '+' + a.reward.luck + ' luck' : '';
    el.innerHTML = `
      <div class="icon">${own ? '★' : '☆'}</div>
      <div class="info">
        <div class="name">${a.name}</div>
        <div class="desc">${a.desc}</div>
      </div>
      <div class="reward">${rwd}</div>
    `;
    achievementsList.appendChild(el);
  }
}

function renderChangelog() {
  changelogList.innerHTML = '';
  for (const c of changelog) {
    const el = document.createElement('div');
    el.className = 'changelog-item';
    el.innerHTML = `<div class="version">${c.version}</div><div class="note">${c.note}</div>`;
    changelogList.appendChild(el);
  }
}

function openModal(modal) { modal.classList.add('open'); }
function closeModal(modal) { modal.classList.remove('open'); }

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
shopBtn.addEventListener('click', () => { openModal(shopModal); renderShop(); });
shopClose.addEventListener('click', () => closeModal(shopModal));
shopModal.addEventListener('click', e => { if (e.target === shopModal) closeModal(shopModal); });

achievementsBtn.addEventListener('click', () => { openModal(achievementsModal); renderAchievements(); });
achievementsClose.addEventListener('click', () => closeModal(achievementsModal));
achievementsModal.addEventListener('click', e => { if (e.target === achievementsModal) closeModal(achievementsModal); });

changelogBtn.addEventListener('click', () => { openModal(changelogModal); renderChangelog(); });
changelogClose.addEventListener('click', () => closeModal(changelogModal));
changelogModal.addEventListener('click', e => { if (e.target === changelogModal) closeModal(changelogModal); });
resetSaveBtn.addEventListener('click', resetSave);

const SAVE_VERSION = 2;

function saveGame() {
  try {
    localStorage.setItem('luxRngSave', JSON.stringify({
      saveVersion: SAVE_VERSION, inventory, baseLuck, rolls, credits, unlocked, shopCounts, multiplier, autoRoll, achievementsUnlocked, bestRarityIndex, startTime
    }));
  } catch (e) {}
}

function loadGame() {
  try {
    const raw = localStorage.getItem('luxRngSave');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.inventory) inventory = data.inventory;
    if (typeof data.baseLuck === 'number') baseLuck = data.baseLuck;
    if (typeof data.rolls === 'number') rolls = data.rolls;
    if (typeof data.credits === 'number') credits = data.credits;
    if (data.unlocked) unlocked = { ...unlocked, ...data.unlocked };
    if (data.shopCounts) shopCounts = { ...shopCounts, ...data.shopCounts };
    if (typeof data.multiplier === 'number') multiplier = data.multiplier;
    if (typeof data.autoRoll === 'boolean') autoRoll = data.autoRoll;
    if (data.achievementsUnlocked) achievementsUnlocked = { ...achievementsUnlocked, ...data.achievementsUnlocked };
    if (typeof data.startTime === 'number') startTime = data.startTime;
    if (typeof data.bestRarityIndex === 'number' && data.saveVersion === SAVE_VERSION) bestRarityIndex = data.bestRarityIndex;

    // migrate renamed rarities from pre-original-name saves
    const renameMap = { Divinus: 'Celestial', Crystallized: 'Frosted', Gilded: 'Auric', Arcane: 'Mystic', Galaxy: 'Nebula', Exalted: 'Ascended', Glorious: 'Radiant' };
    for (const [oldName, newName] of Object.entries(renameMap)) {
      if (inventory[oldName]) {
        inventory[newName] = (inventory[newName] || 0) + inventory[oldName];
        delete inventory[oldName];
      }
    }
  } catch (e) {}
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function resetSave() {
  if (!confirm('reset all progress? this cannot be undone.')) return;
  inventory = {};
  baseLuck = 1;
  rolls = 0;
  credits = 0;
  autoRoll = false;
  multiplier = 1;
  unlocked = { auto: false, x10: false, x100: false };
  shopCounts = { luckBracelet: 0, luckyGloves: 0, fortuneTalisman: 0 };
  achievementsUnlocked = {};
  bestRarityIndex = 0;
  startTime = Date.now();
  currentRarity = rarities[0];
  localStorage.removeItem('luxRngSave');
  updateUI();
  showToast('save reset');
}

function checkAchievements() {
  let newUnlock = false;
  for (const a of achievements) {
    if (!achievementsUnlocked[a.id] && a.check()) {
      achievementsUnlocked[a.id] = true;
      newUnlock = true;
      showToast('achievement unlocked: ' + a.name);
    }
  }
  if (newUnlock) {
    saveGame();
    renderAchievements();
  }
}

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

loadGame();
resize();
updateUI();
draw();
requestAnimationFrame(loop);