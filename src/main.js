/**
 * Impact Typer — Main App
 * 爆音・爆破エディタ メインロジック
 */

import './style.css';
import { SoundEngine } from './sound.js';
import { ParticleSystem } from './particles.js';

// =======================================
// Combo texts
// =======================================
const COMBO_TEXTS = {
  5:   ['NICE!', 'HOT!', 'YEAH!'],
  10:  ['GREAT!', 'BOOM!', '爆発！'],
  20:  ['INSANE!', 'NUCLEAR!', '超爆発！'],
  30:  ['GODLIKE!', 'OBLITERATED!', '世界崩壊！'],
  50:  ['LEGENDARY!!', '💥UNSTOPPABLE💥', '宇宙消滅！！'],
  100: ['🌟 TRANSCENDENT 🌟', '💀 WORLD DESTROYER 💀'],
};

const INTENSITY_LABELS = ['CALM', 'HOT', 'RAGING', 'INFERNO', 'APOCALYPSE'];
const INTENSITY_COLORS = ['var(--accent-green)', 'var(--accent-yellow)', 'var(--accent-orange)', 'var(--accent-red)', '#ff00ff'];

const ACHIEVEMENTS = [
  { id: 'first_key', chars: 1, title: '🎬 ACTION!', msg: '最初の一撃。映画が始まった。' },
  { id: 'ten_keys',  chars: 10, title: '💥 HEATING UP', msg: '10文字。体が震えてきた。' },
  { id: 'fifty',     chars: 50, title: '🔥 ON FIRE', msg: '50文字。もはや人間ではない。' },
  { id: 'century',   chars: 100, title: '☢️ NUCLEAR TYPIST', msg: '100文字。世界の終わりが始まる。' },
  { id: 'five_hundred', chars: 500, title: '🌌 GODFORM', msg: '500文字。お前はタイピングの神だ。' },
];

// =======================================
// App State
// =======================================
const state = {
  mode: 'explosion',
  combo: 0,
  comboTimer: null,
  charCount: 0,
  intensity: 0,
  intensityDecayTimer: null,
  muted: false,
  unlockedAchievements: new Set(),
  lastKeyTime: 0,
  keysPerSecond: 0,
  recentKeys: [],
};

// =======================================
// DOM References
// =======================================
const app       = document.getElementById('app');
const editor    = document.getElementById('editor');
const canvas    = document.getElementById('particle-canvas');
const flash     = document.getElementById('flash-overlay');
const comboEl   = document.getElementById('combo-value');
const charEl    = document.getElementById('char-count');
const intensityLabel = document.getElementById('intensity-label');
const intensityBar   = document.getElementById('intensity-bar');
const intensityBarGlow = document.getElementById('intensity-bar-glow');
const comboPopup = document.getElementById('combo-popup');
const achToast   = document.getElementById('achievement-toast');
const editorWrapper = document.getElementById('editor-wrapper');

// =======================================
// Engine Initialization
// =======================================
const sound = new SoundEngine();
const particles = new ParticleSystem(canvas);

// =======================================
// Utility
// =======================================
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getEditorCaretPosition() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  // Use a proxy approach with the editor textarea
  const rect = editor.getBoundingClientRect();
  // Approximate caret position within the editor
  const x = rect.left + rect.width * 0.3 + Math.random() * rect.width * 0.4;
  const y = rect.top + rect.height * 0.2 + Math.random() * rect.height * 0.6;
  return { x, y };
}

function getRandomEditorPoint() {
  const rect = editor.getBoundingClientRect();
  return {
    x: rect.left + Math.random() * rect.width,
    y: rect.top + Math.random() * rect.height,
  };
}

// =======================================
// Shake
// =======================================
function shake(level) {
  app.classList.remove('shake-mild', 'shake-medium', 'shake-heavy');
  void app.offsetWidth; // reflow

  if (level === 1) app.classList.add('shake-mild');
  else if (level === 2) app.classList.add('shake-medium');
  else app.classList.add('shake-heavy');

  // Remove after animation
  const dur = level === 3 ? 600 : level === 2 ? 400 : 300;
  setTimeout(() => {
    app.classList.remove('shake-mild', 'shake-medium', 'shake-heavy');
  }, dur);
}

