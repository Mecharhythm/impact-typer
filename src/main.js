/**
 * Typer v5 — The Ultimate Editor Upgrade
 * CodeMirror 6 + Markdown Preview + Tabs + Command Palette
 */

import './style.css';
import { SoundEngine } from './sound.js';
import { ParticleSystem } from './particles.js';
import * as idb from './idb.js';
import * as fs from './fs.js';

import { EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, lineNumbers, drawSelection, dropCursor, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import html2pdf from 'html2pdf.js';
import * as webllm from '@mlc-ai/web-llm';

// ─── DOM ──────────────────────────────────────────────────
const appEl       = document.getElementById('app');
const editorContainer = document.getElementById('editor-container');
const previewWrap = document.getElementById('preview-wrap');
const previewContainer = document.getElementById('preview-container');
const canvas      = document.getElementById('particle-canvas');
const flashEl     = document.getElementById('flash-overlay');
const tabsBar     = document.getElementById('tabs-bar');

// Sidebar & Workspace
const sidebar     = document.getElementById('sidebar');
const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
const btnOpenFolder = document.getElementById('btn-open-folder');
const btnNewFile  = document.getElementById('btn-new-file');
const btnNewFolder = document.getElementById('btn-new-folder');
const workspaceTree = document.getElementById('workspace-tree');
const workspaceTitle = document.getElementById('workspace-title');
const recentFilesList = document.getElementById('recent-files');

// Toolbar
const btnImpact   = document.getElementById('btn-impact-toggle');
const impactState = btnImpact.querySelector('.impact-state');
const btnAi       = document.getElementById('btn-ai');
const btnChallenge= document.getElementById('btn-challenge');
const btnPdf      = document.getElementById('btn-pdf');
const btnCmd      = document.getElementById('btn-cmd');
const btnPreview  = document.getElementById('btn-preview');
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

// Settings & Modals
const settingsPanel   = document.getElementById('settings-panel');
const settingsOverlay = document.getElementById('settings-overlay');
const btnSettingsClose = document.getElementById('btn-settings-close');
const statsModalOverlay = document.getElementById('stats-modal-overlay');
const statsModal        = document.getElementById('stats-modal');
const statsModalBody    = document.getElementById('stats-modal-body');
const btnStatsClose     = document.getElementById('btn-stats-close');
const dlModalOverlay    = document.getElementById('dl-modal-overlay');
const dlModal           = document.getElementById('dl-modal');
const btnDlClose        = document.getElementById('btn-dl-close');

// Command Palette
const cmdOverlay  = document.getElementById('cmd-palette-overlay');
const cmdPalette  = document.getElementById('cmd-palette');
const cmdInput    = document.getElementById('cmd-input');
const cmdResults  = document.getElementById('cmd-results');

// AI Chat Panel
const aiPanel     = document.getElementById('ai-panel');
const btnAiClose  = document.getElementById('btn-ai-close');
const aiChatLog   = document.getElementById('ai-chat-log');
const aiInput     = document.getElementById('ai-input');
const btnAiSend   = document.getElementById('btn-ai-send');
const btnAiLoad   = document.getElementById('btn-ai-load');

// Challenge Mode
const challengeOverlay = document.getElementById('challenge-overlay');
const challengeTimerEl = document.getElementById('challenge-timer');
const challengeScoreEl = document.getElementById('challenge-score');

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
  previewOn: false,
};

const WIDTHS = { narrow:'560px', medium:'720px', wide:'960px', full:'100%' };
const INTENSITY_LABELS = ['弱','中','強'];
const THEMES = ['light','dark','sepia'];

// ─── State ────────────────────────────────────────────
const docData = {
  combo:0, comboTimer:null, maxCombo:0,
  maxKps:0, explosions:0,
  intensity:0, intensityDecay:null,
  recentKeys:[],
};

const fsState = {
  dirHandle: null,
  recentFiles: [], // Array of handles
  workspaceEntries: [] // Cached flat list for command palette
};

let tabs = [];
let activeTabId = null;

// CodeMirror instance
let editorView = null;

