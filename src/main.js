/**
 * Typer v2 — Main Application
 * Clean editor + hidden (but now visible) Impact effects
 */

import './style.css';
import { SoundEngine } from './sound.js';
import { ParticleSystem } from './particles.js';

// ─── DOM ──────────────────────────────────────────────────
const appEl       = document.getElementById('app');
const editorEl    = document.getElementById('editor');
const canvas      = document.getElementById('particle-canvas');
const flashEl     = document.getElementById('flash-overlay');

// Toolbar
const btnImpact   = document.getElementById('btn-impact-toggle');
const impactState = btnImpact.querySelector('.impact-state');
const btnTheme    = document.getElementById('btn-theme');
const btnFind     = document.getElementById('btn-find');
const btnStats    = document.getElementById('btn-stats');
const btnDownload = document.getElementById('btn-download');
const btnFocus    = document.getElementById('btn-focus');
const btnCopy     = document.getElementById('btn-copy');
const btnClear    = document.getElementById('btn-clear');
const btnSettings = document.getElementById('btn-settings');
const docTitleEl  = document.getElementById('doc-title');

// Find bar
const findBar     = document.getElementById('find-bar');
const findInput   = document.getElementById('find-input');
const findCount   = document.getElementById('find-count');
const findPrev    = document.getElementById('find-prev');
const findNext    = document.getElementById('find-next');
const findClose   = document.getElementById('find-close');

// Goal bar
const goalBarWrap  = document.getElementById('goal-bar-wrap');
const goalBarFill  = document.getElementById('goal-bar-fill');
const goalBarLabel = document.getElementById('goal-bar-label');

// Status bar
const statChars   = document.getElementById('stat-chars');
const statWords   = document.getElementById('stat-words');
const statLines   = document.getElementById('stat-lines');
const statRead    = document.getElementById('stat-read');
const autosaveLbl = document.getElementById('autosave-label');
const cursorPos   = document.getElementById('cursor-pos');

// Settings
const settingsPanel   = document.getElementById('settings-panel');
const settingsOverlay = document.getElementById('settings-overlay');
const btnSettingsClose = document.getElementById('btn-settings-close');

// Modals
const statsModalOverlay = document.getElementById('stats-modal-overlay');
const statsModal        = document.getElementById('stats-modal');
const statsModalBody    = document.getElementById('stats-modal-body');
const btnStatsClose     = document.getElementById('btn-stats-close');
const dlModalOverlay    = document.getElementById('dl-modal-overlay');
const dlModal           = document.getElementById('dl-modal');
const btnDlClose        = document.getElementById('btn-dl-close');

// Impact
const comboPopup    = document.getElementById('combo-popup');
const achieveToast  = document.getElementById('achievement-toast');

// ─── Engines ──────────────────────────────────────────────
const sound     = new SoundEngine();
const particles = new ParticleSystem(canvas);

// ─── Config ───────────────────────────────────────────────
const cfg = {
  font: 'inter', fontSize: 17, lineHeight: 185,
  width: 'medium', theme: 'light',
  mdToolbar: true, typewriter: false, tabSpaces: true,
  wordGoal: 0,
  effectsOn: false,
  sound: true, particles: true, shake: true, flash: true, combo: true,
  mode: 'explosion', intensityMult: 2,
};

const WIDTHS = { narrow:'560px', medium:'720px', wide:'960px', full:'100%' };
const INTENSITY_LABELS = ['弱','中','強'];
const THEMES = ['light','dark','sepia'];

// ─── Doc state ────────────────────────────────────────────
const doc = {
  combo:0, comboTimer:null, maxCombo:0,
  maxKps:0, explosions:0,
  intensity:0, intensityDecay:null,
  recentKeys:[],
};

// ─── Achievement / Combo ──────────────────────────────────
const COMBOS = {
  5:  {text:'NICE!',   color:'#22c55e'},
  10: {text:'HOT!',    color:'#f59e0b'},
  20: {text:'INSANE',  color:'#f97316'},
  30: {text:'NUCLEAR', color:'#ef4444'},
  50: {text:'世界崩壊', color:'#a855f7'},
  100:{text:'神',       color:'#ec4899'},
};