// =======================================
// Flash
// =======================================
function screenFlash(color = 'white', opacity = 0.15, dur = 80) {
  flash.style.background = color;
  flash.style.opacity = opacity;
  flash.style.transition = `opacity ${dur}ms`;
  setTimeout(() => {
    flash.style.opacity = 0;
  }, dur);
}

// =======================================
// Intensity System
// =======================================
function updateIntensity(delta) {
  state.intensity = clamp(state.intensity + delta, 0, 100);

  const pct = state.intensity;
  intensityBar.style.width = pct + '%';
  intensityBarGlow.style.width = pct + '%';

  const level = Math.floor(pct / 20); // 0-4 → 5 levels
  const labelIdx = clamp(level, 0, 4);
  intensityLabel.textContent = INTENSITY_LABELS[labelIdx];
  intensityLabel.dataset.level = labelIdx + 1;

  // Reset decay timer
  if (state.intensityDecayTimer) clearTimeout(state.intensityDecayTimer);
  state.intensityDecayTimer = setTimeout(() => {
    decayIntensity();
  }, 1500);
}

function decayIntensity() {
  if (state.intensity > 0) {
    state.intensity = Math.max(0, state.intensity - 5);
    const pct = state.intensity;
    intensityBar.style.width = pct + '%';
    intensityBarGlow.style.width = pct + '%';

    const level = Math.floor(pct / 20);
    const labelIdx = clamp(level, 0, 4);
    intensityLabel.textContent = INTENSITY_LABELS[labelIdx];
    intensityLabel.dataset.level = labelIdx + 1;

    if (state.intensity > 0) {
      state.intensityDecayTimer = setTimeout(decayIntensity, 200);
    }
  }
}

// =======================================
// Combo System
// =======================================
function triggerCombo(combo) {
  comboEl.textContent = combo;
  comboEl.style.transform = 'scale(1.4)';
  setTimeout(() => { comboEl.style.transform = 'scale(1)'; }, 150);

  // Check for milestone combos
  const milestones = [5, 10, 20, 30, 50, 100];
  if (milestones.includes(combo)) {
    const texts = COMBO_TEXTS[combo] || ['AMAZING!'];
    const text = texts[Math.floor(Math.random() * texts.length)];
    showComboPopup(text, combo);
  }
}

function showComboPopup(text, combo) {
  comboPopup.textContent = text;
  comboPopup.classList.remove('burst');
  void comboPopup.offsetWidth; // reflow

  // Scale based on combo
  const scale = 1 + (combo / 100);
  comboPopup.style.fontSize = clamp(scale * 3, 2, 8) + 'rem';

  // Color based on combo
  if (combo >= 50) {
    comboPopup.style.color = '#ff00ff';
    comboPopup.style.textShadow = '0 0 30px #ff00ff, 0 0 60px #ff0080';
  } else if (combo >= 20) {
    comboPopup.style.color = '#ff2020';
    comboPopup.style.textShadow = '0 0 30px #ff2020, 0 0 60px #ff6a00';
  } else {
    comboPopup.style.color = '#ffd700';
    comboPopup.style.textShadow = '0 0 30px rgba(255, 215, 0, 1), 0 0 60px rgba(255, 106, 0, 0.8)';
  }

  comboPopup.classList.add('burst');
}

function resetCombo() {
  state.combo = 0;
  comboEl.textContent = '0';
}

// =======================================
// Achievement System
// =======================================
function checkAchievements(charCount) {
  for (const ach of ACHIEVEMENTS) {
    if (!state.unlockedAchievements.has(ach.id) && charCount >= ach.chars) {
      state.unlockedAchievements.add(ach.id);
      showAchievement(ach);
    }
  }
}

let achQueue = [];
let achShowing = false;

function showAchievement(ach) {
  achQueue.push(ach);
  if (!achShowing) processAchievementQueue();
}

function processAchievementQueue() {
  if (achQueue.length === 0) { achShowing = false; return; }
  achShowing = true;
  const ach = achQueue.shift();

  achToast.innerHTML = `
    <div class="toast-title">🏆 ACHIEVEMENT UNLOCKED</div>
    <div class="toast-message">${ach.title}</div>
    <div style="font-size:0.8rem; color: var(--text-dim); margin-top:4px;">${ach.msg}</div>
  `;
  achToast.classList.add('show');

  setTimeout(() => {
    achToast.classList.remove('show');
    setTimeout(processAchievementQueue, 500);
  }, 3000);
}

