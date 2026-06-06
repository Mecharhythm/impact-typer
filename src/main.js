/**
 * Impact Typer — Main Application (v2: Clean Editor + Hidden Impact)
 * 一見まじめなテキストエディタ、実は爆発する
 */

import './style.css';
import { SoundEngine } from './sound.js';
import { ParticleSystem } from './particles.js';

// ── DOM refs ──────────────────────────────────────────────
const appEl       = document.getElementById('app');
const editorEl    = document.getElementById('editor');
const canvas      = document.getElementById('particle-canvas');
const flashEl     = document.getElementById('flash-overlay');

const statChars   = document.getElementById('stat-chars');
const statWords   = document.getElementById('stat-words');
const statLines   = document.getElementById('stat-lines');
const docStatus   = document.getElementById('doc-status');

const effectIndicator = document.getElementById('effect-indicator');
const effectLabel     = document.getElementById('effect-label');

const settingsPanel   = document.getElementById('settings-panel');
const settingsOverlay = document.getElementById('settings-overlay');
const btnSettings     = document.getElementById('btn-settings');
const btnSettingsClose = document.getElementById('btn-settings-close');

const comboPopup      = document.getElementById('combo-popup');
const achieveToast    = document.getElementById('achievement-toast');

// ── Engines ───────────────────────────────────────────────
const sound     = new SoundEngine();
const particles = new ParticleSystem(canvas);

// ── Settings state ────────────────────────────────────────
const cfg = {
  // Editor
  font:       'inter',
  fontSize:   17,
  width:      'medium',
  theme:      'light',
  // Effects master
  effectsOn:  false,
  // Sub-effects
  sound:      true,
  particles:  true,
  shake:      true,
  flash:      true,
  combo:      true,
  mode:       'explosion',
  intensityMult: 2, // 1-3
};

const WIDTHS = { narrow: '560px', medium: '720px', wide: '960px', full: '100%' };
const INTENSITY_LABELS = ['弱', '中', '強'];

// ── Document state ────────────────────────────────────────
const doc = {
  charCount:   0,
  wordCount:   0,
  lineCount:   1,
  combo:       0,
  comboTimer:  null,
  maxCombo:    0,
  maxKps:      0,
  explosions:  0,
  intensity:   0,
  intensityDecay: null,
  recentKeys:  [],
  saved:       false,
};

let achQueue = [];
let achShowing = false;

// ── Combo milestone texts ─────────────────────────────────
const COMBOS = {
  5:   { text: 'NICE',    color: '#22c55e' },
  10:  { text: 'HOT!',    color: '#f59e0b' },
  20:  { text: 'INSANE',  color: '#f97316' },
  30:  { text: 'NUCLEAR', color: '#ef4444' },
  50:  { text: '世界崩壊', color: '#a855f7' },
  100: { text: '神',       color: '#ec4899' },
};

const ACHIEVEMENTS = [
  { id: 'first',    chars: 1,   emoji: '🎬', title: '第一打', msg: '映画が始まった。' },
  { id: 'ten',      chars: 10,  emoji: '🔥', title: '加熱中', msg: '10文字打った。体が震えてきた。' },
  { id: 'fifty',    chars: 50,  emoji: '💣', title: 'ON FIRE', msg: '50文字。もはや人間ではない。' },
  { id: 'hundred',  chars: 100, emoji: '☢️', title: 'NUCLEAR TYPIST', msg: '100文字。世界の終わりが始まる。' },
  { id: 'fivehun',  chars: 500, emoji: '🌌', title: 'GODFORM', msg: '500文字。お前はタイピングの神だ。' },
];
const unlocked = new Set();

// ─────────────────────────────────────────────────────────
// Editor functionality (always active)
// ─────────────────────────────────────────────────────────