const ACHIEVEMENTS = [
  {id:'first',   chars:1,   emoji:'🎬', title:'第一打',           msg:'映画が始まった。'},
  {id:'ten',     chars:10,  emoji:'🔥', title:'加熱中',           msg:'10文字打った。'},
  {id:'fifty',   chars:50,  emoji:'💣', title:'ON FIRE',         msg:'50文字。もはや人間ではない。'},
  {id:'hundred', chars:100, emoji:'☢️', title:'NUCLEAR TYPIST',  msg:'100文字。世界の終わりが始まる。'},
  {id:'fivehun', chars:500, emoji:'🌌', title:'GODFORM',         msg:'500文字。タイピングの神だ。'},
];
const unlocked = new Set();
let achQueue = [], achShowing = false;

// ═══════════════════════════════════════════════════════════
// EDITOR FEATURES
// ═══════════════════════════════════════════════════════════

// ── Stats update ──
function updateStats() {
  const val = editorEl.value;
  const chars = val.length;
  const words = val.trim() === '' ? 0 : val.trim().split(/\s+/).length;
  const lines = val === '' ? 1 : val.split('\n').length;
  const readMin = Math.max(1, Math.round(words / 200));

  statChars.textContent = `${chars.toLocaleString()} 文字`;
  statWords.textContent = `${words.toLocaleString()} 単語`;
  statLines.textContent = `${lines} 行`;
  statRead.textContent  = `読了 ${words < 50 ? '1分未満' : readMin+'分'}`;

  // Update goal bar
  if (cfg.wordGoal > 0) {
    goalBarWrap.style.display = 'flex';
    const pct = Math.min((words / cfg.wordGoal) * 100, 100);
    goalBarFill.style.width = pct + '%';
    goalBarFill.style.background = pct >= 100 ? '#22c55e' : pct > 60 ? '#f59e0b' : 'var(--accent)';
    goalBarLabel.textContent = `${words.toLocaleString()} / ${cfg.wordGoal.toLocaleString()} 単語${pct >= 100 ? ' ✓' : ''}`;
  } else {
    goalBarWrap.style.display = 'none';
  }
}

// ── Cursor position ──
function updateCursor() {
  const s = editorEl.selectionStart;
  const text = editorEl.value.substring(0, s);
  const lines = text.split('\n');
  const line = lines.length;
  const col  = lines[lines.length - 1].length + 1;
  cursorPos.textContent = `${line}:${col}`;
}

// ── Autosave ──
let saveTimer = null;
function scheduleSave() {
  autosaveLbl.textContent = '保存中...';
  autosaveLbl.classList.remove('saved');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem('typer_content', editorEl.value);
      localStorage.setItem('typer_title', docTitleEl.value);
      autosaveLbl.textContent = '保存済み';
      autosaveLbl.classList.add('saved');
      setTimeout(() => { autosaveLbl.textContent = ''; autosaveLbl.classList.remove('saved'); }, 2000);
    } catch (e) {}
  }, 1200);
}

function loadSaved() {
  try {
    const c = localStorage.getItem('typer_content');
    const t = localStorage.getItem('typer_title');
    if (c) { editorEl.value = c; updateStats(); }
    if (t) docTitleEl.value = t;
  } catch (e) {}
}

// ── Markdown shortcuts ──
const MD_WRAP = { bold:'**', italic:'_', strike:'~~', code:'`' };
const MD_LINE = { h1:'# ', h2:'## ', h3:'### ', ul:'- ', ol:'1. ', quote:'> ', hr:'\n---\n' };

function insertWrap(marker) {
  const start = editorEl.selectionStart;
  const end   = editorEl.selectionEnd;
  const sel   = editorEl.value.substring(start, end);
  const before = editorEl.value.substring(0, start);
  const after  = editorEl.value.substring(end);
  const replacement = `${marker}${sel || 'テキスト'}${marker}`;
  editorEl.value = before + replacement + after;
  const newPos = sel ? start + replacement.length : start + marker.length;
  editorEl.setSelectionRange(
    sel ? start + marker.length : start + marker.length,
    sel ? start + marker.length + sel.length : start + marker.length + 5
  );
  updateStats(); scheduleSave();
}

