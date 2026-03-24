// app.js

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DEFAULT_FOCUS_PLANNER = [
  {
    id: 'focus-exercise-default',
    category: 'exercise',
    name: 'Exercise block',
    desc: 'Walk, gym, or mobility work to keep the day moving.',
    time: '07:00',
    duration: 45,
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    flexible: true
  },
  {
    id: 'focus-mindfulness-default',
    category: 'mindfulness',
    name: 'Mindfulness reset',
    desc: 'Breathing, journaling, or a short meditation block.',
    time: '21:00',
    duration: 15,
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Sunday'],
    flexible: true
  },
  {
    id: 'focus-reminder-default',
    category: 'engagement',
    name: 'Important repeating engagement',
    desc: 'Use for calls, admin, family commitments, or recurring appointments.',
    time: '18:30',
    duration: 30,
    days: ['Tuesday', 'Thursday'],
    flexible: false
  },
  {
    id: 'horizontal-movements',
    category: 'exercise',
    name: 'Horizontal Movements',
    desc: 'Horizontal Pushing (Planche variations) & Horizontal Pulling (Front Lever Row variations).',
    time: '20:30',
    duration: 45,
    days: ['Sunday'],
    flexible: true
  },
  {
    id: 'lower-body-movements',
    category: 'exercise',
    name: 'Lower Body Movements',
    desc: 'Knee/Hip Extension (Single Leg Squats) & Knee Flexion (Nordic Curls).',
    time: '20:30',
    duration: 45,
    days: ['Tuesday'],
    flexible: true
  },
  {
    id: 'recovery-flexibility',
    category: 'exercise',
    name: 'Recovery or Flexibility',
    desc: '5-minute flexibility routine: Pike, Pancake, Front Split, Side Split, and Pigeon.',
    time: '18:00',
    duration: 45,
    days: ['Wednesday'],
    flexible: true
  },
  {
    id: 'vertical-movements',
    category: 'exercise',
    name: 'Vertical Movements',
    desc: 'Vertical Pushing (Handstand Push-up variations) & Vertical Pulling (One-Arm Chin-up variations).',
    time: '18:00',
    duration: 45,
    days: ['Thursday', 'Friday'],
    flexible: true
  }
];

let protocolData = readJsonStorage('customProtocol', DEFAULT_PROTOCOL);
let historyLog   = readJsonStorage('skincareHistory', {});
let settings = {
  startDate: localStorage.getItem('startDate') || new Date().toISOString().split('T')[0],
  phaseDays: parseInt(localStorage.getItem('phaseDays'), 10) || 14
};
let focusPlanner = mergeSeedFocusPlanner(
  readJsonStorage('focusPlanner', DEFAULT_FOCUS_PLANNER),
  DEFAULT_FOCUS_PLANNER
).map(normalizeFocusItem);

let timerInterval = null;
let nextTaskInterval = null;
const timerSound  = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
let selectedRoutineOffset = 0;

// Editor state
let editorPhase   = String(Object.keys(protocolData).sort((a,b)=>Number(a)-Number(b))[0] || '1');
let editorRoutine = 'AM';
let focusSaveTimer = null;
let editorFocusArea = 'skincare';

// Init settings inputs
document.getElementById('set-start-date').value  = settings.startDate;
document.getElementById('set-phase-days').value   = settings.phaseDays;

// ══════════════════════════════════════════
//  TAB NAVIGATION
// ══════════════════════════════════════════
function switchTab(tab) {
  const settingsView = document.getElementById('view-settings');
  if (settingsView && !settingsView.classList.contains('hidden')) {
    clearTimeout(autoSaveTimer);
    clearTimeout(phaseNameTimeout);
    clearTimeout(focusSaveTimer);
    saveEditorState();
    flushPhaseName();
    saveFocusState();
  }

  ['routine','history','settings'].forEach(t => {
    document.getElementById(`view-${t}`).classList.add('hidden');
    document.getElementById(`nav-${t}`).classList.remove('active');
  });
  document.getElementById(`view-${tab}`).classList.remove('hidden');
  document.getElementById(`nav-${tab}`).classList.add('active');
  if (tab === 'routine')  renderRoutine();
  if (tab === 'history')  renderHistory();
  if (tab === 'settings') {
    syncEditorToCurrentRoutine(false);
    renderProtocolEditor();
  }
}

function selectEditorFocus(area) {
  if (editorFocusArea === area) return;
  if (editorFocusArea === 'skincare') {
    clearTimeout(autoSaveTimer);
    clearTimeout(phaseNameTimeout);
    flushPhaseName();
    persistProtocol();
  } else {
    clearTimeout(focusSaveTimer);
    saveFocusState();
  }

  editorFocusArea = area;
  renderProtocolEditor();
}