function updateStats() {
  const val = editorEl.value;
  const chars = val.length;
  const words = val.trim() === '' ? 0 : val.trim().split(/\s+/).length;
  const lines = val === '' ? 1 : val.split('\n').length;

  doc.charCount = chars;
  doc.wordCount  = words;
  doc.lineCount  = lines;

  statChars.textContent = `${chars.toLocaleString()} 文字`;
  statWords.textContent = `${words.toLocaleString()} 単語`;
  statLines.textContent = `${lines.toLocaleString()} 行`;

  // Doc status
  if (chars === 0) {
    docStatus.textContent = '新規ドキュメント';
  } else if (chars < 50) {
    docStatus.textContent = '書き始め';
  } else if (chars < 200) {
    docStatus.textContent = '執筆中';
  } else {
    docStatus.textContent = `${chars.toLocaleString()} 文字 · ${Math.ceil(words / 200)} 分で読める`;
  }
}

// Auto-save to localStorage
function autosave() {
  try {
    localStorage.setItem('typer_content', editorEl.value);
  } catch (e) {}
}

function loadSaved() {
  try {
    const saved = localStorage.getItem('typer_content');
    if (saved) {
      editorEl.value = saved;
      updateStats();
    }
  } catch (e) {}
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(autosave, 1200);
}

// ─────────────────────────────────────────────────────────
// Impact effects
// ─────────────────────────────────────────────────────────

function getEditorPoint() {
  const r = editorEl.getBoundingClientRect();
  return {
    x: r.left + r.width  * (0.2 + Math.random() * 0.6),
    y: r.top  + r.height * (0.15 + Math.random() * 0.55),
  };
}

function shake(level) {
  if (!cfg.shake) return;
  appEl.classList.remove('shake-sm', 'shake-md', 'shake-lg');
  void appEl.offsetWidth;
  const cls = level === 1 ? 'shake-sm' : level === 2 ? 'shake-md' : 'shake-lg';
  appEl.classList.add(cls);
  const dur = level === 3 ? 560 : level === 2 ? 380 : 250;
  setTimeout(() => appEl.classList.remove(cls), dur);
}

function doFlash(color, opacity, dur) {
  if (!cfg.flash) return;
  flashEl.style.background = color;
  flashEl.style.opacity    = opacity;
  flashEl.style.transition = `opacity ${dur}ms`;
  setTimeout(() => { flashEl.style.opacity = 0; }, dur);
}

function updateIntensity(delta) {
  doc.intensity = Math.max(0, Math.min(100, doc.intensity + delta));
  if (doc.intensityDecay) clearTimeout(doc.intensityDecay);
  doc.intensityDecay = setTimeout(decayIntensity, 1400);
}

function decayIntensity() {
  if (doc.intensity > 0) {
    doc.intensity = Math.max(0, doc.intensity - 4);
    doc.intensityDecay = setTimeout(decayIntensity, 180);
  }
}

function triggerCombo() {
  if (!cfg.combo) return;
  document.getElementById('stat-combo-max').textContent = doc.maxCombo;

  const milestone = COMBOS[doc.combo];
  if (!milestone) return;

  comboPopup.textContent = milestone.text;
  comboPopup.style.color = milestone.color;
  comboPopup.style.textShadow = `0 0 24px ${milestone.color}80, 0 0 48px ${milestone.color}40`;

  comboPopup.classList.remove('pop');
  void comboPopup.offsetWidth;
  comboPopup.classList.add('pop');
}