function insertLinePrefix(prefix) {
  const start = editorEl.selectionStart;
  const before = editorEl.value.substring(0, start);
  const after  = editorEl.value.substring(start);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineContent = before.substring(lineStart);
  const newBefore = before.substring(0, lineStart) + prefix + lineContent;
  editorEl.value = newBefore + after;
  const newPos = start + prefix.length;
  editorEl.setSelectionRange(newPos, newPos);
  updateStats(); scheduleSave();
}

function insertLink() {
  const start = editorEl.selectionStart;
  const end   = editorEl.selectionEnd;
  const sel   = editorEl.value.substring(start, end) || 'リンクテキスト';
  const replacement = `[${sel}](https://)`;
  editorEl.value = editorEl.value.substring(0, start) + replacement + editorEl.value.substring(end);
  // Select the URL part
  const urlStart = start + sel.length + 3;
  editorEl.setSelectionRange(urlStart, urlStart + 8);
  updateStats(); scheduleSave();
}

document.querySelectorAll('.md-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    editorEl.focus();
    if (MD_WRAP[cmd]) insertWrap(MD_WRAP[cmd]);
    else if (cmd === 'link') insertLink();
    else if (cmd === 'hr') {
      const s = editorEl.selectionStart;
      const before = editorEl.value.substring(0, s);
      const after  = editorEl.value.substring(s);
      editorEl.value = before + '\n\n---\n\n' + after;
      editorEl.setSelectionRange(s + 7, s + 7);
      updateStats(); scheduleSave();
    }
    else if (MD_LINE[cmd]) insertLinePrefix(MD_LINE[cmd]);
    if (cfg.effectsOn) impact();
  });
});

// ── Find bar ──
let findMatches = [], findIdx = 0;

function openFind() {
  findBar.style.display = 'flex';
  findInput.focus();
  findInput.select();
  btnFind.classList.add('active');
}
function closeFind() {
  findBar.style.display = 'none';
  findInput.value = '';
  findCount.textContent = '';
  findMatches = [];
  btnFind.classList.remove('active');
  editorEl.focus();
}

function doFind() {
  const query = findInput.value;
  findMatches = [];
  if (!query) { findCount.textContent = ''; return; }
  const text = editorEl.value;
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
  let m;
  while ((m = re.exec(text)) !== null) findMatches.push(m.index);
  findCount.textContent = findMatches.length ? `${findIdx+1}/${findMatches.length}` : '見つかりません';
  if (findMatches.length) selectMatch(0);
}

function selectMatch(idx) {
  findIdx = ((idx % findMatches.length) + findMatches.length) % findMatches.length;
  const pos = findMatches[findIdx];
  editorEl.setSelectionRange(pos, pos + findInput.value.length);
  editorEl.focus();
  findCount.textContent = `${findIdx+1}/${findMatches.length}`;
}

findInput.addEventListener('input', doFind);
findPrev.addEventListener('click', () => findMatches.length && selectMatch(findIdx - 1));
findNext.addEventListener('click', () => findMatches.length && selectMatch(findIdx + 1));
findClose.addEventListener('click', closeFind);
btnFind.addEventListener('click', () => findBar.style.display === 'none' ? openFind() : closeFind());