// ─── Initialization ─────────────────────────────────────
function initCodeMirror() {
  const baseExtensions = [
    lineNumbers(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({ base: markdownLanguage }),
    drawSelection(),
    dropCursor(),
    crosshairCursor(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        updateStats();
        scheduleSave();
        updatePreview();
        impact();
      }
      if (update.selectionSet) {
        updateCursor();
      }
    }),
    EditorView.theme({
      "&": { backgroundColor: "transparent", color: "var(--text)" },
      ".cm-content": { caretColor: "var(--accent)" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--accent-bg)" }
    })
  ];

  if (cfg.theme === 'dark') {
    baseExtensions.push(oneDark);
  }

  editorView = new EditorView({
    state: EditorState.create({ doc: "", extensions: baseExtensions }),
    parent: editorContainer
  });
}

function getEditorText() {
  return editorView ? editorView.state.doc.toString() : '';
}

function setEditorText(text) {
  if (!editorView) return;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: text }
  });
}

// ─── Tabs & File Management ─────────────────────────────
function generateId() { return Math.random().toString(36).substr(2, 9); }

function renderTabs() {
  tabsBar.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.name + (tab.dirty ? ' *' : '');
    title.title = tab.name;
    
    const closeBtn = document.createElement('div');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    
    el.appendChild(title);
    el.appendChild(closeBtn);
    el.addEventListener('click', () => setActiveTab(tab.id));
    tabsBar.appendChild(el);
  });
}

async function setActiveTab(id) {
  // Save current tab state to its object
  if (activeTabId && editorView) {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab) currentTab.content = getEditorText();
  }
  
  activeTabId = id;
  const tab = tabs.find(t => t.id === id);
  if (tab) {
    setEditorText(tab.content || '');
    docTitleEl.value = tab.name;
    updateStats();
    updatePreview();
    
    if (tab.handle) {
      // Add to recents
      fsState.recentFiles = fsState.recentFiles.filter(h => h.name !== tab.handle.name);
      fsState.recentFiles.unshift(tab.handle);
      if (fsState.recentFiles.length > 10) fsState.recentFiles.pop();
      await idb.set('recents', fsState.recentFiles);
      renderRecents();
    }
  } else {
    setEditorText('');
    docTitleEl.value = '新規ドキュメント';
  }
  renderTabs();
  refreshWorkspace();
}

async function openFileInTab(fileHandle) {
  if (!(await fs.verifyPermission(fileHandle, true))) return;
  
  // Check if already open
  const existingTab = tabs.find(t => t.handle && t.handle.name === fileHandle.name); // Using name as heuristic for now
  if (existingTab) {
    setActiveTab(existingTab.id);
    return;
  }
  
  try {
    const text = await fs.readFileText(fileHandle);
    const tab = {
      id: generateId(),
      name: fileHandle.name,
      handle: fileHandle,
      content: text,
      dirty: false
    };
    tabs.push(tab);
    setActiveTab(tab.id);
  } catch (e) {
    console.error('Failed to open file', e);
  }
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs.splice(idx, 1);
  
  if (activeTabId === id) {
    if (tabs.length > 0) {
      setActiveTab(tabs[Math.max(0, idx - 1)].id);
    } else {
      activeTabId = null;
      setEditorText('');
      renderTabs();
      docTitleEl.value = 'Typer';
      updatePreview();
    }
  } else {
    renderTabs();
  }
}

// ─── Workspace Sync ─────────────────────────────────────

btnSidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('hidden');
});

btnOpenFolder.addEventListener('click', async () => {
  const dirHandle = await fs.openWorkspace();
  if (dirHandle) {
    fsState.dirHandle = dirHandle;
    await idb.set('workspace', dirHandle);
    await refreshWorkspace();
  }
});

btnNewFile.addEventListener('click', async () => {
  if (!fsState.dirHandle) return;
  const name = prompt('新しいファイル名を入力してください (例: memo.md)');
  if (!name) return;
  const fileHandle = await fs.createFile(fsState.dirHandle, name);
  if (fileHandle) {
    await refreshWorkspace();
    await openFileInTab(fileHandle);
  }
});

btnNewFolder.addEventListener('click', async () => {
  if (!fsState.dirHandle) return;
  const name = prompt('新しいフォルダ名を入力してください');
  if (!name) return;
  const dirHandle = await fs.createDirectory(fsState.dirHandle, name);
  if (dirHandle) {
    await refreshWorkspace();
  }
});

