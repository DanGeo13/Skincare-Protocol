// app.js
let protocolData = JSON.parse(localStorage.getItem('customProtocol')) || DEFAULT_PROTOCOL;
let historyLog = JSON.parse(localStorage.getItem('skincareHistory')) || {};
let settings = {
  startDate: localStorage.getItem('startDate') || new Date().toISOString().split('T')[0],
  phaseDays: parseInt(localStorage.getItem('phaseDays')) || 14
};
let timerInterval = null;
const timerSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

document.getElementById('set-start-date').value = settings.startDate;
document.getElementById('set-phase-days').value = settings.phaseDays;
document.getElementById('set-protocol-json').value = JSON.stringify(protocolData, null, 2);

function switchTab(tab) {
  ['routine', 'history', 'settings'].forEach(t => {
    document.getElementById(`view-${t}`).classList.add('hidden');
    document.getElementById(`nav-${t}`).classList.remove('active');
  });
  document.getElementById(`view-${tab}`).classList.remove('hidden');
  document.getElementById(`nav-${tab}`).classList.add('active');
  if (tab === 'routine') renderRoutine();
  if (tab === 'history') renderHistory();
}

function calculatePhase() {
  const start = new Date(settings.startDate);
  const now = new Date();
  const diffDays = Math.ceil(Math.abs(now - start) / (1000 * 60 * 60 * 24));
  let phaseNum = Math.floor(diffDays / settings.phaseDays) + 1;
  const maxPhase = Math.max(...Object.keys(protocolData).map(Number));
  return phaseNum > maxPhase ? maxPhase : phaseNum;
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function toggleStep(index, totalSteps, isPM) {
  if ('vibrate' in navigator) navigator.vibrate(50);
  const today = getTodayKey();
  const timeOfDay = isPM ? 'PM' : 'AM';
  if (!historyLog[today]) {
    historyLog[today] = { AM: { done: 0, total: 0 }, PM: { done: 0, total: 0 }, steps: { AM: [], PM: [] } };
  }
  const stepArray = historyLog[today].steps[timeOfDay];
  if (stepArray.includes(index)) {
    stepArray.splice(stepArray.indexOf(index), 1);
  } else {
    stepArray.push(index);
  }
  historyLog[today][timeOfDay].done = stepArray.length;
  historyLog[today][timeOfDay].total = totalSteps;
  localStorage.setItem('skincareHistory', JSON.stringify(historyLog));
  renderRoutine();
}

function resetToday() {
  const today = getTodayKey();
  if (historyLog[today]) {
    historyLog[today].AM.done = 0;
    historyLog[today].PM.done = 0;
    historyLog[today].steps = { AM: [], PM: [] };
    localStorage.setItem('skincareHistory', JSON.stringify(historyLog));
  }
  renderRoutine();
}

function renderRoutine() {
  const now = new Date();
  const isPM = now.getHours() >= 12;
  const dayOfWeek = now.toLocaleDateString('en-AU', { weekday: 'long' });

  document.body.className = isPM ? 'theme-pm' : 'theme-am';
  document.getElementById('greeting-text').innerText = isPM ? 'Good Evening, Dan 🌙' : 'Good Morning, Dan ☀️';

  const phaseNum = calculatePhase();
  const phaseData = protocolData[phaseNum] || protocolData[1];
  document.getElementById('phase-badge').innerText = phaseData.name || `Phase ${phaseNum}`;
  document.getElementById('time-context').innerText = `${dayOfWeek} · ${isPM ? 'PM Routine' : 'AM Routine'}`;

  let routineSteps = [];
  if (!isPM) {
    routineSteps = phaseData.AM || [];
  } else {
    const isRetrieveNight = ['Monday', 'Wednesday', 'Friday'].includes(dayOfWeek);
    if (phaseNum <= 2) {
      routineSteps = isRetrieveNight ? (phaseData.PM_A || []) : (phaseData.PM_B || []);
    } else {
      if (isRetrieveNight) routineSteps = phaseData.PM_A || [];
      else if (['Tuesday', 'Thursday'].includes(dayOfWeek)) routineSteps = phaseData.PM_B_TueThu || phaseData.PM_B || [];
      else if (dayOfWeek === 'Saturday') routineSteps = phaseData.PM_B_Sat || phaseData.PM_B || [];
      else if (dayOfWeek === 'Sunday') routineSteps = phaseData.PM_B_Sun || phaseData.PM_B || [];
    }
  }
  if (isPM && phaseData.Modifiers && phaseData.Modifiers[dayOfWeek]) {
    routineSteps = [...routineSteps, phaseData.Modifiers[dayOfWeek]];
  }

  const today = getTodayKey();
  const timeOfDay = isPM ? 'PM' : 'AM';
  const completedSteps = historyLog[today]?.steps?.[timeOfDay] || [];
  const totalSteps = routineSteps.length;
  const percent = totalSteps === 0 ? 0 : Math.round((completedSteps.length / totalSteps) * 100);

  const circle = document.getElementById('progress-circle');
  const radius = circle.r.baseVal.value;
  const circumference = radius * 2 * Math.PI;
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  circle.style.strokeDashoffset = circumference - (percent / 100) * circumference;
  document.getElementById('progress-text').innerText = `${percent}%`;

  const ringEl = circle.closest('svg');
  ringEl.classList.toggle('ring-complete', percent === 100 && totalSteps > 0);

  const container = document.getElementById('routine-container');
  const successMsg = document.getElementById('success-message');

  if (percent === 100 && totalSteps > 0) {
    container.classList.add('hidden');
    successMsg.classList.remove('hidden');
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
    return;
  }

  container.classList.remove('hidden');
  successMsg.classList.add('hidden');
  container.innerHTML = '';

  routineSteps.forEach((step, index) => {
    const isObj = typeof step === 'object';
    const name = isObj ? step.name : step;
    const isDone = completedSteps.includes(index);
    const desc = isObj && step.desc ? step.desc : null;
    const hasTimer = isObj && step.timer;

    const card = document.createElement('div');
    card.className = `step-card${isDone ? ' done' : ''}`;
    card.onclick = () => {
      card.classList.add('animating');
      setTimeout(() => card.classList.remove('animating'), 180);
      toggleStep(index, totalSteps, isPM);
    };
    card.innerHTML = `
      <div class="step-check">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="step-body">
        <div class="step-name">${name}</div>
        ${desc ? `<div class="step-desc">${desc}</div>` : ''}
      </div>
      ${hasTimer ? `<button class="timer-btn" onclick="startTimer(event, ${step.timer})">⏱ ${formatTime(step.timer)}</button>` : ''}
    `;
    container.appendChild(card);
  });
}

function formatTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function startTimer(e, seconds) {
  e.stopPropagation();
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  let remaining = seconds;
  const display = document.getElementById('timer-display');
  display.classList.remove('hidden');
  display.innerText = `⏱ ${formatTime(remaining)}`;
  timerInterval = setInterval(() => {
    remaining--;
    display.innerText = `⏱ ${formatTime(remaining)}`;
    if (remaining <= 0) {
      clearInterval(timerInterval); timerInterval = null;
      display.innerText = '✅ Timer done!';
      timerSound.play().catch(() => {});
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 400]);
      setTimeout(() => display.classList.add('hidden'), 4000);
    }
  }, 1000);
}