// =======================================
// Core Impact Function
// =======================================
function impact(char) {
  const now = Date.now();
  state.charCount++;
  charEl.textContent = state.charCount;

  // Track keys per second
  state.recentKeys.push(now);
  state.recentKeys = state.recentKeys.filter(t => now - t < 1000);
  state.keysPerSecond = state.recentKeys.length;

  // Calculate intensity based on typing speed
  const speedBoost = Math.min(state.keysPerSecond / 5, 2); // max 2x at 10 kps
  const intensityGain = 5 + speedBoost * 5;
  updateIntensity(intensityGain);

  const intensityNormalized = (state.intensity / 100);
  const effectLevel = 1 + intensityNormalized * 2; // 1 to 3

  // Combo
  if (state.comboTimer) clearTimeout(state.comboTimer);
  state.combo++;
  triggerCombo(state.combo);
  state.comboTimer = setTimeout(resetCombo, 1200);

  // Sound
  playModeSound(effectLevel);

  // Particles
  const pos = getRandomEditorPoint();
  const particleCount = Math.floor(10 + effectLevel * 15 + state.combo * 0.5);
  particles.burst(pos.x, pos.y, state.mode, effectLevel, Math.min(particleCount, 80));

  // Extra bursts at high intensity
  if (state.intensity > 60) {
    const pos2 = getRandomEditorPoint();
    setTimeout(() => {
      particles.burst(pos2.x, pos2.y, state.mode, effectLevel * 0.7, Math.floor(particleCount * 0.5));
    }, 50);
  }

  // Screen shake
  const shakeLevel = state.intensity < 30 ? 1 : state.intensity < 70 ? 2 : 3;
  shake(shakeLevel);

  // Flash
  const flashColors = {
    explosion: `rgba(255, 100, 0, ${0.03 + intensityNormalized * 0.1})`,
    laser:     `rgba(0, 245, 255, ${0.02 + intensityNormalized * 0.08})`,
    mechanical:`rgba(255, 255, 255, ${0.04 + intensityNormalized * 0.08})`,
    nuclear:   `rgba(57, 255, 20, ${0.04 + intensityNormalized * 0.12})`,
  };
  screenFlash(flashColors[state.mode] || 'white', 1, 60);

  // Glitch on high intensity
  if (state.intensity > 70 && Math.random() < 0.3) {
    editor.classList.add('chroma-glitch');
    setTimeout(() => editor.classList.remove('chroma-glitch'), 200);
  }

  // Nuclear body effect
  if (state.mode === 'nuclear' && state.intensity > 80) {
    document.body.classList.add('nuclear-mode');
    setTimeout(() => document.body.classList.remove('nuclear-mode'), 500);
  }

  // Editor wrapper glow
  editorWrapper.classList.add('impact');
  setTimeout(() => editorWrapper.classList.remove('impact'), 150);

  // Special: spawn random text at very high intensity
  if (state.intensity > 85 && Math.random() < 0.2) {
    const exclamations = ['BOOM!', 'POW!', 'ZAP!', 'BANG!', '爆！', 'KA-BOOM!', '💥'];
    const txt = exclamations[Math.floor(Math.random() * exclamations.length)];
    particles.spawnTextBurst(pos.x, pos.y - 50, txt);
  }

  // Check achievements
  checkAchievements(state.charCount);

  state.lastKeyTime = now;
}

function playModeSound(intensity) {
  switch (state.mode) {
    case 'explosion':
      sound.playExplosion(intensity * 0.8);
      break;
    case 'laser':
      sound.playLaser(intensity);
      break;
    case 'mechanical':
      sound.playMechanical(intensity * 0.9);
      break;
    case 'nuclear':
      sound.playNuclear(intensity * 0.7);
      break;
  }
}

// =======================================
// Event Listeners
// =======================================

// Typing
editor.addEventListener('keydown', (e) => {
  // Ignore modifier-only keys
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab',
       'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
       'Home', 'End', 'PageUp', 'PageDown', 'Insert',
       'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
       'Escape', 'ContextMenu'].includes(e.key)) return;

  impact(e.key);
});

// Paste also triggers impact
editor.addEventListener('paste', (e) => {
  setTimeout(() => {
    const text = editor.value;
    if (text.length > state.charCount) {
      const diff = text.length - state.charCount;
      for (let i = 0; i < Math.min(diff, 5); i++) {
        setTimeout(() => impact(''), i * 50);
      }
    }
  }, 10);
});

// Mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;

    // Mini visual feedback
    const pos = {
      x: btn.getBoundingClientRect().left + btn.getBoundingClientRect().width / 2,
      y: btn.getBoundingClientRect().top,
    };
    particles.burst(pos.x, pos.y, state.mode, 1.5, 20);
    playModeSound(1);
  });
});

// Clear
document.getElementById('btn-clear').addEventListener('click', () => {
  if (editor.value.length === 0) return;

  // Big BOOM on clear
  const rect = editor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const px = cx + (Math.random() - 0.5) * rect.width * 0.6;
      const py = cy + (Math.random() - 0.5) * rect.height * 0.6;
      particles.burst(px, py, state.mode, 3, 50);
    }, i * 80);
  }

  if (state.mode === 'nuclear') {
    sound.playNuclear(2);
  } else {
    sound.playExplosion(3);
  }

  shake(3);
  screenFlash('rgba(255, 60, 0, 0.9)', 1, 200);

  particles.spawnTextBurst(cx, cy - 80, '💥 OBLITERATED! 💥');

  setTimeout(() => {
    editor.value = '';
    state.charCount = 0;
    charEl.textContent = '0';
    state.combo = 0;
    comboEl.textContent = '0';
    state.intensity = 0;
    updateIntensity(0);
  }, 100);
});

// Mute
const muteBtn = document.getElementById('btn-mute');
muteBtn.addEventListener('click', () => {
  state.muted = !state.muted;
  sound.setMuted(state.muted);
  muteBtn.textContent = state.muted ? '🔇 MUTED' : '🔊 MUTE';
  muteBtn.style.color = state.muted ? 'var(--accent-red)' : '';
});

// Copy
document.getElementById('btn-copy').addEventListener('click', () => {
  if (editor.value.length === 0) return;
  navigator.clipboard.writeText(editor.value).then(() => {
    const btn = document.getElementById('btn-copy');
    const original = btn.textContent;
    btn.textContent = '✅ COPIED!';
    btn.style.color = 'var(--accent-green)';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.color = '';
    }, 1500);
  });
});

// Focus editor on click anywhere
app.addEventListener('click', () => {
  editor.focus();
});

// Auto-focus
editor.focus();

// =======================================
// Cursor glow tracker
// =======================================
const cursorGlow = document.getElementById('cursor-glow');
editor.addEventListener('mousemove', (e) => {
  const rect = editor.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  cursorGlow.style.left = x + 'px';
  cursorGlow.style.top = y + 'px';
  cursorGlow.style.opacity = '1';
});

editor.addEventListener('mouseleave', () => {
  cursorGlow.style.opacity = '0';
});

// =======================================
// Easter Egg: Konami Code
// =======================================
const konamiCode = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIdx = 0;

document.addEventListener('keydown', (e) => {
  if (e.key === konamiCode[konamiIdx]) {
    konamiIdx++;
    if (konamiIdx === konamiCode.length) {
      konamiIdx = 0;
      triggerKonami();
    }
  } else {
    konamiIdx = 0;
  }
});

function triggerKonami() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  showAchievement({
    id: 'konami',
    title: '🎮 KONAMI CODE!!',
    msg: '神の力を解放した。世界よ震えろ。',
  });
  state.unlockedAchievements.add('konami');

  // Mega explosion
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      particles.burst(x, y, 'nuclear', 4, 60);
    }, i * 100);
  }

  sound.playNuclear(3);
  shake(3);
  screenFlash('rgba(255, 215, 0, 0.6)', 1, 300);
  particles.spawnTextBurst(cx, cy, '🌟 GODMODE 🌟');
}

// =======================================
// Intro animation
// =======================================
setTimeout(() => {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  particles.burst(cx, cy, 'explosion', 2, 40);
  sound.playExplosion(1.5);
  shake(2);
  showAchievement({
    id: 'welcome',
    title: '💥 爆破エディタ起動！',
    msg: '世界を救う文書を作成しろ。1文字でも世界は揺れる。',
  });
  state.unlockedAchievements.add('welcome');
}, 800);

console.log(`
╔══════════════════════════════════╗
║   💥 IMPACT TYPER v1.0          ║
║   爆音・爆破エディタ             ║
║                                  ║
║   Konami Code: ↑↑↓↓←→←→BA      ║
╚══════════════════════════════════╝
`);