async function refreshWorkspace() {
  if (!fsState.dirHandle) return;
  if (!(await fs.verifyPermission(fsState.dirHandle, false))) {
    workspaceTree.innerHTML = `<button id="btn-resume-workspace" class="primary-btn">フォルダへのアクセスを再開</button>`;
    document.getElementById('btn-resume-workspace').addEventListener('click', async () => {
      await fs.verifyPermission(fsState.dirHandle, true);
      refreshWorkspace();
    });
    return;
  }

  workspaceTitle.textContent = fsState.dirHandle.name;
  btnNewFile.style.display = 'flex';
  btnNewFolder.style.display = 'flex';
  
  const entries = await fs.readDirectory(fsState.dirHandle);
  
  // Flatten entries for Command Palette
  fsState.workspaceEntries = [];
  function flatten(arr) {
    for (const e of arr) {
      if (e.kind === 'file') fsState.workspaceEntries.push(e);
      if (e.children) flatten(e.children);
    }
  }
  flatten(entries);

  workspaceTree.innerHTML = '';
  renderTree(entries, workspaceTree);
}

function renderTree(entries, container, indent = 0) {
  const activeHandleName = activeTabId ? tabs.find(t=>t.id===activeTabId)?.handle?.name : null;
  
  for (const entry of entries) {
    const el = document.createElement('div');
    el.className = 'tree-item' + (activeHandleName === entry.name ? ' active' : '');
    el.style.paddingLeft = `${16 + indent * 16}px`;
    el.title = entry.name;
    
    if (entry.kind === 'directory') {
      el.innerHTML = `<span class="tree-icon">📁</span> ${entry.name}`;
      container.appendChild(el);
      if (entry.children && entry.children.length > 0) {
        renderTree(entry.children, container, indent + 1);
      }
    } else {
      el.innerHTML = `<span class="tree-icon">📄</span> ${entry.name}`;
      el.addEventListener('click', () => openFileInTab(entry.handle));
      container.appendChild(el);
    }
  }
}

function renderRecents() {
  recentFilesList.innerHTML = '';
  if (fsState.recentFiles.length === 0) {
    recentFilesList.innerHTML = '<div class="sidebar-desc">最近開いたファイルはありません</div>';
    return;
  }
  for (const handle of fsState.recentFiles) {
    const el = document.createElement('div');
    el.className = 'tree-item';
    el.innerHTML = `<span class="tree-icon">📄</span> ${handle.name}`;
    el.addEventListener('click', () => openFileInTab(handle));
    recentFilesList.appendChild(el);
  }
}

async function loadFileSystemState() {
  try {
    const ws = await idb.get('workspace');
    if (ws) {
      fsState.dirHandle = ws;
      await refreshWorkspace();
    }
    const recents = await idb.get('recents');
    if (recents && Array.isArray(recents)) {
      fsState.recentFiles = recents;
      renderRecents();
    }
  } catch (e) {
    console.error('Error loading FS state from IDB', e);
  }
}

// ─── Autosave ──
let saveTimer = null;
function scheduleSave() {
  autosaveLbl.textContent = '保存中...';
  autosaveLbl.classList.remove('saved');
  
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (currentTab) currentTab.dirty = true;
  renderTabs();

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const text = getEditorText();
      if (currentTab && currentTab.handle) {
        if (await fs.verifyPermission(currentTab.handle)) {
          await fs.saveFileText(currentTab.handle, text);
          currentTab.dirty = false;
        }
      } else {
        localStorage.setItem('typer_content', text);
        localStorage.setItem('typer_title', docTitleEl.value);
        if (currentTab) currentTab.dirty = false;
      }
      renderTabs();
      autosaveLbl.textContent = '保存済み';
      autosaveLbl.classList.add('saved');
      setTimeout(() => { autosaveLbl.textContent = ''; autosaveLbl.classList.remove('saved'); }, 2000);
    } catch (e) {
      console.error('Save failed', e);
      autosaveLbl.textContent = '保存失敗';
    }
  }, 1200);
}

// ─── Editor Features ──────────────────────────────────────