function renderHistory() {
  const container = document.getElementById('history-container');
  container.innerHTML = '';
  const sortedDays = Object.keys(historyLog).sort((a, b) => b.localeCompare(a));
  if (!sortedDays.length) {
    container.innerHTML = '<div class="history-card"><div style="color:var(--text-secondary);font-size:0.9rem">No history yet. Complete a routine to see it here.</div></div>';
    return;
  }
  sortedDays.forEach(day => {
    const d = historyLog[day];
    const amPct = d.AM.total ? Math.round((d.AM.done / d.AM.total) * 100) : 0;
    const pmPct = d.PM.total ? Math.round((d.PM.done / d.PM.total) * 100) : 0;
    const card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `
      <div class="history-date">${new Date(day + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      ${d.AM.total ? `<div class="history-row"><span>☀️ AM — ${d.AM.done}/${d.AM.total} steps</span><span>${amPct}%</span></div><div class="history-bar-wrap"><div class="history-bar" style="width:${amPct}%"></div></div>` : ''}
      ${d.PM.total ? `<div class="history-row" style="margin-top:8px"><span>🌙 PM — ${d.PM.done}/${d.PM.total} steps</span><span>${pmPct}%</span></div><div class="history-bar-wrap"><div class="history-bar" style="width:${pmPct}%"></div></div>` : ''}
    `;
    container.appendChild(card);
  });
}

function saveSettings() {
  try {
    const newProtocol = JSON.parse(document.getElementById('set-protocol-json').value);
    protocolData = newProtocol;
    localStorage.setItem('customProtocol', JSON.stringify(protocolData));
  } catch(e) {
    alert('Invalid JSON in protocol field. Please check your formatting.');
    return;
  }
  settings.startDate = document.getElementById('set-start-date').value;
  settings.phaseDays = parseInt(document.getElementById('set-phase-days').value);
  localStorage.setItem('startDate', settings.startDate);
  localStorage.setItem('phaseDays', settings.phaseDays);
  if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);
  switchTab('routine');
}

renderRoutine();