function impact(key) {
  if (!cfg.effectsOn) return;

  const now = Date.now();
  doc.recentKeys.push(now);
  doc.recentKeys = doc.recentKeys.filter(t => now - t < 1000);
  const kps = doc.recentKeys.length;
  if (kps > doc.maxKps) {
    doc.maxKps = kps;
    document.getElementById('stat-kps-max').textContent = kps;
  }

  const speedFactor = Math.min(kps / 6, 2);
  updateIntensity(5 + speedFactor * 6);

  const intensityNorm = doc.intensity / 100;
  // Scale effectLevel by user preference (1-3)
  const effectLevel = (1 + intensityNorm * 1.5) * (cfg.intensityMult / 2);

  // Combo
  if (doc.comboTimer) clearTimeout(doc.comboTimer);
  doc.combo++;
  if (doc.combo > doc.maxCombo) doc.maxCombo = doc.combo;
  triggerCombo();
  doc.comboTimer = setTimeout(() => { doc.combo = 0; }, 1100);

  // Sound
  if (cfg.sound) {
    switch (cfg.mode) {
      case 'explosion':  sound.playExplosion(effectLevel * 0.75);  break;
      case 'laser':      sound.playLaser(effectLevel);              break;
      case 'mechanical': sound.playMechanical(effectLevel * 0.85); break;
      case 'nuclear':    sound.playNuclear(effectLevel * 0.65);    break;
    }
  }

  // Particles
  if (cfg.particles) {
    doc.explosions++;
    document.getElementById('stat-explosions').textContent = doc.explosions;

    const pos = getEditorPoint();
    const count = Math.min(Math.floor(8 + effectLevel * 12 + doc.combo * 0.3), 60);
    particles.burst(pos.x, pos.y, cfg.mode, effectLevel, count);

    if (doc.intensity > 65) {
      const pos2 = getEditorPoint();
      setTimeout(() => particles.burst(pos2.x, pos2.y, cfg.mode, effectLevel * 0.6, Math.floor(count * 0.4)), 45);
    }
  }

  // Shake
  const shakeLevel = doc.intensity < 30 ? 1 : doc.intensity < 70 ? 2 : 3;
  shake(shakeLevel);

  // Flash
  const flashMap = {
    explosion:  `rgba(249,115,22,${0.025 + intensityNorm * 0.07})`,
    laser:      `rgba(0,245,255,${0.02  + intensityNorm * 0.06})`,
    mechanical: `rgba(255,255,255,${0.03 + intensityNorm * 0.07})`,
    nuclear:    `rgba(57,255,20,${0.03  + intensityNorm * 0.08})`,
  };
  doFlash(flashMap[cfg.mode] || 'white', 1, 55);

  // Glitch at very high intensity
  if (doc.intensity > 80 && Math.random() < 0.25) {
    appEl.classList.add('glitch');
    setTimeout(() => appEl.classList.remove('glitch'), 200);
  }

  // Achievement check
  checkAchievements(doc.charCount);
}

// ─────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────

function checkAchievements(chars) {
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && chars >= a.chars) {
      unlocked.add(a.id);
      queueAchievement(a);
    }
  }
}

function queueAchievement(a) {
  achQueue.push(a);
  if (!achShowing) drainAchQueue();
}

function drainAchQueue() {
  if (!achQueue.length) { achShowing = false; return; }
  achShowing = true;
  const a = achQueue.shift();
  achieveToast.innerHTML = `
    <div class="toast-label">🏆 実績解除</div>
    <div class="toast-title">${a.emoji} ${a.title}</div>
    <div class="toast-msg">${a.msg}</div>
  `;
  achieveToast.classList.add('show');
  setTimeout(() => {
    achieveToast.classList.remove('show');
    setTimeout(drainAchQueue, 400);
  }, 3000);
}

// ─────────────────────────────────────────────────────────
// Settings panel logic
// ─────────────────────────────────────────────────────────

function openSettings() {
  settingsPanel.classList.add('open');
  settingsOverlay.classList.add('open');
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsOverlay.classList.remove('open');
}

function applyEditorFont() {
  const map = {
    jetbrains: "'JetBrains Mono', monospace",
    inter:     "'Inter', -apple-system, sans-serif",
    serif:     "Georgia, 'Times New Roman', serif",
  };
  editorEl.style.fontFamily = map[cfg.font] || map.inter;
}

function applyEditorWidth() {
  const w = WIDTHS[cfg.width] || '720px';
  editorEl.style.maxWidth = w;
}

function applyTheme() {
  document.documentElement.dataset.theme =
    cfg.theme === 'light' ? '' : cfg.theme;
  if (cfg.theme === 'light') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = cfg.theme;
}