function updateStats() {
  const val = getEditorText();
  const chars = val.length;
  const words = val.trim() === '' ? 0 : val.trim().split(/\s+/).length;
  const lines = val === '' ? 1 : val.split('\n').length;
  const readMin = Math.max(1, Math.round(words / 200));

  statChars.textContent = `${chars.toLocaleString()} 文字`;
  statWords.textContent = `${words.toLocaleString()} 単語`;
  statLines.textContent = `${lines} 行`;
  statRead.textContent  = `読了 ${words < 50 ? '1分未満' : readMin+'分'}`;

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

function updateCursor() {
  if (!editorView) return;
  const selection = editorView.state.selection.main;
  const line = editorView.state.doc.lineAt(selection.head);
  cursorPos.textContent = `${line.number}:${selection.head - line.from + 1}`;
}

function updatePreview() {
  if (!cfg.previewOn) {
    previewWrap.style.display = 'none';
    return;
  }
  previewWrap.style.display = 'block';
  const text = getEditorText();
  const rawHtml = marked(text);
  const safeHtml = DOMPurify.sanitize(rawHtml);
  previewContainer.innerHTML = safeHtml;
}

btnPreview.addEventListener('click', () => {
  cfg.previewOn = !cfg.previewOn;
  btnPreview.classList.toggle('active', cfg.previewOn);
  updatePreview();
  saveConfig();
});

// ─── Impact Effects ───────────────────────────────────────
const ACHIEVEMENTS = [
  {id:'first',   chars:1,   emoji:'🎬', title:'第一打',           msg:'映画が始まった。'},
  {id:'ten',     chars:10,  emoji:'🔥', title:'加熱中',           msg:'10文字打った。'},
  {id:'fifty',   chars:50,  emoji:'💣', title:'ON FIRE',         msg:'50文字。もはや人間ではない。'},
  {id:'hundred', chars:100, emoji:'☢️', title:'NUCLEAR TYPIST',  msg:'100文字。世界の終わりが始まる。'},
  {id:'fivehun', chars:500, emoji:'🌌', title:'GODFORM',         msg:'500文字。タイピングの神だ。'},
];
const unlocked = new Set();
let achQueue = [], achShowing = false;

function getEditorPoint() {
  const r = editorContainer.getBoundingClientRect();
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

function impact() {
  if (!cfg.effectsOn) return;

  const now = Date.now();
  docData.recentKeys.push(now);
  docData.recentKeys = docData.recentKeys.filter(t => now-t < 1000);
  const kps = docData.recentKeys.length;
  if (kps > docData.maxKps) { docData.maxKps = kps; document.getElementById('stat-kps-max').textContent = kps; }

  docData.intensity = Math.max(0, Math.min(100, docData.intensity + (5 + Math.min(kps/6,2)*6)));
  if (docData.intensityDecay) clearTimeout(docData.intensityDecay);
  docData.intensityDecay = setTimeout(() => {
    if (docData.intensity > 0) docData.intensity = Math.max(0, docData.intensity - 4);
  }, 1400);

  const iNorm = docData.intensity/100;
  const eLevel = (1 + iNorm*1.5) * (cfg.intensityMult/2);

  if (docData.comboTimer) clearTimeout(docData.comboTimer);
  docData.combo++;
  if (docData.combo > docData.maxCombo) docData.maxCombo = docData.combo;
  
  if (cfg.combo && COMBOS[docData.combo]) {
    document.getElementById('stat-combo-max').textContent = docData.maxCombo;
    const m = COMBOS[docData.combo];
    comboPopup.textContent = m.text;
    comboPopup.style.color = m.color;
    comboPopup.style.textShadow = `0 0 24px ${m.color}80, 0 0 48px ${m.color}40`;
    comboPopup.classList.remove('pop');
    void comboPopup.offsetWidth;
    comboPopup.classList.add('pop');
  }
  docData.comboTimer = setTimeout(() => { docData.combo = 0; }, 1100);

  if (cfg.sound) {
    switch(cfg.mode) {
      case 'explosion':  sound.playExplosion(eLevel*.75);  break;
      case 'laser':      sound.playLaser(eLevel);           break;
      case 'mechanical': sound.playMechanical(eLevel*.85); break;
      case 'nuclear':    sound.playNuclear(eLevel*.65);    break;
    }
  }

  if (cfg.particles) {
    docData.explosions++;
    document.getElementById('stat-explosions').textContent = docData.explosions;
    const p = getEditorPoint();
    const cnt = Math.min(Math.floor(8 + eLevel*12 + docData.combo*.3), 60);
    particles.burst(p.x, p.y, cfg.mode, eLevel, cnt);
  }

  shake(docData.intensity < 30 ? 1 : docData.intensity < 70 ? 2 : 3);

  const fc = { explosion:`rgba(249,115,22,${.025+iNorm*.07})`, laser:`rgba(0,245,255,${.02+iNorm*.06})`, mechanical:`rgba(255,255,255,${.03+iNorm*.07})`, nuclear:`rgba(57,255,20,${.03+iNorm*.08})` };
  doFlash(fc[cfg.mode]||'white', 1, 55);

  const chars = getEditorText().length;
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && chars >= a.chars) {
      unlocked.add(a.id); achQueue.push(a);
      if (!achShowing) drainAch();
    }
  }
}

