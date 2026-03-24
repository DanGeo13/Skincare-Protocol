// app.js

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

let protocolData = readJsonStorage('customProtocol', DEFAULT_PROTOCOL);
let historyLog   = readJsonStorage('skincareHistory', {});
let settings = {
  startDate: localStorage.getItem('startDate') || new Date().toISOString().split('T')[0],
  phaseDays: parseInt(localStorage.getItem('phaseDays'), 10) || 14
};

let timerInterval = null;
const timerSound  = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

// Editor state
let editorPhase   = String(Object.keys(protocolData).sort((a,b)=>Number(a)-Number(b))[0] || '1');
let editorRoutine = 'AM';

// Init settings inputs
document.getElementById('set-start-date').value  = settings.startDate;
document.getElementById('set-phase-days').value   = settings.phaseDays;

// ══════════════════════════════════════════
//  TAB NAVIGATION
// ══════════════════════════════════════════
function switchTab(tab) {
  ['routine','history','settings'].forEach(t => {
    document.getElementById(`view-${t}`).classList.add('hidden');
    document.getElementById(`nav-${t}`).classList.remove('active');
  });
  document.getElementById(`view-${tab}`).classList.remove('hidden');
  document.getElementById(`nav-${tab}`).classList.add('active');
  if (tab === 'routine')  renderRoutine();
  if (tab === 'history')  renderHistory();
  if (tab === 'settings') renderProtocolEditor();
}

function applyTheme(isPM) {
  document.body.classList.toggle('theme-pm', isPM);
  document.body.classList.toggle('theme-am', !isPM);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', isPM ? '#1a1035' : '#fde8c8');
  }
}

function getRoutineSteps(phaseNum, phaseData, isPM, dayOfWeek) {
  let routineSteps = [];
  if (!isPM) {
    routineSteps = phaseData.AM || [];
  } else {
    const isRetrieveNight = ['Monday','Wednesday','Friday'].includes(dayOfWeek);
    if (phaseNum <= 2) {
      routineSteps = isRetrieveNight ? (phaseData.PM_A || []) : (phaseData.PM_B || []);
    } else if (isRetrieveNight) {
      routineSteps = phaseData.PM_A || [];
    } else if (['Tuesday', 'Thursday'].includes(dayOfWeek)) {
      routineSteps = phaseData.PM_B_TueThu || phaseData.PM_B || [];
    } else if (dayOfWeek === 'Saturday') {
      routineSteps = phaseData.PM_B_Sat || phaseData.PM_B || [];
    } else if (dayOfWeek === 'Sunday') {
      routineSteps = phaseData.PM_B_Sun || phaseData.PM_B || [];
    } else {
      routineSteps = phaseData.PM_B || [];
    }
  }

  if (isPM && phaseData.Modifiers && phaseData.Modifiers[dayOfWeek]) {
    routineSteps = [...routineSteps, phaseData.Modifiers[dayOfWeek]];
  }

  return routineSteps;
}

function updateRoutineHeader(isPM, dayOfWeek, total, doneCount, percent) {
  const chipRoutine = document.getElementById('header-chip-routine');
  const chipFocus = document.getElementById('header-chip-focus');
  const subtext = document.getElementById('greeting-subtext');
  const remaining = Math.max(total - doneCount, 0);

  document.getElementById('greeting-text').innerText = isPM ? 'Good Evening, Dan 🌙' : 'Good Morning, Dan ☀️';
  chipRoutine.textContent = isPM ? 'Evening ritual' : 'Morning ritual';
  chipFocus.textContent = remaining === 0
    ? 'Locked in'
    : isPM ? 'Wind-down mode' : 'Fresh-start mode';
  subtext.textContent = remaining === 0
    ? 'Everything for this session is done. Hold the streak and enjoy the glow.'
    : isPM
      ? `Your ${dayOfWeek.toLowerCase()} reset is ready. ${remaining} step${remaining === 1 ? '' : 's'} left before lights-out mode.`
      : `Start clean and stack momentum early. ${remaining} step${remaining === 1 ? '' : 's'} left to close out the morning.`;

  document.getElementById('summary-remaining').innerText = String(remaining);
  document.getElementById('summary-remaining-note').innerText = remaining === 1 ? 'step to go' : 'steps to go';
  document.getElementById('summary-completion').innerText = `${doneCount} / ${total}`;
  document.getElementById('summary-completion-note').innerText = percent === 100 ? 'fully complete' : `${percent}% of this session`;
}