function applyEffectsState() {
  const sub = document.getElementById('effects-sub');
  sub.classList.toggle('disabled', !cfg.effectsOn);

  document.getElementById('stats-section').style.display =
    cfg.effectsOn ? '' : 'none';

  effectIndicator.classList.toggle('active', cfg.effectsOn);
  effectLabel.textContent = cfg.effectsOn ? 'エフェクト: ON' : 'エフェクト: OFF';

  btnSettings.classList.toggle('impact-active', cfg.effectsOn);
}

function saveConfig() {
  try { localStorage.setItem('typer_cfg', JSON.stringify(cfg)); } catch (e) {}
}

function loadConfig() {
  try {
    const raw = localStorage.getItem('typer_cfg');
    if (raw) Object.assign(cfg, JSON.parse(raw));
  } catch (e) {}
}

// Bind settings controls
function bindSettings() {
  // Font
  const setFont = document.getElementById('set-font');
  setFont.value = cfg.font;
  setFont.addEventListener('change', () => {
    cfg.font = setFont.value; applyEditorFont(); saveConfig();
  });

  // Font size
  const setSize = document.getElementById('set-fontsize');
  const setSizeVal = document.getElementById('set-fontsize-val');
  setSize.value = cfg.fontSize;
  setSizeVal.textContent = cfg.fontSize + 'px';
  setSize.addEventListener('input', () => {
    cfg.fontSize = +setSize.value;
    setSizeVal.textContent = cfg.fontSize + 'px';
    editorEl.style.fontSize = cfg.fontSize + 'px';
    saveConfig();
  });

  // Width
  const setWidth = document.getElementById('set-width');
  setWidth.value = cfg.width;
  setWidth.addEventListener('change', () => {
    cfg.width = setWidth.value; applyEditorWidth(); saveConfig();
  });

  // Theme
  const setTheme = document.getElementById('set-theme');
  setTheme.value = cfg.theme;
  setTheme.addEventListener('change', () => {
    cfg.theme = setTheme.value; applyTheme(); saveConfig();
  });

  // Effects master
  const masterToggle = document.getElementById('set-effects-master');
  masterToggle.checked = cfg.effectsOn;
  masterToggle.addEventListener('change', () => {
    cfg.effectsOn = masterToggle.checked;
    applyEffectsState();
    saveConfig();
    // Tiny welcome boom when turned on
    if (cfg.effectsOn) {
      setTimeout(() => {
        const pos = getEditorPoint();
        particles.burst(pos.x, pos.y, cfg.mode, 1.5, 20);
        if (cfg.sound) sound.playExplosion(1.2);
        shake(1);
      }, 200);
    }
  });

  // Sub-effects
  function bindToggle(id, key) {
    const el = document.getElementById(id);
    el.checked = cfg[key];
    el.addEventListener('change', () => { cfg[key] = el.checked; saveConfig(); });
  }
  bindToggle('set-sound',     'sound');
  bindToggle('set-particles', 'particles');
  bindToggle('set-shake',     'shake');
  bindToggle('set-flash',     'flash');
  bindToggle('set-combo',     'combo');

  // Mode
  const setMode = document.getElementById('set-mode');
  setMode.value = cfg.mode;
  setMode.addEventListener('change', () => { cfg.mode = setMode.value; saveConfig(); });

  // Intensity multiplier
  const setInt    = document.getElementById('set-intensity');
  const setIntVal = document.getElementById('set-intensity-val');
  setInt.value = cfg.intensityMult;
  setIntVal.textContent = INTENSITY_LABELS[cfg.intensityMult - 1];
  setInt.addEventListener('input', () => {
    cfg.intensityMult = +setInt.value;
    setIntVal.textContent = INTENSITY_LABELS[cfg.intensityMult - 1];
    saveConfig();
  });
}

// ─────────────────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────────────────

// Typing
const IGNORED_KEYS = new Set([
  'Shift','Control','Alt','Meta','CapsLock','Tab',
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  'Home','End','PageUp','PageDown','Insert',
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  'Escape','ContextMenu',
]);

editorEl.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (IGNORED_KEYS.has(e.key)) return;
  updateStats();
  scheduleSave();
  impact(e.key);
});