// ── Stats modal ──
function openStatsModal() {
  const val = editorEl.value;
  const chars   = val.length;
  const words   = val.trim() ? val.trim().split(/\s+/).length : 0;
  const lines   = val ? val.split('\n').length : 1;
  const paras   = val.trim() ? val.trim().split(/\n\n+/).length : 0;
  const sents   = val.trim() ? (val.match(/[。！？!?.]+/g)||[]).length : 0;
  const avgWord = words ? (val.replace(/\s+/g,'').length / words).toFixed(1) : 0;
  const readMin = Math.max(1, Math.round(words / 200));
  const longestWord = words ? val.trim().split(/\s+/).reduce((a,b) => b.length > a.length ? b : a, '') : '—';
  const uniqueWords = words ? new Set(val.toLowerCase().match(/\b\w+\b/g)||[]).size : 0;
  const spaces  = (val.match(/ /g)||[]).length;
  const kanaCount = (val.match(/[\u3040-\u30ff]/g)||[]).length;
  const kanjiCount = (val.match(/[\u4e00-\u9faf]/g)||[]).length;

  statsModalBody.innerHTML = `
    <div class="stats-grid-big">
      <div class="stat-item"><div class="stat-val">${chars.toLocaleString()}</div><div class="stat-name">文字数</div></div>
      <div class="stat-item"><div class="stat-val">${words.toLocaleString()}</div><div class="stat-name">単語数</div></div>
      <div class="stat-item"><div class="stat-val">${lines}</div><div class="stat-name">行数</div></div>
    </div>
    <div class="stats-list">
      <div class="stats-list-row"><span class="key">段落数</span><span class="val">${paras}</span></div>
      <div class="stats-list-row"><span class="key">文数（句点等）</span><span class="val">${sents}</span></div>
      <div class="stats-list-row"><span class="key">平均語長</span><span class="val">${avgWord} 文字</span></div>
      <div class="stats-list-row"><span class="key">ユニーク語数</span><span class="val">${uniqueWords.toLocaleString()}</span></div>
      <div class="stats-list-row"><span class="key">最長の単語</span><span class="val">${longestWord.length > 20 ? longestWord.slice(0,20)+'…' : longestWord || '—'}</span></div>
      <div class="stats-list-row"><span class="key">スペース数</span><span class="val">${spaces.toLocaleString()}</span></div>
      <div class="stats-list-row"><span class="key">かな・カナ文字</span><span class="val">${kanaCount.toLocaleString()}</span></div>
      <div class="stats-list-row"><span class="key">漢字</span><span class="val">${kanjiCount.toLocaleString()}</span></div>
      <div class="stats-list-row"><span class="key">推定読了時間</span><span class="val">約 ${readMin} 分</span></div>
    </div>
  `;
  statsModalOverlay.classList.add('open');
  statsModal.classList.add('open');
}
function closeStatsModal() {
  statsModalOverlay.classList.remove('open');
  statsModal.classList.remove('open');
}

btnStats.addEventListener('click', openStatsModal);
btnStatsClose.addEventListener('click', closeStatsModal);
statsModalOverlay.addEventListener('click', closeStatsModal);

// ── Download modal ──
function openDlModal() {
  dlModalOverlay.classList.add('open');
  dlModal.classList.add('open');
}
function closeDlModal() {
  dlModalOverlay.classList.remove('open');
  dlModal.classList.remove('open');
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  closeDlModal();
}

btnDownload.addEventListener('click', openDlModal);
btnDlClose.addEventListener('click', closeDlModal);
dlModalOverlay.addEventListener('click', closeDlModal);