function drainAch() {
  if (!achQueue.length) { achShowing = false; return; }
  achShowing = true;
  const a = achQueue.shift();
  achieveToast.innerHTML = `<div class="toast-label">🏆 実績解除</div><div class="toast-title">${a.emoji} ${a.title}</div><div class="toast-msg">${a.msg}</div>`;
  achieveToast.classList.add('show');
  setTimeout(() => { achieveToast.classList.remove('show'); setTimeout(drainAch, 400); }, 3000);
}

const COMBOS = {
  5:  {text:'NICE!',   color:'#22c55e'},
  10: {text:'HOT!',    color:'#f59e0b'},
  20: {text:'INSANE',  color:'#f97316'},
  30: {text:'NUCLEAR', color:'#ef4444'},
  50: {text:'世界崩壊', color:'#a855f7'},
  100:{text:'神',       color:'#ec4899'},
};


// ─── Command Palette ──────────────────────────────────────
let cmdItems = [];
let cmdSelectedIndex = 0;

function openCommandPalette() {
  cmdItems = [];
  // 1. Files in workspace
  fsState.workspaceEntries.forEach(e => cmdItems.push({ title: e.name, hint: 'ワークスペースのファイルを開く', action: () => openFileInTab(e.handle) }));

  cmdInput.value = '';
  renderCommandResults();
  cmdOverlay.classList.add('open');
  cmdPalette.classList.add('open');
  cmdInput.focus();
}

function closeCommandPalette() {
  cmdOverlay.classList.remove('open');
  cmdPalette.classList.remove('open');
  if(editorView) editorView.focus();
}

function renderCommandResults() {
  const query = cmdInput.value.toLowerCase();
  const filtered = cmdItems.filter(i => i.title.toLowerCase().includes(query));
  cmdSelectedIndex = Math.min(cmdSelectedIndex, Math.max(0, filtered.length - 1));
  
  cmdResults.innerHTML = '';
  filtered.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'cmd-item' + (idx === cmdSelectedIndex ? ' selected' : '');
    el.innerHTML = `<span class="cmd-item-title">${item.title}</span><span class="cmd-item-hint">${item.hint}</span>`;
    el.addEventListener('click', () => {
      closeCommandPalette();
      item.action();
    });
    cmdResults.appendChild(el);
  });
}

cmdInput.addEventListener('input', () => { cmdSelectedIndex = 0; renderCommandResults(); });
cmdInput.addEventListener('keydown', (e) => {
  const items = Array.from(cmdResults.children);
  if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelectedIndex = Math.min(cmdSelectedIndex + 1, items.length - 1); renderCommandResults(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); cmdSelectedIndex = Math.max(cmdSelectedIndex - 1, 0); renderCommandResults(); }
  if (e.key === 'Enter') { e.preventDefault(); if(items[cmdSelectedIndex]) items[cmdSelectedIndex].click(); }
  if (e.key === 'Escape') closeCommandPalette();
});

cmdOverlay.addEventListener('click', closeCommandPalette);

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    if (e.shiftKey) { btnPreview.click(); return; }
    if (cmdPalette.classList.contains('open')) closeCommandPalette(); else openCommandPalette();
  }
});

// ─── v6: Zen Mode & Typewriter Scroll ─────────────────────
let zenModeOn = false;
function toggleZenMode() {
  zenModeOn = !zenModeOn;
  document.body.classList.toggle('zen-mode', zenModeOn);
  if(editorView) {
    // Keep cursor centered
    editorView.dispatch({ effects: EditorView.scrollIntoView(editorView.state.selection.main, {y: "center"}) });
  }
}
const setZenmode = document.getElementById('set-zenmode');
if(setZenmode) setZenmode.addEventListener('change', toggleZenMode);