editorEl.addEventListener('input', () => {
  updateStats();
  scheduleSave();
});

// Settings
btnSettings.addEventListener('click', openSettings);
btnSettingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

// Effect indicator in status bar → open settings
effectIndicator.addEventListener('click', openSettings);

// Copy
document.getElementById('btn-copy').addEventListener('click', () => {
  if (!editorEl.value) return;
  navigator.clipboard.writeText(editorEl.value).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.title = 'コピー済み！';
    btn.style.color = 'var(--accent)';
    setTimeout(() => { btn.title = 'コピー'; btn.style.color = ''; }, 1500);
  });
});

// Clear
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!editorEl.value) return;
  if (!confirm('テキストをクリアしますか？')) return;

  if (cfg.effectsOn) {
    // Big boom on clear
    const r = editorEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const x = cx + (Math.random() - 0.5) * r.width * 0.5;
        const y = cy + (Math.random() - 0.5) * r.height * 0.5;
        particles.burst(x, y, cfg.mode, 3, 40);
      }, i * 70);
    }
    if (cfg.sound) sound.playExplosion(2.5);
    shake(3);
    doFlash('rgba(249,115,22,0.7)', 1, 180);
    particles.spawnTextBurst(cx, cy - 60, '💥 CLEARED');
  }

  setTimeout(() => {
    editorEl.value = '';
    updateStats();
    try { localStorage.removeItem('typer_content'); } catch (e) {}
    doc.combo = 0;
    doc.intensity = 0;
  }, cfg.effectsOn ? 90 : 0);
});

// Focus mode
const btnFocus = document.getElementById('btn-focus');
btnFocus.addEventListener('click', () => {
  document.body.classList.toggle('focus-mode');
  btnFocus.classList.toggle('active', document.body.classList.contains('focus-mode'));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    document.body.classList.toggle('focus-mode');
    btnFocus.classList.toggle('active', document.body.classList.contains('focus-mode'));
  }
  // Escape to exit focus mode
  if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) {
    document.body.classList.remove('focus-mode');
    btnFocus.classList.remove('active');
  }
});

// ─────────────────────────────────────────────────────────
// Konami Code Easter Egg
// ─────────────────────────────────────────────────────────
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown',
                'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIdx = 0;

document.addEventListener('keydown', (e) => {
  if (e.key === KONAMI[konamiIdx]) {
    konamiIdx++;
    if (konamiIdx === KONAMI.length) {
      konamiIdx = 0;
      activateKonami();
    }
  } else {
    konamiIdx = 0;
  }
});

function activateKonami() {
  // Auto-enable effects if not already on
  if (!cfg.effectsOn) {
    cfg.effectsOn = true;
    document.getElementById('set-effects-master').checked = true;
    applyEffectsState();
    saveConfig();
  }

  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      particles.burst(x, y, 'nuclear', 4, 50);
    }, i * 120);
  }

  sound.playNuclear(3);
  shake(3);
  doFlash('rgba(255,215,0,0.5)', 1, 300);
  particles.spawnTextBurst(window.innerWidth/2, window.innerHeight/2, '🌟 KONAMI!');

  queueAchievement({ id: 'konami', emoji: '🎮', title: 'KONAMI CODE', msg: '神の力を解放した。世界よ震えろ。' });
  unlocked.add('konami');
}

// ─────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────
loadConfig();
loadSaved();
bindSettings();
applyEditorFont();
applyEditorWidth();
applyTheme();
applyEffectsState();

editorEl.style.fontSize = cfg.fontSize + 'px';

// Autofocus
editorEl.focus();

// Move caret to end if restored content
if (editorEl.value) {
  editorEl.setSelectionRange(editorEl.value.length, editorEl.value.length);
  updateStats();
}

console.log(
  '%c Typer · Impact Edition ',
  'background:#f97316;color:white;font-weight:bold;border-radius:4px;padding:2px 8px',
  '\n設定パネル → 「💥 Impactエフェクト」でカオスを解放\nKonami: ↑↑↓↓←→←→BA'
);