document.getElementById('dl-txt').addEventListener('click', () => {
  const name = (docTitleEl.value || 'document').replace(/[^\w\-]/g,'_');
  downloadFile(editorEl.value, `${name}.txt`, 'text/plain');
});
document.getElementById('dl-md').addEventListener('click', () => {
  const name = (docTitleEl.value || 'document').replace(/[^\w\-]/g,'_');
  downloadFile(editorEl.value, `${name}.md`, 'text/markdown');
});
document.getElementById('dl-html').addEventListener('click', () => {
  const name = (docTitleEl.value || 'document').replace(/[^\w\-]/g,'_');
  // Simple markdown→html conversion
  let html = editorEl.value
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/_(.+?)_/g,'<em>$1</em>')
    .replace(/~~(.+?)~~/g,'<s>$1</s>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^---$/gm,'<hr/>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br>');
  const doc = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${docTitleEl.value}</title><style>body{font-family:system-ui,sans-serif;max-width:680px;margin:60px auto;line-height:1.8;color:#111;padding:0 20px}h1,h2,h3{margin-top:1.5em}code{background:#f0f0f0;padding:2px 6px;border-radius:3px}blockquote{border-left:3px solid #ccc;margin:0;padding-left:16px;color:#555}hr{border:none;border-top:1px solid #ddd;margin:2em 0}</style></head><body><p>${html}</p></body></html>`;
  downloadFile(doc, `${name}.html`, 'text/html');
});

// ── Theme ──
function applyTheme(theme) {
  cfg.theme = theme;
  if (theme === 'light') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  // Update icon
  document.getElementById('icon-theme-light').style.display = theme !== 'dark' ? '' : 'none';
  document.getElementById('icon-theme-dark').style.display  = theme === 'dark'  ? '' : 'none';
  document.getElementById('set-theme').value = theme;
  saveConfig();
}

btnTheme.addEventListener('click', () => {
  const idx = (THEMES.indexOf(cfg.theme) + 1) % THEMES.length;
  applyTheme(THEMES[idx]);
});

// ── Focus mode ──
btnFocus.addEventListener('click', () => {
  document.body.classList.toggle('focus-mode');
  btnFocus.classList.toggle('active', document.body.classList.contains('focus-mode'));
});

// ── Copy ──
btnCopy.addEventListener('click', () => {
  if (!editorEl.value) return;
  navigator.clipboard.writeText(editorEl.value).then(() => {
    btnCopy.style.color = 'var(--accent)';
    setTimeout(() => { btnCopy.style.color = ''; }, 1500);
  });
});

// ── Clear ──
btnClear.addEventListener('click', () => {
  if (!editorEl.value || !confirm('テキストをクリアしますか？')) return;
  if (cfg.effectsOn) {
    const r = editorEl.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    for (let i = 0; i < 5; i++) setTimeout(() => {
      particles.burst(cx+(Math.random()-.5)*r.width*.5, cy+(Math.random()-.5)*r.height*.5, cfg.mode, 3, 40);
    }, i*70);
    if (cfg.sound) sound.playExplosion(2.5);
    shake(3);
    doFlash('rgba(249,115,22,.7)', 1, 180);
    particles.spawnTextBurst(cx, cy-60, '💥 CLEARED');
  }
  setTimeout(() => {
    editorEl.value = '';
    updateStats();
    try { localStorage.removeItem('typer_content'); } catch(e){}
    doc.combo = 0; doc.intensity = 0;
  }, cfg.effectsOn ? 90 : 0);
});

// ─── Settings panel ───────────────────────────────────────
btnSettings.addEventListener('click', () => {
  settingsPanel.classList.add('open');
  settingsOverlay.classList.add('open');
});
btnSettingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsOverlay.classList.remove('open');
}

// ─── Impact toggle (toolbar button) ──────────────────────
btnImpact.addEventListener('click', () => {
  cfg.effectsOn = !cfg.effectsOn;
  applyEffectsState();
  saveConfig();
  if (cfg.effectsOn) {
    // Little welcome boom
    setTimeout(() => {
      const r = editorEl.getBoundingClientRect();
      const x = r.left + r.width/2, y = r.top + r.height/2;
      particles.burst(x, y, cfg.mode, 1.5, 20);
      if (cfg.sound) sound.playExplosion(1);
      shake(1);
    }, 100);
  }
});

function applyEffectsState() {
  const on = cfg.effectsOn;
  btnImpact.classList.toggle('on', on);
  impactState.textContent = on ? 'ON' : 'OFF';
  document.getElementById('set-effects-master').checked = on;
  document.getElementById('effects-sub').classList.toggle('disabled', !on);
  saveConfig();
}