// ══════════════════════════════════════════
//  ROUTINE
// ══════════════════════════════════════════
function calculatePhase() {
  const start = new Date(`${settings.startDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = Math.max(0, today - start);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let phaseNum = Math.floor(diffDays / settings.phaseDays) + 1;
  const maxPhase = Math.max(...Object.keys(protocolData).map(Number));
  return phaseNum > maxPhase ? maxPhase : phaseNum;
}

function getTodayKey() { return new Date().toISOString().split('T')[0]; }

function toggleStep(index, totalSteps, isPM) {
  if ('vibrate' in navigator) navigator.vibrate(50);
  const today = getTodayKey();
  const tod   = isPM ? 'PM' : 'AM';
  if (!historyLog[today]) historyLog[today] = { AM:{done:0,total:0}, PM:{done:0,total:0}, steps:{AM:[],PM:[]} };
  const arr = historyLog[today].steps[tod];
  if (arr.includes(index)) arr.splice(arr.indexOf(index), 1);
  else arr.push(index);
  historyLog[today][tod].done  = arr.length;
  historyLog[today][tod].total = totalSteps;
  localStorage.setItem('skincareHistory', JSON.stringify(historyLog));
  renderRoutine();
}

function resetToday() {
  const today = getTodayKey();
  if (historyLog[today]) {
    historyLog[today] = { AM:{done:0,total:0}, PM:{done:0,total:0}, steps:{AM:[],PM:[]} };
    localStorage.setItem('skincareHistory', JSON.stringify(historyLog));
  }
  renderRoutine();
}

function renderRoutine() {
  const now       = new Date();
  const isPM      = now.getHours() >= 12;
  const dayOfWeek = now.toLocaleDateString('en-AU', {weekday:'long'});

  applyTheme(isPM);

  const phaseNum  = calculatePhase();
  const phaseData = protocolData[phaseNum] || protocolData[Object.keys(protocolData)[0]];
  document.getElementById('phase-badge').innerText   = phaseData.name || `Phase ${phaseNum}`;
  document.getElementById('time-context').innerText  = `${dayOfWeek} · ${isPM ? 'PM Routine' : 'AM Routine'}`;

  const routineSteps = getRoutineSteps(phaseNum, phaseData, isPM, dayOfWeek);

  const today      = getTodayKey();
  const tod        = isPM ? 'PM' : 'AM';
  const completed  = historyLog[today]?.steps?.[tod] || [];
  const total      = routineSteps.length;
  const percent    = total === 0 ? 0 : Math.round((completed.length / total) * 100);
  updateRoutineHeader(isPM, dayOfWeek, total, completed.length, percent);

  const circle       = document.getElementById('progress-circle');
  const radius       = circle.r.baseVal.value;
  const circ         = radius * 2 * Math.PI;
  circle.style.strokeDasharray  = `${circ} ${circ}`;
  circle.style.strokeDashoffset = circ - (percent/100) * circ;
  document.getElementById('progress-text').innerText = `${percent}%`;
  circle.closest('svg').classList.toggle('ring-complete', percent===100 && total>0);

  const container = document.getElementById('routine-container');
  const successMsg = document.getElementById('success-message');

  if (percent === 100 && total > 0) {
    container.classList.add('hidden');
    successMsg.classList.remove('hidden');
    if ('vibrate' in navigator) navigator.vibrate([100,50,100]);
    return;
  }

  container.classList.remove('hidden');
  successMsg.classList.add('hidden');
  container.innerHTML = '';

  const stepEntries = routineSteps.map((step, i) => ({
    step,
    index: i,
    isDone: completed.includes(i)
  })).sort((a, b) => Number(a.isDone) - Number(b.isDone) || a.index - b.index);

  stepEntries.forEach(({ step, index, isDone }, displayIndex) => {
    const isObj  = typeof step === 'object';
    const name   = isObj ? step.name : step;
    const desc   = isObj && step.desc   ? step.desc   : null;
    const timer  = isObj && step.timer  ? step.timer  : null;

    const card = document.createElement('div');
    card.className = `step-card entering${isDone ? ' done' : ''}`;
    card.style.animationDelay = `${displayIndex * 45}ms`;
    card.onclick = () => {
      card.classList.add('animating');
      setTimeout(() => card.classList.remove('animating'), 180);
      toggleStep(index, total, isPM);
    };
    card.innerHTML = `
      <div class="step-check">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="step-body">
        <div class="step-name">${escHtml(name)}</div>
        ${desc ? `<div class="step-desc">${escHtml(desc)}</div>` : ''}
      </div>
      ${timer ? `<button class="timer-btn" onclick="startTimer(event,${timer})">⏱ ${fmtTime(timer)}</button>` : ''}
    `;
    container.appendChild(card);
    requestAnimationFrame(() => {
      card.classList.remove('entering');
    });
  });
}

// ══════════════════════════════════════════
//  TIMER
// ══════════════════════════════════════════
function fmtTime(s) {
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}

function startTimer(e, seconds) {
  e.stopPropagation();
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  let rem = seconds;
  const display = document.getElementById('timer-display');
  display.classList.remove('hidden');
  display.innerText = `⏱ ${fmtTime(rem)}`;
  timerInterval = setInterval(() => {
    rem--;
    display.innerText = `⏱ ${fmtTime(rem)}`;
    if (rem <= 0) {
      clearInterval(timerInterval); timerInterval = null;
      display.innerText = '✅ Timer done!';
      timerSound.play().catch(()=>{});
      if ('vibrate' in navigator) navigator.vibrate([200,100,200,100,400]);
      setTimeout(() => display.classList.add('hidden'), 4000);
    }
  }, 1000);
}

// ══════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════
function renderHistory() {
  const container = document.getElementById('history-container');
  container.innerHTML = '';
  const days = Object.keys(historyLog).sort((a,b) => b.localeCompare(a));
  if (!days.length) {
    container.innerHTML = '<div class="history-card"><div style="color:var(--text-secondary);font-size:0.9rem">No history yet. Complete a routine to see it here.</div></div>';
    return;
  }
  days.forEach(day => {
    const d     = historyLog[day];
    const amPct = d.AM.total ? Math.round((d.AM.done/d.AM.total)*100) : 0;
    const pmPct = d.PM.total ? Math.round((d.PM.done/d.PM.total)*100) : 0;
    const card  = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `
      <div class="history-date">${new Date(day+'T12:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}</div>
      ${d.AM.total ? `<div class="history-row"><span>☀️ AM — ${d.AM.done}/${d.AM.total} steps</span><span>${amPct}%</span></div><div class="history-bar-wrap"><div class="history-bar" style="width:${amPct}%"></div></div>` : ''}
      ${d.PM.total ? `<div class="history-row" style="margin-top:8px"><span>🌙 PM — ${d.PM.done}/${d.PM.total} steps</span><span>${pmPct}%</span></div><div class="history-bar-wrap"><div class="history-bar" style="width:${pmPct}%"></div></div>` : ''}
    `;
    container.appendChild(card);
  });
}

// ══════════════════════════════════════════
//  PROTOCOL EDITOR
// ══════════════════════════════════════════
const ROUTINE_TYPES = [
  { key:'AM',         label:'☀️ AM'       },
  { key:'PM_A',       label:'🌙 PM-A'     },
  { key:'PM_B',       label:'🌙 PM-B'     },
  { key:'PM_B_Sat',   label:'🌙 Sat'      },
  { key:'PM_B_Sun',   label:'🌙 Sun'      },
  { key:'Modifiers',  label:'⚡ Modifiers' },
];
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function renderProtocolEditor() {
  renderPhasePicker();
  renderRoutineTypePicker();
  renderStepList();
  // Sync phase name input
  const phaseName = protocolData[editorPhase]?.name || '';
  document.getElementById('phase-name-input').value = phaseName;
  // Sync JSON export
  document.getElementById('set-protocol-json').value = JSON.stringify(protocolData, null, 2);
}

function renderPhasePicker() {
  const phases = Object.keys(protocolData).sort((a,b)=>Number(a)-Number(b));
  document.getElementById('phase-picker').innerHTML =
    phases.map(p => `<button class="pill-btn${editorPhase===p?' active':''}" onclick="selectEditorPhase('${p}')">${protocolData[p].name||'Phase '+p}</button>`).join('') +
    `<button class="pill-btn add-pill" onclick="addPhase()">＋</button>`;
}

function renderRoutineTypePicker() {
  document.getElementById('routine-type-picker').innerHTML =
    ROUTINE_TYPES.map(r => `<button class="pill-btn${editorRoutine===r.key?' active':''}" onclick="selectEditorRoutine('${r.key}')">${r.label}</button>`).join('');
  document.getElementById('add-step-btn').textContent = editorRoutine === 'Modifiers' ? '＋ Add Modifier' : '＋ Add Step';
}

function selectEditorPhase(key) {
  saveEditorState();
  editorPhase = key;
  renderProtocolEditor();
}

function selectEditorRoutine(key) {
  saveEditorState();
  editorRoutine = key;
  renderRoutineTypePicker();
  renderStepList();
}

// ── Phase name ──
let phaseNameTimeout = null;
function savePhaseNameDebounced() {
  clearTimeout(phaseNameTimeout);
  phaseNameTimeout = setTimeout(() => {
    if (!protocolData[editorPhase]) protocolData[editorPhase] = {};
    protocolData[editorPhase].name = document.getElementById('phase-name-input').value.trim();
    persistProtocol();
    renderPhasePicker(); // update pill labels
  }, 500);
}

// ── Add phase ──
function addPhase() {
  saveEditorState();
  const keys = Object.keys(protocolData).map(Number).sort((a,b)=>a-b);
  const newKey = String((keys[keys.length-1]||0) + 1);
  protocolData[newKey] = { name: `Phase ${newKey}`, AM:[], PM_A:[], PM_B:[] };
  editorPhase = newKey;
  persistProtocol();
  renderProtocolEditor();
}

// ── Step list ──
function renderStepList() {
  const container = document.getElementById('step-editor-list');
  container.innerHTML = '';
  const phaseData = protocolData[editorPhase] || {};

  if (editorRoutine === 'Modifiers') {
    renderModifierList(container, phaseData.Modifiers || {});
    return;
  }

  const steps = phaseData[editorRoutine] || [];
  if (steps.length === 0) {
    container.innerHTML = '<div class="editor-empty">No steps yet — tap ＋ Add Step below.</div>';
    return;
  }

  steps.forEach((step, i) => {
    const isObj    = typeof step === 'object';
    const name     = isObj ? (step.name||'') : step;
    const desc     = isObj ? (step.desc||'') : '';
    const timer    = isObj ? (step.timer||0) : 0;
    const timerMin = Math.floor(timer/60);
    const timerSec = timer % 60;
    const hasExtras = desc || timer > 0;

    const card = document.createElement('div');
    card.className = 'editor-step-card';

    card.innerHTML = `
      <div class="editor-step-main">
        <span class="editor-drag">⠿</span>
        <input class="editor-name-input" type="text" value="${escHtml(name)}" placeholder="Product or step name" oninput="scheduleAutoSave()"/>
        <button class="editor-expand-btn${hasExtras?' has-extras':''}" onclick="toggleExtras(this)" title="Description &amp; Timer">${hasExtras?'✏️':'＋'}</button>
        <button class="editor-delete-btn" onclick="deleteEditorStep(${i})" title="Remove step">✕</button>
      </div>
      <div class="editor-step-extras${hasExtras?'':' hidden'}">
        <textarea class="editor-desc-input" placeholder="Instructions (e.g. Apply to damp skin, rinse after 5 min)" oninput="scheduleAutoSave()">${escHtml(desc)}</textarea>
        <div class="editor-timer-row">
          <span class="editor-timer-label">⏱ Timer</span>
          <input class="editor-timer-input" type="number" min="0" max="120" value="${timerMin||''}" placeholder="0" oninput="scheduleAutoSave()"/>
          <span class="editor-timer-sep">min</span>
          <input class="editor-timer-input" type="number" min="0" max="59" value="${timerSec||''}" placeholder="0" oninput="scheduleAutoSave()"/>
          <span class="editor-timer-sep">sec</span>
          <button class="editor-timer-clear" onclick="clearTimer(this)">clear</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function toggleExtras(btn) {
  const extras = btn.closest('.editor-step-card').querySelector('.editor-step-extras');
  const isHidden = extras.classList.toggle('hidden');
  btn.textContent = isHidden ? '＋' : '✏️';
  btn.classList.toggle('has-extras', !isHidden);
}

function clearTimer(btn) {
  const row = btn.closest('.editor-timer-row');
  row.querySelectorAll('.editor-timer-input').forEach(i => i.value = '');
  scheduleAutoSave();
}

// ── Modifiers ──
function renderModifierList(container, modifiers) {
  const entries = Object.entries(modifiers);
  if (entries.length === 0) {
    container.innerHTML = '<div class="editor-empty">No modifiers yet — tap ＋ Add Modifier below.</div>';
    return;
  }
  entries.forEach(([day, mod]) => {
    const timerMin = Math.floor((mod.timer||0)/60);
    const timerSec = (mod.timer||0) % 60;
    const card = document.createElement('div');
    card.className = 'editor-modifier-card';
    card.innerHTML = `
      <div class="editor-modifier-row">
        <select class="editor-day-select" onchange="scheduleAutoSave()">
          ${DAYS.map(d=>`<option${d===day?' selected':''}>${d}</option>`).join('')}
        </select>
        <button class="editor-delete-btn" onclick="this.closest('.editor-modifier-card').remove(); saveEditorState();" title="Remove">✕</button>
      </div>
      <div class="editor-step-main" style="padding:0 0 8px 0">
        <input class="editor-name-input" type="text" value="${escHtml(mod.name||'')}" placeholder="e.g. 🔴 Red Light Therapy" oninput="scheduleAutoSave()" style="flex:1"/>
      </div>
      <div class="editor-timer-row">
        <span class="editor-timer-label">⏱ Timer</span>
        <input class="editor-timer-input" type="number" min="0" max="120" value="${timerMin||''}" placeholder="0" oninput="scheduleAutoSave()"/>
        <span class="editor-timer-sep">min</span>
        <input class="editor-timer-input" type="number" min="0" max="59" value="${timerSec||''}" placeholder="0" oninput="scheduleAutoSave()"/>
        <span class="editor-timer-sep">sec</span>
        <button class="editor-timer-clear" onclick="clearTimer(this)">clear</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// ── Add step / modifier ──
function addEditorItem() {
  saveEditorState();
  if (!protocolData[editorPhase]) protocolData[editorPhase] = {};

  if (editorRoutine === 'Modifiers') {
    if (!protocolData[editorPhase].Modifiers) protocolData[editorPhase].Modifiers = {};
    // Find first day not already used
    const usedDays = Object.keys(protocolData[editorPhase].Modifiers);
    const newDay = DAYS.find(d => !usedDays.includes(d)) || 'Monday';
    protocolData[editorPhase].Modifiers[newDay] = { name: '' };
  } else {
    if (!protocolData[editorPhase][editorRoutine]) protocolData[editorPhase][editorRoutine] = [];
    protocolData[editorPhase][editorRoutine].push({ name: '' });
  }

  persistProtocol();
  renderStepList();
  // Focus the last name input
  setTimeout(() => {
    const inputs = document.querySelectorAll('#step-editor-list .editor-name-input');
    if (inputs.length) inputs[inputs.length-1].focus();
  }, 50);
}

// ── Delete step ──
function deleteEditorStep(index) {
  if (!confirm('Remove this step?')) return;
  const steps = protocolData[editorPhase]?.[editorRoutine] || [];
  steps.splice(index, 1);
  protocolData[editorPhase][editorRoutine] = steps;
  persistProtocol();
  renderStepList();
  showSavedIndicator();
}

// ── Auto-save ──
let autoSaveTimer = null;
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveEditorState, 600);
}

function saveEditorState() {
  if (editorRoutine === 'Modifiers') {
    saveModifierState();
  } else {
    saveStepState();
  }
  persistProtocol();
  showSavedIndicator();
}

function saveStepState() {
  const cards = document.querySelectorAll('#step-editor-list .editor-step-card');
  const steps = [];
  cards.forEach(card => {
    const name = card.querySelector('.editor-name-input')?.value.trim();
    if (!name) return;
    const desc       = card.querySelector('.editor-desc-input')?.value.trim() || '';
    const timerInputs = card.querySelectorAll('.editor-timer-input');
    const timerMin   = parseInt(timerInputs[0]?.value) || 0;
    const timerSec   = parseInt(timerInputs[1]?.value) || 0;
    const totalTimer = timerMin * 60 + timerSec;
    const obj = { name };
    if (desc) obj.desc = desc;
    if (totalTimer > 0) obj.timer = totalTimer;
    steps.push(obj);
  });
  if (!protocolData[editorPhase]) protocolData[editorPhase] = {};
  protocolData[editorPhase][editorRoutine] = steps;
}

function saveModifierState() {
  const cards = document.querySelectorAll('#step-editor-list .editor-modifier-card');
  const modifiers = {};
  cards.forEach(card => {
    const day  = card.querySelector('.editor-day-select')?.value;
    const name = card.querySelector('.editor-name-input')?.value.trim();
    if (!day || !name) return;
    const timerInputs = card.querySelectorAll('.editor-timer-input');
    const timerMin    = parseInt(timerInputs[0]?.value) || 0;
    const timerSec    = parseInt(timerInputs[1]?.value) || 0;
    const totalTimer  = timerMin * 60 + timerSec;
    modifiers[day] = { name };
    if (totalTimer > 0) modifiers[day].timer = totalTimer;
  });
  if (!protocolData[editorPhase]) protocolData[editorPhase] = {};
  protocolData[editorPhase].Modifiers = modifiers;
}

function persistProtocol() {
  localStorage.setItem('customProtocol', JSON.stringify(protocolData));
  // Keep JSON export in sync
  const ta = document.getElementById('set-protocol-json');
  if (ta) ta.value = JSON.stringify(protocolData, null, 2);
}

// ── Saved indicator ──
function showSavedIndicator() {
  const existing = document.getElementById('save-indicator');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'save-indicator';
  el.textContent = '✓ Saved';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// ══════════════════════════════════════════
//  PHASE SETTINGS
// ══════════════════════════════════════════
function savePhaseSettings() {
  settings.startDate = document.getElementById('set-start-date').value;
  settings.phaseDays = parseInt(document.getElementById('set-phase-days').value, 10) || 14;
  localStorage.setItem('startDate', settings.startDate);
  localStorage.setItem('phaseDays', settings.phaseDays);
  showSavedIndicator();
}

// ══════════════════════════════════════════
//  JSON IMPORT
// ══════════════════════════════════════════
function importFromJSON() {
  try {
    const parsed = JSON.parse(document.getElementById('set-protocol-json').value);
    protocolData = parsed;
    editorPhase  = String(Object.keys(protocolData).sort((a,b)=>Number(a)-Number(b))[0] || '1');
    persistProtocol();
    renderProtocolEditor();
    showSavedIndicator();
  } catch(e) {
    alert('Invalid JSON. Please check the formatting and try again.');
  }
}

// ══════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════
function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Init
renderRoutine();