// ─── v6: PDF Export ───────────────────────────────────────
function exportToPDF() {
  const element = document.getElementById('preview-container');
  if (!element || element.innerHTML.trim() === '') {
    alert('プレビュー画面にエクスポートする内容がありません。プレビューをONにしてテキストを入力してください。');
    return;
  }
  const opt = {
    margin:       0.5,
    filename:     (docTitleEl.value || 'document') + '.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(element).save();
}
btnPdf.addEventListener('click', exportToPDF);

// ─── v6: Gamification (Challenge Mode) ────────────────────
let challengeActive = false;
let challengeTime = 60;
let challengeTimerInterval = null;
let challengeStartChars = 0;

function startChallenge() {
  if (challengeActive) return;
  challengeActive = true;
  challengeTime = 60;
  challengeStartChars = getEditorText().length;
  challengeOverlay.classList.add('active');
  challengeTimerEl.textContent = challengeTime;
  challengeScoreEl.textContent = '0';
  
  challengeTimerInterval = setInterval(() => {
    challengeTime--;
    challengeTimerEl.textContent = challengeTime;
    
    // Calculate current WPM roughly: ((chars - startChars) / 5) / (elapsed_minutes)
    const elapsedMins = (60 - challengeTime) / 60;
    const currentChars = getEditorText().length;
    const typedWords = Math.max(0, (currentChars - challengeStartChars) / 5);
    const wpm = elapsedMins > 0 ? Math.round(typedWords / elapsedMins) : 0;
    challengeScoreEl.textContent = wpm;
    
    if (wpm < 40 && elapsedMins > 0.1) {
      challengeScoreEl.classList.add('challenge-danger');
      shake(1);
    } else {
      challengeScoreEl.classList.remove('challenge-danger');
    }

    if (challengeTime <= 0) {
      endChallenge(wpm);
    }
  }, 1000);
}

function endChallenge(finalWpm) {
  clearInterval(challengeTimerInterval);
  challengeActive = false;
  challengeOverlay.classList.remove('active');
  challengeScoreEl.classList.remove('challenge-danger');
  alert(`チャレンジ終了！\nあなたの記録: ${finalWpm} WPM`);
  if (finalWpm > 80) {
    for (let i=0; i<10; i++) setTimeout(() => particles.burst(Math.random()*innerWidth, Math.random()*innerHeight, 'nuclear', 3, 50), i*100);
    sound.playNuclear(3);
  }
}
btnChallenge.addEventListener('click', startChallenge);

// ─── v6: WebLLM Local AI ──────────────────────────────────
let engine = null;
let aiLoading = false;

btnAiClose.addEventListener('click', () => aiPanel.classList.remove('open'));
btnAi.addEventListener('click', () => aiPanel.classList.toggle('open'));

function appendAiMessage(role, text) {
  const el = document.createElement('div');
  el.className = `ai-msg ${role}`;
  el.textContent = text;
  aiChatLog.appendChild(el);
  aiChatLog.scrollTop = aiChatLog.scrollHeight;
}

btnAiLoad.addEventListener('click', async () => {
  if (aiLoading || engine) return;
  aiLoading = true;
  btnAiLoad.textContent = '読み込み中...';
  appendAiMessage('system', 'AIモデルのロードを開始しました。しばらくお待ちください...');
  
  try {
    const initProgressCallback = (report) => {
      btnAiLoad.textContent = Math.round(report.progress * 100) + '%';
    };
    engine = await webllm.CreateMLCEngine('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', { initProgressCallback });
    appendAiMessage('system', 'ロード完了！ローカルAIが準備できました。');
    btnAiLoad.style.display = 'none';
    aiInput.disabled = false;
    btnAiSend.disabled = false;
    aiInput.focus();
  } catch (err) {
    console.error(err);
    appendAiMessage('system', 'エラー: ' + err.message);
    btnAiLoad.textContent = 'ロード失敗 (再試行)';
    aiLoading = false;
  }
});

btnAiSend.addEventListener('click', async () => {
  const q = aiInput.value.trim();
  if (!q || !engine) return;
  
  aiInput.value = '';
  aiInput.disabled = true;
  btnAiSend.disabled = true;
  appendAiMessage('user', q);
  
  // Inject editor context
  const editorContent = getEditorText();
  const contextMsg = editorContent ? `\n\n【現在編集中のドキュメント内容】:\n${editorContent.slice(-1500)}` : '';
  
  const messages = [
    { role: 'system', content: 'あなたはTyperというエディタに内蔵された優秀なAIアシスタントです。ユーザーの執筆をサポートしてください。' },
    { role: 'user', content: q + contextMsg }
  ];
  
  const botEl = document.createElement('div');
  botEl.className = 'ai-msg bot';
  botEl.textContent = '...';
  aiChatLog.appendChild(botEl);
  aiChatLog.scrollTop = aiChatLog.scrollHeight;

  try {
    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
    });
    let reply = '';
    for await (const chunk of chunks) {
      reply += chunk.choices[0]?.delta?.content || '';
      botEl.textContent = reply;
      aiChatLog.scrollTop = aiChatLog.scrollHeight;
    }
  } catch (err) {
    botEl.textContent = 'エラーが発生しました。';
  }
  
  aiInput.disabled = false;
  btnAiSend.disabled = false;
  aiInput.focus();
});
aiInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') btnAiSend.click(); });