// ─── Settings controls ────────────────────────────────────
function bindSettings() {
  // Font
  const setFont = document.getElementById('set-font');
  setFont.value = cfg.font;
  setFont.addEventListener('change', () => { cfg.font = setFont.value; applyFont(); saveConfig(); });

  // Font size
  const setSize = document.getElementById('set-fontsize');
  const setSizeVal = document.getElementById('set-fontsize-val');
  setSize.value = cfg.fontSize; setSizeVal.textContent = cfg.fontSize+'px';
  setSize.addEventListener('input', () => {
    cfg.fontSize = +setSize.value;
    setSizeVal.textContent = cfg.fontSize+'px';
    editorEl.style.fontSize = cfg.fontSize+'px';
    saveConfig();
  });

  // Line height
  const setLh = document.getElementById('set-lineheight');
  const setLhVal = document.getElementById('set-lineheight-val');
  setLh.value = cfg.lineHeight; setLhVal.textContent = (cfg.lineHeight/100).toFixed(2);
  setLh.addEventListener('input', () => {
    cfg.lineHeight = +setLh.value;
    setLhVal.textContent = (cfg.lineHeight/100).toFixed(2);
    editorEl.style.lineHeight = (cfg.lineHeight/100).toFixed(2);
    saveConfig();
  });

  // Width
  const setWidth = document.getElementById('set-width');
  setWidth.value = cfg.width;
  setWidth.addEventListener('change', () => { cfg.width = setWidth.value; applyWidth(); saveConfig(); });

  // Theme
  const setTheme = document.getElementById('set-theme');
  setTheme.value = cfg.theme;
  setTheme.addEventListener('change', () => { applyTheme(setTheme.value); });

  // Markdown toolbar
  const setMd = document.getElementById('set-mdtoolbar');
  setMd.checked = cfg.mdToolbar;
  setMd.addEventListener('change', () => {
    cfg.mdToolbar = setMd.checked;
    document.getElementById('md-toolbar').style.display = cfg.mdToolbar ? '' : 'none';
    saveConfig();
  });

  // Typewriter
  const setTw = document.getElementById('set-typewriter');
  setTw.checked = cfg.typewriter;
  setTw.addEventListener('change', () => {
    cfg.typewriter = setTw.checked;
    document.body.classList.toggle('typewriter-mode', cfg.typewriter);
    saveConfig();
  });

  // Tab spaces
  const setTab = document.getElementById('set-tabspaces');
  setTab.checked = cfg.tabSpaces;
  setTab.addEventListener('change', () => { cfg.tabSpaces = setTab.checked; saveConfig(); });

  // Word goal
  const setGoal = document.getElementById('set-goal');
  setGoal.value = cfg.wordGoal;
  setGoal.addEventListener('change', () => {
    cfg.wordGoal = Math.max(0, +setGoal.value || 0);
    updateStats(); saveConfig();
  });

  // Effects master
  const masterChk = document.getElementById('set-effects-master');
  masterChk.checked = cfg.effectsOn;
  masterChk.addEventListener('change', () => {
    cfg.effectsOn = masterChk.checked;
    applyEffectsState();
  });

  // Sub-effects
  function bindToggle(id, key) {
    const el = document.getElementById(id);
    el.checked = cfg[key];
    el.addEventListener('change', () => { cfg[key] = el.checked; saveConfig(); });
  }
  bindToggle('set-sound','sound'); bindToggle('set-particles','particles');
  bindToggle('set-shake','shake'); bindToggle('set-flash','flash');
  bindToggle('set-combo','combo');

  // Mode
  const setMode = document.getElementById('set-mode');
  setMode.value = cfg.mode;
  setMode.addEventListener('change', () => { cfg.mode = setMode.value; saveConfig(); });

  // Intensity
  const setInt = document.getElementById('set-intensity');
  const setIntVal = document.getElementById('set-intensity-val');
  setInt.value = cfg.intensityMult; setIntVal.textContent = INTENSITY_LABELS[cfg.intensityMult-1];
  setInt.addEventListener('input', () => {
    cfg.intensityMult = +setInt.value;
    setIntVal.textContent = INTENSITY_LABELS[cfg.intensityMult-1];
    saveConfig();
  });
}

function applyFont() {
  const map = { inter:"'Inter',-apple-system,sans-serif", jetbrains:"'JetBrains Mono',monospace", serif:"Georgia,serif" };
  editorEl.style.fontFamily = map[cfg.font] || map.inter;
}
function applyWidth() {
  document.getElementById('editor-wrap').style.maxWidth = WIDTHS[cfg.width] || '720px';
}

// ─── Config persistence ───────────────────────────────────
function saveConfig() {
  try { localStorage.setItem('typer_cfg', JSON.stringify(cfg)); } catch(e){}
}
function loadConfig() {
  try {
    const raw = localStorage.getItem('typer_cfg');
    if (raw) Object.assign(cfg, JSON.parse(raw));
  } catch(e){}
}

// ═══════════════════════════════════════════════════════════
// IMPACT EFFECTS
// ═══════════════════════════════════════════════════════════

function getEditorPoint() {
  const r = editorEl.getBoundingClientRect();
  return {
    x: r.left + r.width  * (.2 + Math.random()*.6),
    y: r.top  + r.height * (.15 + Math.random()*.55),
  };
}