function applyTheme(isPM) {
  document.body.classList.toggle('theme-pm', isPM);
  document.body.classList.toggle('theme-am', !isPM);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', isPM ? '#17324b' : '#ece7de');
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

function getDateForOffset(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function getRelativeDayLabel(offsetDays = 0) {
  if (offsetDays === 0) return 'Today';
  if (offsetDays === 1) return 'Tomorrow';
  return getDateForOffset(offsetDays).toLocaleDateString('en-AU', { weekday: 'long' });
}

function formatDateHeading(date) {
  return date.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function getCurrentRoutineContext(offsetDays = selectedRoutineOffset) {
  const now = getDateForOffset(offsetDays);
  const isPM = offsetDays === 0 ? new Date().getHours() >= 12 : false;
  const dayOfWeek = now.toLocaleDateString('en-AU', { weekday: 'long' });
  const phaseNum = calculatePhase(now);
  const phaseKey = String(phaseNum);
  const phaseData = protocolData[phaseKey] || protocolData[phaseNum] || protocolData[Object.keys(protocolData)[0]];
  let routineKey = 'AM';

  if (isPM) {
    const isRetrieveNight = ['Monday', 'Wednesday', 'Friday'].includes(dayOfWeek);
    if (phaseNum <= 2 || isRetrieveNight) routineKey = 'PM_A';
    else if (['Tuesday', 'Thursday'].includes(dayOfWeek)) routineKey = 'PM_B_TueThu';
    else if (dayOfWeek === 'Saturday') routineKey = 'PM_B_Sat';
    else if (dayOfWeek === 'Sunday') routineKey = 'PM_B_Sun';
    else routineKey = 'PM_B';
  }

  return { now, isPM, dayOfWeek, phaseNum, phaseKey, phaseData, routineKey };
}

function updateRoutineHeader(isPM, dayOfWeek, total, doneCount, percent) {
  const remaining = Math.max(total - doneCount, 0);

  document.getElementById('greeting-text').innerText = isPM ? 'Good Evening, Dan 🌙' : 'Good Morning, Dan ☀️';
  document.getElementById('summary-remaining').innerText = String(remaining);
  document.getElementById('summary-remaining-note').innerText = remaining === 1 ? 'step to go' : 'steps to go';
  document.getElementById('summary-completion').innerText = `${doneCount} / ${total}`;
  document.getElementById('summary-completion-note').innerText = percent === 100 ? 'fully complete' : `${percent}% of this session`;
}

function normalizeFocusItem(item = {}) {
  return {
    id: item.id || `focus-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    category: item.category || 'exercise',
    name: item.name || '',
    desc: item.desc || '',
    time: item.time || '07:00',
    duration: Number(item.duration) || 30,
    days: Array.isArray(item.days) && item.days.length ? item.days : DAY_NAMES.slice(0, 5),
    flexible: item.flexible !== false
  };
}

function mergeSeedFocusPlanner(existingItems = [], seedItems = []) {
  const merged = Array.isArray(existingItems) ? existingItems.slice() : [];
  const existingIds = new Set(merged.map(item => item?.id).filter(Boolean));
  seedItems.forEach(item => {
    if (!existingIds.has(item.id)) merged.push(item);
  });
  return merged;
}

function persistFocusPlanner() {
  localStorage.setItem('focusPlanner', JSON.stringify(focusPlanner));
}

function toMinutes(timeStr) {
  const [hours, minutes] = String(timeStr || '00:00').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function toTimeString(totalMinutes) {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60) % 24;
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatClock(timeStr) {
  const [hoursRaw, minutesRaw] = String(timeStr || '00:00').split(':');
  const hours = Number(hoursRaw) || 0;
  const minutes = Number(minutesRaw) || 0;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = ((hours + 11) % 12) + 1;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatNextTaskDisplay(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = totalMinutes / 60;

  if (hours >= 3) {
    return {
      number: String(Math.floor(hours)),
      unit: ''
    };
  }

  if (totalMinutes >= 60) {
    return {
      number: String(Math.floor(hours)),
      unit: `${totalMinutes % 60}m`
    };
  }

  return {
    number: String(totalMinutes),
    unit: 'minutes'
  };
}

function generateTodayFocusBlocks(dayOfWeek) {
  const todaysItems = focusPlanner
    .filter(item => item.days.includes(dayOfWeek) && item.name.trim())
    .map(item => normalizeFocusItem(item))
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

  let cursor = 0;
  return todaysItems.map(item => {
    const preferredStart = toMinutes(item.time);
    const start = item.flexible ? Math.max(preferredStart, cursor) : preferredStart;
    const end = start + Math.max(5, Number(item.duration) || 0);
    cursor = Math.max(cursor, end);
    return {
      ...item,
      scheduledStart: toTimeString(start),
      scheduledEnd: toTimeString(end),
      pushed: item.flexible && start !== preferredStart
    };
  });
}

function toggleFocusBlock(id) {
  const today = getTodayKey();
  if (!historyLog[today]) historyLog[today] = { AM:{done:0,total:0}, PM:{done:0,total:0}, steps:{AM:[],PM:[]}, focusDone:[] };
  if (!Array.isArray(historyLog[today].focusDone)) historyLog[today].focusDone = [];
  const done = historyLog[today].focusDone;
  if (done.includes(id)) done.splice(done.indexOf(id), 1);
  else done.push(id);
  localStorage.setItem('skincareHistory', JSON.stringify(historyLog));
  if ('vibrate' in navigator) navigator.vibrate(40);
  renderRoutine();
}

function renderFocusTimeline(dayOfWeek) {
  const container = document.getElementById('focus-timeline');
  const blocks = generateTodayFocusBlocks(dayOfWeek);
  const today = getTodayKey();
  const done = historyLog[today]?.focusDone || [];

  if (!blocks.length) {
    container.innerHTML = '<div class="focus-empty">No focus blocks scheduled for today yet. Add exercise, mindfulness, or recurring commitments in Settings.</div>';
    return;
  }

  container.className = 'focus-timeline';
  container.innerHTML = blocks.map(block => `
    <div class="focus-card${done.includes(block.id) ? ' done' : ''}">
      <div>
        <div class="focus-time">${formatClock(block.scheduledStart)}</div>
        <span class="focus-duration">${block.duration} min</span>
      </div>
      <div>
        <div class="focus-name">${escHtml(block.name)}</div>
        ${block.desc ? `<div class="focus-desc">${escHtml(block.desc)}</div>` : ''}
        <div class="focus-tags">
          <span class="focus-tag">${escHtml(block.category)}</span>
          <span class="focus-tag">${formatClock(block.scheduledStart)} - ${formatClock(block.scheduledEnd)}</span>
          ${block.pushed ? '<span class="focus-tag">smart-pushed</span>' : ''}
        </div>
      </div>
      <button class="focus-toggle" onclick="toggleFocusBlock('${block.id}')" title="Mark focus block complete">${done.includes(block.id) ? '✓' : '○'}</button>
    </div>
  `).join('');
}

function getSkincareAnchorMinutes(isPM) {
  return isPM ? 20 * 60 + 30 : 6 * 60 + 30;
}

function getSkincareAgendaItems(phaseNum, phaseData, dayOfWeek, historyDay) {
  const morningSteps = getRoutineSteps(phaseNum, phaseData, false, dayOfWeek);
  const eveningSteps = getRoutineSteps(phaseNum, phaseData, true, dayOfWeek);
  const amDone = historyDay?.steps?.AM || [];
  const pmDone = historyDay?.steps?.PM || [];

  function mapSteps(steps, isPM, completed) {
    let cursor = getSkincareAnchorMinutes(isPM);
    return steps.map((step, index) => {
      const isObj = typeof step === 'object';
      const timer = isObj && step.timer ? step.timer : 0;
      const duration = Math.max(4, timer ? Math.ceil(timer / 60) : 6);
      const item = {
        id: `skincare-${isPM ? 'PM' : 'AM'}-${index}`,
        kind: 'skincare',
        category: 'skin care',
        routineKey: isPM ? 'PM' : 'AM',
        isPM,
        index,
        totalSteps: steps.length,
        name: isObj ? step.name : step,
        desc: isObj ? (step.desc || '') : '',
        timer,
        duration,
        scheduledStart: toTimeString(cursor),
        scheduledEnd: toTimeString(cursor + duration),
        done: completed.includes(index)
      };
      cursor += duration;
      return item;
    });
  }

  return [
    ...mapSteps(morningSteps, false, amDone),
    ...mapSteps(eveningSteps, true, pmDone)
  ];
}

function getFocusAgendaItems(dayOfWeek, historyDay) {
  const done = historyDay?.focusDone || [];
  return generateTodayFocusBlocks(dayOfWeek).map(block => ({
    id: block.id,
    kind: 'focus',
    category: block.category,
    name: block.name,
    desc: block.desc || '',
    duration: block.duration,
    timer: 0,
    scheduledStart: block.scheduledStart,
    scheduledEnd: block.scheduledEnd,
    pushed: block.pushed,
    done: done.includes(block.id)
  }));
}

function buildAgendaForOffset(phaseNum, phaseData, dayOfWeek, offsetDays = 0) {
  const dateKey = getDateKey(offsetDays);
  const historyDay = historyLog[dateKey] || {};
  return [
    ...getSkincareAgendaItems(phaseNum, phaseData, dayOfWeek, historyDay),
    ...getFocusAgendaItems(dayOfWeek, historyDay)
  ].sort((a, b) => toMinutes(a.scheduledStart) - toMinutes(b.scheduledStart));
}

function startNextTaskCountdown(agenda, offsetDays = 0) {
  const countdownEl = document.getElementById('next-task-countdown');
  const countdownNumberEl = countdownEl?.querySelector('.next-task-number');
  const countdownUnitEl = countdownEl?.querySelector('.next-task-unit');
  const noteEl = document.getElementById('next-task-note');
  const panelTimeEl = document.getElementById('next-panel-time');
  if (nextTaskInterval) clearInterval(nextTaskInterval);

  function renderCountdown() {
    if (offsetDays !== 0) {
      if (countdownNumberEl) countdownNumberEl.innerText = '--';
      if (countdownUnitEl) countdownUnitEl.innerText = '';
      noteEl.innerText = `Viewing ${getRelativeDayLabel(offsetDays).toLowerCase()}`;
      if (panelTimeEl) panelTimeEl.innerText = agenda[0]
        ? formatClock(agenda[0].scheduledStart).replace(' AM', '').replace(' PM', '')
        : '--';
      return;
    }

    const now = new Date();
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
    const nextItem = agenda.find(item => !item.done && toMinutes(item.scheduledStart) >= nowMinutes);

    if (!nextItem) {
      if (countdownNumberEl) countdownNumberEl.innerText = '--';
      if (countdownUnitEl) countdownUnitEl.innerText = '';
      noteEl.innerText = 'Nothing else scheduled today';
      if (panelTimeEl) panelTimeEl.innerText = 'Done';
      return;
    }

    const target = new Date();
    const startMinutes = toMinutes(nextItem.scheduledStart);
    target.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    const countdownMs = target - now;
    const countdown = formatNextTaskDisplay(countdownMs);
    if (countdownNumberEl) countdownNumberEl.innerText = countdown.number;
    if (countdownUnitEl) countdownUnitEl.innerText = countdown.unit;
    noteEl.innerText = `${formatClock(nextItem.scheduledStart)} · ${nextItem.name}`;
    if (panelTimeEl) panelTimeEl.innerText = formatCountdown(countdownMs);
  }

  renderCountdown();
  nextTaskInterval = setInterval(renderCountdown, 1000);
}

function getDateKey(offsetDays = 0) {
  const date = getDateForOffset(offsetDays);
  return date.toISOString().split('T')[0];
}

function getWeekdayForOffset(offsetDays = 0) {
  const date = getDateForOffset(offsetDays);
  return date.toLocaleDateString('en-AU', { weekday: 'long' });
}

function buildUpcomingPreview(daysAhead = 3) {
  const previews = [];
  for (let offset = 0; offset <= daysAhead; offset++) {
    const dayOfWeek = getWeekdayForOffset(offset);
    const phaseNum = calculatePhase(getDateForOffset(offset));
    const phaseData = protocolData[String(phaseNum)] || protocolData[phaseNum] || protocolData[Object.keys(protocolData)[0]];
    const focusBlocks = generateTodayFocusBlocks(dayOfWeek);
    const morningSteps = getRoutineSteps(phaseNum, phaseData, false, dayOfWeek);
    const eveningSteps = getRoutineSteps(phaseNum, phaseData, true, dayOfWeek);
    const firstFocus = focusBlocks[0];
    const firstMorning = morningSteps[0];
    const firstEvening = eveningSteps[0];

    previews.push({
      offset,
      label: getRelativeDayLabel(offset),
      dateLabel: formatDateHeading(getDateForOffset(offset)),
      title: firstFocus?.name || firstMorning?.name || firstEvening?.name || 'No events yet',
      meta: firstFocus
        ? `${formatClock(firstFocus.scheduledStart)} · ${firstFocus.category}`
        : firstMorning
          ? 'Morning ritual scheduled'
          : firstEvening
            ? 'Evening ritual scheduled'
            : 'Nothing planned yet',
      count: focusBlocks.length + morningSteps.length + eveningSteps.length
    });
  }
  return previews;
}

function renderUpcomingPreview() {
  const container = document.getElementById('upcoming-list');
  if (!container) return;
  const previews = buildUpcomingPreview(4);
  container.innerHTML = previews.map(item => `
    <button class="upcoming-card${item.offset === selectedRoutineOffset ? ' active' : ''}" type="button" onclick="setRoutineDayOffset(${item.offset})">
      <div class="upcoming-day">${escHtml(item.label)}</div>
      <div class="upcoming-date">${escHtml(item.dateLabel)}</div>
      <div class="upcoming-title">${escHtml(item.title)}</div>
      <div class="upcoming-meta">${escHtml(item.meta)}${item.count ? ` · ${item.count} items` : ''}</div>
    </button>
  `).join('');
}

function getAgendaPresentation(agenda, isPM) {
  const now = new Date();
  const nowMinutes = (now.getHours() * 60) + now.getMinutes();
  const nextItem = agenda.find(item => !item.done && toMinutes(item.scheduledStart) >= nowMinutes) || agenda.find(item => !item.done) || null;
  const liveItem = agenda.find(item => {
    const start = toMinutes(item.scheduledStart);
    const end = toMinutes(item.scheduledEnd);
    return !item.done && start <= nowMinutes && nowMinutes < end;
  }) || nextItem || agenda[0] || null;

  return { nextItem, liveItem, nowMinutes, isPM };
}

function renderHeroPanels(agenda, dayLabel, offsetDays = 0) {
  const { nextItem } = getAgendaPresentation(agenda, false);
  const nextTitle = document.getElementById('next-panel-title');
  const nextSubtitle = document.getElementById('next-panel-subtitle');
  const nextTime = document.getElementById('next-panel-time');
  const agendaSubtitle = document.getElementById('agenda-subtitle');

  if (nextItem) {
    nextTitle.innerText = nextItem.name;
    nextSubtitle.innerText = nextItem.kind === 'skincare'
      ? `${nextItem.isPM ? 'Evening' : 'Morning'} routine · ${formatClock(nextItem.scheduledStart)}`
      : `${nextItem.category} · ${formatClock(nextItem.scheduledStart)}`;
    nextTime.innerText = formatClock(nextItem.scheduledStart).replace(' AM', '').replace(' PM', '');
  } else {
    nextTitle.innerText = offsetDays === 0 ? 'Nothing else scheduled' : 'No events scheduled';
    nextSubtitle.innerText = offsetDays === 0 ? 'You are clear for the rest of today' : `Nothing planned for ${dayLabel.toLowerCase()}`;
    nextTime.innerText = '--';
  }

  agendaSubtitle.innerText = offsetDays === 0
    ? 'Everything remaining today, arranged by time.'
    : `Everything planned for ${dayLabel.toLowerCase()}.`;
}

function renderAgenda(agenda, offsetDays = 0) {
  const container = document.getElementById('routine-container');
  container.innerHTML = '';
  document.getElementById('agenda-count').innerText = `${agenda.length} item${agenda.length === 1 ? '' : 's'}`;

  if (!agenda.length) {
    container.innerHTML = `<div class="focus-empty">No tasks are scheduled for ${offsetDays === 0 ? 'today' : getRelativeDayLabel(offsetDays).toLowerCase()} yet.</div>`;
    startNextTaskCountdown([], offsetDays);
    return;
  }

  const now = new Date();
  const nowMinutes = (now.getHours() * 60) + now.getMinutes();
  const nextId = offsetDays === 0 ? agenda.find(item => !item.done && toMinutes(item.scheduledStart) >= nowMinutes)?.id : agenda.find(item => !item.done)?.id;

  agenda.forEach(item => {
    const card = document.createElement('div');
    card.className = `agenda-card${item.done ? ' done' : ''}${item.id === nextId ? ' is-next' : ''}`;
    const action = document.createElement('button');
    action.className = 'agenda-action';
    action.title = offsetDays === 0 ? 'Mark complete' : 'Future items cannot be completed yet';
    action.textContent = item.done ? '✓' : (offsetDays === 0 ? '○' : '·');
    action.disabled = offsetDays !== 0;
    if (offsetDays === 0) {
      action.addEventListener('click', (event) => {
        event.stopPropagation();
        if (item.kind === 'skincare') toggleStep(item.index, item.totalSteps, item.isPM);
        else toggleFocusBlock(item.id);
      });
    }

    const timerTag = item.timer
      ? `<button class="agenda-tag" onclick="startTimer(event,${item.timer})">⏱ ${fmtTime(item.timer)}</button>`
      : '';

    card.innerHTML = `
      <div>
        <div class="agenda-time">${formatClock(item.scheduledStart)}</div>
        <span class="agenda-time-note">${item.duration} min block</span>
      </div>
      <div>
        <div class="agenda-name">${escHtml(item.name)}</div>
        ${item.desc ? `<div class="agenda-desc">${escHtml(item.desc)}</div>` : ''}
        <div class="agenda-tags">
          <span class="agenda-tag">${escHtml(item.category)}</span>
          <span class="agenda-tag">${formatClock(item.scheduledStart)} - ${formatClock(item.scheduledEnd)}</span>
          ${item.kind === 'skincare' ? `<span class="agenda-tag">${item.isPM ? 'PM routine' : 'AM routine'}</span>` : ''}
          ${item.pushed ? '<span class="agenda-tag">smart-pushed</span>' : ''}
          ${timerTag}
        </div>
      </div>
    `;
    card.appendChild(action);
    container.appendChild(card);
  });

  startNextTaskCountdown(agenda, offsetDays);
}

// ══════════════════════════════════════════
//  ROUTINE
// ══════════════════════════════════════════
function calculatePhase(forDate = new Date()) {
  const start = new Date(`${settings.startDate}T00:00:00`);
  const today = new Date(forDate);
  today.setHours(0, 0, 0, 0);
  const diffMs = Math.max(0, today - start);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let phaseNum = Math.floor(diffDays / settings.phaseDays) + 1;
  const maxPhase = Math.max(...Object.keys(protocolData).map(Number));
  return phaseNum > maxPhase ? maxPhase : phaseNum;
}

function getTodayKey() { return new Date().toISOString().split('T')[0]; }

function setRoutineDayOffset(offsetDays = 0) {
  selectedRoutineOffset = Math.max(0, Number(offsetDays) || 0);
  renderRoutine();
}

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
    historyLog[today] = { AM:{done:0,total:0}, PM:{done:0,total:0}, steps:{AM:[],PM:[]}, focusDone:[] };
    localStorage.setItem('skincareHistory', JSON.stringify(historyLog));
  }
  renderRoutine();
}

function renderRoutine() {
  const { isPM, dayOfWeek, phaseNum, phaseData, now } = getCurrentRoutineContext(selectedRoutineOffset);

  applyTheme(new Date().getHours() >= 12);

  const dayLabel = getRelativeDayLabel(selectedRoutineOffset);
  document.getElementById('phase-badge').innerText   = dayLabel;
  document.getElementById('time-context').innerText  = `${formatDateHeading(now)} · ${selectedRoutineOffset === 0 ? 'Showing the rest of today' : 'Previewing recurring items ahead'}`;

  const agenda = buildAgendaForOffset(phaseNum, phaseData, dayOfWeek, selectedRoutineOffset);

  const completedCount = agenda.filter(item => item.done).length;
  const total      = agenda.length;
  const percent    = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  const allAgendaDone = agenda.length > 0 && agenda.every(item => item.done);
  updateRoutineHeader(new Date().getHours() >= 12, dayOfWeek, total, completedCount, percent);
  renderHeroPanels(agenda, dayLabel, selectedRoutineOffset);
  renderUpcomingPreview();

  const circle       = document.getElementById('progress-circle');
  const radius       = circle.r.baseVal.value;
  const circ         = radius * 2 * Math.PI;
  circle.style.strokeDasharray  = `${circ} ${circ}`;
  circle.style.strokeDashoffset = circ - (percent/100) * circ;
  document.getElementById('progress-text').innerText = `${percent}%`;
  circle.closest('svg').classList.toggle('ring-complete', percent===100 && total>0);

  const container = document.getElementById('routine-container');
  const successMsg = document.getElementById('success-message');

  if (selectedRoutineOffset === 0 && percent === 100 && total > 0 && allAgendaDone) {
    container.classList.add('hidden');
    successMsg.classList.remove('hidden');
    renderAgenda(agenda, selectedRoutineOffset);
    if ('vibrate' in navigator) navigator.vibrate([100,50,100]);
    return;
  }

  container.classList.remove('hidden');
  successMsg.classList.add('hidden');
  renderAgenda(agenda, selectedRoutineOffset);
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
    container.innerHTML = '<div class="history-card"><div class="history-empty">everything is quiet here.</div></div>';
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
      ${d.AM.total ? `<div class="history-section"><div class="history-row"><span class="history-label">☀️ AM · ${d.AM.done}/${d.AM.total} steps</span><span class="history-percent">${amPct}%</span></div><div class="history-bar-wrap"><div class="history-bar" style="width:${amPct}%"></div></div></div>` : ''}
      ${d.PM.total ? `<div class="history-section"><div class="history-row"><span class="history-label">🌙 PM · ${d.PM.done}/${d.PM.total} steps</span><span class="history-percent">${pmPct}%</span></div><div class="history-bar-wrap"><div class="history-bar" style="width:${pmPct}%"></div></div></div>` : ''}
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
  { key:'PM_B_TueThu',label:'🌙 Tue/Thu'  },
  { key:'PM_B_Sat',   label:'🌙 Sat'      },
  { key:'PM_B_Sun',   label:'🌙 Sun'      },
  { key:'Modifiers',  label:'⚡ Modifiers' },
];
const DAYS = DAY_NAMES;
const FOCUS_CATEGORIES = [
  { key: 'exercise', label: 'Exercise' },
  { key: 'mindfulness', label: 'Mindfulness' },
  { key: 'engagement', label: 'Engagement' }
];

function getActiveFocusCategory() {
  return editorFocusArea === 'skincare' ? 'exercise' : editorFocusArea;
}

function getRoutineLabel(routineKey) {
  return ROUTINE_TYPES.find(r => r.key === routineKey)?.label || routineKey;
}

function syncEditorToCurrentRoutine(shouldRender = true) {
  const context = getCurrentRoutineContext();
  editorPhase = context.phaseKey;
  editorRoutine = context.routineKey;
  if (shouldRender) renderProtocolEditor();
}

function renderProtocolEditor() {
  const liveContext = getCurrentRoutineContext();
  const liveLabel = `${liveContext.phaseData?.name || `Phase ${liveContext.phaseNum}`} · ${getRoutineLabel(liveContext.routineKey)} · ${liveContext.dayOfWeek}`;
  document.getElementById('editor-live-context').innerText = liveLabel;
  document.getElementById('editor-panel-skincare').classList.toggle('hidden', editorFocusArea !== 'skincare');
  document.getElementById('editor-panel-focus').classList.toggle('hidden', editorFocusArea === 'skincare');
  Array.from(document.querySelectorAll('#editor-focus-switcher .focus-switcher-btn')).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.area === editorFocusArea);
  });
  renderPhasePicker();
  renderRoutineTypePicker();
  renderStepList();
  renderFocusEditor();
  // Sync phase name input
  const phaseName = protocolData[editorPhase]?.name || '';
  document.getElementById('phase-name-input').value = phaseName;
  // Sync JSON export
  document.getElementById('set-protocol-json').value = JSON.stringify(protocolData, null, 2);
  const activeCategory = getActiveFocusCategory();
  document.getElementById('focus-editor-context').innerText = `${FOCUS_CATEGORIES.find(category => category.key === activeCategory)?.label || activeCategory} blocks`;
  document.getElementById('set-focus-json').value = JSON.stringify(
    focusPlanner.filter(item => item.category === activeCategory),
    null,
    2
  );
  document.getElementById('set-all-json').value = JSON.stringify({
    skincare: protocolData,
    focusPlanner
  }, null, 2);
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
  if (editorFocusArea === 'skincare') saveEditorState();
  editorPhase = key;
  renderProtocolEditor();
}

function selectEditorRoutine(key) {
  if (editorFocusArea === 'skincare') saveEditorState();
  editorRoutine = key;
  renderRoutineTypePicker();
  renderStepList();
}

// ── Phase name ──
let phaseNameTimeout = null;
function savePhaseNameDebounced() {
  clearTimeout(phaseNameTimeout);
  phaseNameTimeout = setTimeout(flushPhaseName, 500);
}

function flushPhaseName() {
  if (!protocolData[editorPhase]) protocolData[editorPhase] = {};
  protocolData[editorPhase].name = document.getElementById('phase-name-input').value.trim();
  persistProtocol();
  renderPhasePicker();
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
        <input class="editor-name-input" type="text" value="${escHtml(name)}" placeholder="Product or step name" oninput="updateEditorStepField(${i}, 'name', this.value)"/>
        <button class="editor-expand-btn${hasExtras?' has-extras':''}" onclick="toggleExtras(this)" title="Description &amp; Timer">${hasExtras?'✏️':'＋'}</button>
        <button class="editor-delete-btn" onclick="deleteEditorStep(${i})" title="Remove step">✕</button>
      </div>
      <div class="editor-step-extras${hasExtras?'':' hidden'}">
        <textarea class="editor-desc-input" placeholder="Instructions (e.g. Apply to damp skin, rinse after 5 min)" oninput="updateEditorStepField(${i}, 'desc', this.value)">${escHtml(desc)}</textarea>
        <div class="editor-timer-row">
          <span class="editor-timer-label">⏱ Timer</span>
          <input class="editor-timer-input" type="number" min="0" max="120" value="${timerMin||''}" placeholder="0" oninput="updateEditorStepTimer(${i}, this.value, null)"/>
          <span class="editor-timer-sep">min</span>
          <input class="editor-timer-input" type="number" min="0" max="59" value="${timerSec||''}" placeholder="0" oninput="updateEditorStepTimer(${i}, null, this.value)"/>
          <span class="editor-timer-sep">sec</span>
          <button class="editor-timer-clear" onclick="clearTimer(this)">clear</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function ensureEditorStep(index) {
  if (!protocolData[editorPhase]) protocolData[editorPhase] = {};
  if (!Array.isArray(protocolData[editorPhase][editorRoutine])) protocolData[editorPhase][editorRoutine] = [];
  if (!protocolData[editorPhase][editorRoutine][index]) protocolData[editorPhase][editorRoutine][index] = { name: '' };
  return protocolData[editorPhase][editorRoutine][index];
}

function updateEditorStepField(index, field, value) {
  const step = ensureEditorStep(index);
  if (field === 'name') step.name = value.trimStart();
  if (field === 'desc') {
    const trimmed = value.trim();
    if (trimmed) step.desc = trimmed;
    else delete step.desc;
  }
  persistProtocol();
}

function updateEditorStepTimer(index, minutesValue, secondsValue) {
  const step = ensureEditorStep(index);
  const cards = document.querySelectorAll('#step-editor-list .editor-step-card');
  const timerInputs = cards[index]?.querySelectorAll('.editor-timer-input') || [];
  const minutes = parseInt(minutesValue ?? timerInputs[0]?.value, 10) || 0;
  const seconds = parseInt(secondsValue ?? timerInputs[1]?.value, 10) || 0;
  const total = (minutes * 60) + seconds;
  if (total > 0) step.timer = total;
  else delete step.timer;
  persistProtocol();
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
  const card = btn.closest('.editor-step-card');
  if (card) {
    const index = Array.from(document.querySelectorAll('#step-editor-list .editor-step-card')).indexOf(card);
    if (index >= 0) updateEditorStepTimer(index, 0, 0);
  } else {
    scheduleAutoSave();
  }
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

function scheduleFocusSave() {
  clearTimeout(focusSaveTimer);
  focusSaveTimer = setTimeout(saveFocusState, 400);
}

function renderFocusEditor() {
  const container = document.getElementById('focus-editor-list');
  container.innerHTML = '';
  const activeCategory = getActiveFocusCategory();
  const filteredPlanner = focusPlanner.filter(item => item.category === activeCategory);

  if (!filteredPlanner.length) {
    container.innerHTML = '<div class="editor-empty">No focus blocks yet for this activity focus.</div>';
    return;
  }

  filteredPlanner.forEach((item, index) => {
    const normalized = normalizeFocusItem(item);
    const dayButtons = DAYS.map(day => `
      <button class="focus-day-pill${normalized.days.includes(day) ? ' active' : ''}" onclick="toggleFocusDay(this)" data-day="${day}" type="button">${day.slice(0, 3)}</button>
    `).join('');

    container.insertAdjacentHTML('beforeend', `
      <div class="focus-editor-card" data-focus-index="${index}">
        <div class="focus-editor-grid">
          <input type="text" class="focus-name-input" value="${escHtml(normalized.name)}" placeholder="Focus block name" oninput="scheduleFocusSave()"/>
          <input type="time" class="focus-time-input" value="${normalized.time}" oninput="scheduleFocusSave()"/>
          <input type="number" class="focus-duration-input" min="5" max="240" step="5" value="${normalized.duration}" placeholder="Minutes" oninput="scheduleFocusSave()"/>
        </div>
        <div class="focus-editor-grid">
          <select class="focus-category-input" onchange="scheduleFocusSave()">
            ${FOCUS_CATEGORIES.map(category => `<option value="${category.key}"${category.key === normalized.category ? ' selected' : ''}>${category.label}</option>`).join('')}
          </select>
          <div class="focus-flags">
            <input type="checkbox" class="focus-flex-input" ${normalized.flexible ? 'checked' : ''} onchange="scheduleFocusSave()"/>
            <span>Allow smart push</span>
          </div>
          <button class="editor-delete-btn" onclick="deleteFocusItem(${index})" title="Remove focus block">✕</button>
        </div>
        <textarea class="focus-desc-input" placeholder="Details or prep notes" oninput="scheduleFocusSave()">${escHtml(normalized.desc)}</textarea>
        <div class="focus-editor-row">
          <div class="focus-days">${dayButtons}</div>
        </div>
      </div>
    `);
  });
}

function toggleFocusDay(button) {
  button.classList.toggle('active');
  scheduleFocusSave();
}

function saveFocusState() {
  const activeCategory = getActiveFocusCategory();
  const cards = document.querySelectorAll('#focus-editor-list .focus-editor-card');
  const preserved = focusPlanner.filter(item => item.category !== activeCategory);
  const edited = Array.from(cards).map(card => {
    const index = Number(card.getAttribute('data-focus-index'));
    const originals = focusPlanner.filter(item => item.category === activeCategory);
    const original = originals[index] || {};
    const days = Array.from(card.querySelectorAll('.focus-day-pill.active')).map(dayButton => dayButton.dataset.day);
    return normalizeFocusItem({
      id: original.id,
      category: activeCategory,
      name: card.querySelector('.focus-name-input')?.value.trim(),
      desc: card.querySelector('.focus-desc-input')?.value.trim(),
      time: card.querySelector('.focus-time-input')?.value || '07:00',
      duration: parseInt(card.querySelector('.focus-duration-input')?.value, 10) || 30,
      days,
      flexible: Boolean(card.querySelector('.focus-flex-input')?.checked)
    });
  }).filter(item => item.name);

  focusPlanner = [...preserved, ...edited];

  persistFocusPlanner();
  document.getElementById('set-focus-json').value = JSON.stringify(edited, null, 2);
  document.getElementById('set-all-json').value = JSON.stringify({ skincare: protocolData, focusPlanner }, null, 2);
  showSavedIndicator();
}

function addFocusItem() {
  saveFocusState();
  focusPlanner.push(normalizeFocusItem({
    category: getActiveFocusCategory(),
    name: '',
    desc: '',
    time: '07:00',
    duration: 30,
    days: DAYS.slice(0, 5),
    flexible: true
  }));
  persistFocusPlanner();
  renderFocusEditor();
}

function deleteFocusItem(index) {
  const activeCategory = getActiveFocusCategory();
  const originals = focusPlanner.filter(item => item.category === activeCategory);
  const targetId = originals[index]?.id;
  focusPlanner = focusPlanner.filter(item => item.id !== targetId);
  persistFocusPlanner();
  renderFocusEditor();
  showSavedIndicator();
}

function saveStepState() {
  if (!protocolData[editorPhase]) protocolData[editorPhase] = {};
  const current = Array.isArray(protocolData[editorPhase][editorRoutine]) ? protocolData[editorPhase][editorRoutine] : [];
  protocolData[editorPhase][editorRoutine] = current
    .map(step => {
      if (!step || typeof step !== 'object') return null;
      const nextStep = { ...step };
      nextStep.name = (nextStep.name || '').trim();
      if (!nextStep.name) return null;
      if (!nextStep.desc) delete nextStep.desc;
      if (!nextStep.timer) delete nextStep.timer;
      return nextStep;
    })
    .filter(Boolean);
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
  const all = document.getElementById('set-all-json');
  if (all) all.value = JSON.stringify({ skincare: protocolData, focusPlanner }, null, 2);
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

function importFocusJSON() {
  try {
    const activeCategory = getActiveFocusCategory();
    const parsed = JSON.parse(document.getElementById('set-focus-json').value);
    if (!Array.isArray(parsed)) throw new Error('Expected an array');
    const preserved = focusPlanner.filter(item => item.category !== activeCategory);
    focusPlanner = [
      ...preserved,
      ...parsed.map(item => normalizeFocusItem({ ...item, category: activeCategory }))
    ];
    persistFocusPlanner();
    renderFocusEditor();
    document.getElementById('set-all-json').value = JSON.stringify({ skincare: protocolData, focusPlanner }, null, 2);
    showSavedIndicator();
  } catch (e) {
    alert('Invalid activity JSON. Please provide an array of focus blocks.');
  }
}

function applySkincareEditorChanges() {
  flushPhaseName();
  persistProtocol();
  renderRoutine();
  showSavedIndicator();
}

// ══════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════
function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Init
renderRoutine();