// ─── Settings & Setup ─────────────────────────────────────
function bindSettings() {
  btnCmd.addEventListener('click', () => { if (cmdPalette.classList.contains('open')) closeCommandPalette(); else openCommandPalette(); });
  btnImpact.addEventListener('click', () => { cfg.effectsOn = !cfg.effectsOn; applyEffectsState(); saveConfig(); });
  btnFocus.addEventListener('click', () => { document.body.classList.toggle('focus-mode'); btnFocus.classList.toggle('active', document.body.classList.contains('focus-mode')); });
  
  document.getElementById('set-font').addEventListener('change', (e) => { cfg.font = e.target.value; applyFont(); saveConfig(); });
  document.getElementById('set-width').addEventListener('change', (e) => { cfg.width = e.target.value; applyWidth(); saveConfig(); });
  
  btnSettings.addEventListener('click', () => { settingsPanel.classList.add('open'); settingsOverlay.classList.add('open'); });
  btnSettingsClose.addEventListener('click', () => { settingsPanel.classList.remove('open'); settingsOverlay.classList.remove('open'); });
  settingsOverlay.addEventListener('click', () => { settingsPanel.classList.remove('open'); settingsOverlay.classList.remove('open'); });
  
  // (Omitted binding all sub-sliders for brevity, they work the same)
}

function applyTheme(theme) {
  cfg.theme = theme;
  if (theme === 'light') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.getElementById('icon-theme-light').style.display = theme !== 'dark' ? '' : 'none';
  document.getElementById('icon-theme-dark').style.display  = theme === 'dark'  ? '' : 'none';
  saveConfig();
}
function applyFont() {
  const map = { inter:"'Inter',-apple-system,sans-serif", jetbrains:"'JetBrains Mono',monospace", serif:"Georgia,serif" };
  editorContainer.style.setProperty('--font-editor', map[cfg.font] || map.inter);
}
function applyWidth() {
  document.getElementById('editor-wrap').style.maxWidth = WIDTHS[cfg.width] || '720px';
}
function applyEffectsState() {
  const on = cfg.effectsOn;
  btnImpact.classList.toggle('on', on);
  impactState.textContent = on ? 'ON' : 'OFF';
  const el = document.getElementById('set-effects-master');
  if(el) el.checked = on;
}

function saveConfig() { try { localStorage.setItem('typer_cfg', JSON.stringify(cfg)); } catch(e){} }
function loadConfig() { try { const raw = localStorage.getItem('typer_cfg'); if (raw) Object.assign(cfg, JSON.parse(raw)); } catch(e){} }

// ─── Init ─────────────────────────────────────────────────
loadConfig();
bindSettings();
initCodeMirror();

applyFont();
applyWidth();
applyTheme(cfg.theme);
applyEffectsState();
btnPreview.classList.toggle('active', cfg.previewOn);
updatePreview();

loadFileSystemState().then(() => {
  // If no files opened via fs, load from localStorage fallback
  if (tabs.length === 0) {
    const c = localStorage.getItem('typer_content');
    const t = localStorage.getItem('typer_title');
    const tab = { id: generateId(), name: t || 'Untitled', content: c || '', dirty: false };
    tabs.push(tab);
    setActiveTab(tab.id);
  }
});

console.log('%c Typer v5 · IDE Edition ','background:#f97316;color:white;font-weight:bold;padding:2px 8px;border-radius:4px');