function shake(level) {
  if (!cfg.shake) return;
  appEl.classList.remove('shake-sm','shake-md','shake-lg');
  void appEl.offsetWidth;
  const cls = level === 1 ? 'shake-sm' : level === 2 ? 'shake-md' : 'shake-lg';
  appEl.classList.add(cls);
  setTimeout(() => appEl.classList.remove(cls), level===3?560:level===2?380:250);
}

function doFlash(color, opacity, dur) {
  if (!cfg.flash) return;
  flashEl.style.background = color;
  flashEl.style.opacity = opacity;
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
  const m = COMBOS[doc.combo];
  if (!m) return;
  comboPopup.textContent = m.text;
  comboPopup.style.color = m.color;
  comboPopup.style.textShadow = `0 0 24px ${m.color}80, 0 0 48px ${m.color}40`;
  comboPopup.classList.remove('pop');
  void comboPopup.offsetWidth;
  comboPopup.classList.add('pop');
}

function impact() {
  if (!cfg.effectsOn) return;

  const now = Date.now();
  doc.recentKeys.push(now);
  doc.recentKeys = doc.recentKeys.filter(t => now-t < 1000);
  const kps = doc.recentKeys.length;
  if (kps > doc.maxKps) { doc.maxKps = kps; document.getElementById('stat-kps-max').textContent = kps; }

  updateIntensity(5 + Math.min(kps/6,2)*6);
  const iNorm = doc.intensity/100;
  const eLevel = (1 + iNorm*1.5) * (cfg.intensityMult/2);

  // Combo
  if (doc.comboTimer) clearTimeout(doc.comboTimer);
  doc.combo++;
  if (doc.combo > doc.maxCombo) doc.maxCombo = doc.combo;
  triggerCombo();
  doc.comboTimer = setTimeout(() => { doc.combo = 0; }, 1100);

  // Sound
  if (cfg.sound) {
    switch(cfg.mode) {
      case 'explosion':  sound.playExplosion(eLevel*.75);  break;
      case 'laser':      sound.playLaser(eLevel);           break;
      case 'mechanical': sound.playMechanical(eLevel*.85); break;
      case 'nuclear':    sound.playNuclear(eLevel*.65);    break;
    }
  }

  // Particles
  if (cfg.particles) {
    doc.explosions++;
    document.getElementById('stat-explosions').textContent = doc.explosions;
    const p = getEditorPoint();
    const cnt = Math.min(Math.floor(8 + eLevel*12 + doc.combo*.3), 60);
    particles.burst(p.x, p.y, cfg.mode, eLevel, cnt);
    if (doc.intensity > 65) {
      const p2 = getEditorPoint();
      setTimeout(() => particles.burst(p2.x, p2.y, cfg.mode, eLevel*.6, Math.floor(cnt*.4)), 45);
    }
  }

  // Shake
  shake(doc.intensity < 30 ? 1 : doc.intensity < 70 ? 2 : 3);

  // Flash
  const fc = { explosion:`rgba(249,115,22,${.025+iNorm*.07})`, laser:`rgba(0,245,255,${.02+iNorm*.06})`, mechanical:`rgba(255,255,255,${.03+iNorm*.07})`, nuclear:`rgba(57,255,20,${.03+iNorm*.08})` };
  doFlash(fc[cfg.mode]||'white', 1, 55);

  // Glitch
  if (doc.intensity > 80 && Math.random() < .25) {
    appEl.classList.add('glitch');
    setTimeout(() => appEl.classList.remove('glitch'), 200);
  }

  checkAchievements(editorEl.value.length);
}

// ─── Achievements ─────────────────────────────────────────
function checkAchievements(chars) {
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && chars >= a.chars) {
      unlocked.add(a.id); queueAchievement(a);
    }
  }
}
function queueAchievement(a) {
  achQueue.push(a);
  if (!achShowing) drainAch();
}
function drainAch() {
  if (!achQueue.length) { achShowing = false; return; }
  achShowing = true;
  const a = achQueue.shift();
  achieveToast.innerHTML = `<div class="toast-label">🏆 実績解除</div><div class="toast-title">${a.emoji} ${a.title}</div><div class="toast-msg">${a.msg}</div>`;
  achieveToast.classList.add('show');
  setTimeout(() => { achieveToast.classList.remove('show'); setTimeout(drainAch, 400); }, 3000);
}

// ─── Keyboard shortcuts ───────────────────────────────────
const IGNORED = new Set(['Shift','Control','Alt','Meta','CapsLock','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Insert','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','Escape','ContextMenu']);

editorEl.addEventListener('keydown', (e) => {
  // Ctrl shortcuts
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'f') { e.preventDefault(); openFind(); return; }
    if (e.key === 'b') { e.preventDefault(); insertWrap('**'); impact(); return; }
    if (e.key === 'i') { e.preventDefault(); insertWrap('_'); impact(); return; }
    if (e.key === 'k') { e.preventDefault(); insertLink(); impact(); return; }
    return;
  }

  // Tab → spaces
  if (e.key === 'Tab' && cfg.tabSpaces) {
    e.preventDefault();
    const s = editorEl.selectionStart;
    const before = editorEl.value.substring(0, s);
    const after  = editorEl.value.substring(editorEl.selectionEnd);
    editorEl.value = before + '    ' + after;
    editorEl.setSelectionRange(s+4, s+4);
    updateStats(); scheduleSave();
    impact();
    return;
  }

  // Escape: exit focus mode / close find
  if (e.key === 'Escape') {
    if (findBar.style.display !== 'none') { closeFind(); return; }
    if (document.body.classList.contains('focus-mode')) {
      document.body.classList.remove('focus-mode');
      btnFocus.classList.remove('active');
    }
    return;
  }

  // F11 = focus mode
  if (e.key === 'F11') {
    e.preventDefault();
    document.body.classList.toggle('focus-mode');
    btnFocus.classList.toggle('active', document.body.classList.contains('focus-mode'));
    return;
  }

  if (IGNORED.has(e.key)) return;
  updateStats();
  scheduleSave();
  updateCursor();
  impact();
});

editorEl.addEventListener('keyup', updateCursor);
editorEl.addEventListener('click', updateCursor);
editorEl.addEventListener('input', () => { updateStats(); scheduleSave(); });
docTitleEl.addEventListener('input', scheduleSave);

// Find bar: Enter = next, Shift+Enter = prev
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? selectMatch(findIdx-1) : selectMatch(findIdx+1); }
  if (e.key === 'Escape') closeFind();
});

// ─── Konami Code ──────────────────────────────────────────
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let ki = 0;
document.addEventListener('keydown', (e) => {
  if (e.key === KONAMI[ki]) { ki++; if (ki === KONAMI.length) { ki=0; triggerKonami(); } }
  else ki = 0;
});
function triggerKonami() {
  if (!cfg.effectsOn) { cfg.effectsOn = true; applyEffectsState(); }
  for (let i=0;i<8;i++) setTimeout(()=>{
    particles.burst(Math.random()*innerWidth, Math.random()*innerHeight, 'nuclear', 4, 50);
  }, i*120);
  sound.playNuclear(3); shake(3);
  doFlash('rgba(255,215,0,.5)',1,300);
  particles.spawnTextBurst(innerWidth/2, innerHeight/2, '🌟 KONAMI!');
  queueAchievement({id:'konami',emoji:'🎮',title:'KONAMI CODE',msg:'神の力を解放した。世界よ震えろ。'});
  unlocked.add('konami');
}

// ─── Init ─────────────────────────────────────────────────
loadConfig();
bindSettings();
applyFont();
applyWidth();
applyTheme(cfg.theme);
applyEffectsState();

editorEl.style.fontSize   = cfg.fontSize + 'px';
editorEl.style.lineHeight = (cfg.lineHeight/100).toFixed(2);
document.getElementById('md-toolbar').style.display = cfg.mdToolbar ? '' : 'none';
document.body.classList.toggle('typewriter-mode', cfg.typewriter);

loadSaved();
editorEl.focus();
if (editorEl.value) {
  editorEl.setSelectionRange(editorEl.value.length, editorEl.value.length);
  updateStats(); updateCursor();
}

console.log('%c Typer v2 · Impact Edition ','background:#f97316;color:white;font-weight:bold;padding:2px 8px;border-radius:4px','\nコナミ: ↑↑↓↓←→←→BA');
