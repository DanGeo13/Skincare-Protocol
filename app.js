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
const GOOGLE_CALENDAR_CONFIG = {
  apiKey: 'AIzaSyAnfnCskefKLmmNrQtJF8Cd1oe_e5rT7SQ',
  clientId: '676961479977-77pl9hfpivqm3n5st41cu7p2hsq9ufro.apps.googleusercontent.com',
  discoveryDoc: 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
  scope: 'https://www.googleapis.com/auth/calendar.readonly'
};
const GOOGLE_CALENDAR_DAYS_AHEAD = 4;

function formatLocalDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function normalizeProtocolPhases(data = {}) {
  const normalized = {};
  Object.keys(data)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((key, index) => {
      normalized[String(index + 1)] = data[key];
    });
  return normalized;
}

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

let protocolData = normalizeProtocolPhases(readJsonStorage('customProtocol', DEFAULT_PROTOCOL));
let historyLog   = readJsonStorage('skincareHistory', {});
let settings = {
  startDate: localStorage.getItem('startDate') || formatLocalDateKey(new Date()),
  phaseDays: parseInt(localStorage.getItem('phaseDays'), 10) || 14
};
let focusPlanner = mergeSeedFocusPlanner(
  readJsonStorage('focusPlanner', DEFAULT_FOCUS_PLANNER),
  DEFAULT_FOCUS_PLANNER
).map(normalizeFocusItem);

let timerInterval = null;
let timerAlarmInterval = null;
let timerAudioContext = null;
let nextTaskInterval = null;
const timerSound  = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
let selectedRoutineOffset = 0;
let googleTokenClient = null;
let googleCalendarState = {
  gapiReady: false,
  gisReady: false,
  clientReady: false,
  signedIn: false,
  availableCalendars: [],
  selectedCalendarIds: readJsonStorage('googleCalendarSelectedIds', []),
  eventsByDate: {},
  eventCountsByCalendar: {},
  loadedDaysAhead: GOOGLE_CALENDAR_DAYS_AHEAD,
  syncError: '',
  isSyncing: false
};

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
    if (editorFocusArea === 'skincare') {
      clearTimeout(autoSaveTimer);
      clearTimeout(phaseNameTimeout);
      saveEditorState();
      flushPhaseName();
    } else if (FOCUS_CATEGORIES.some(category => category.key === editorFocusArea)) {
      clearTimeout(focusSaveTimer);
      saveFocusState();
    }
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
    renderGoogleCalendarSettings();
  }
}

function selectEditorFocus(area) {
  if (editorFocusArea === area) return;
  if (editorFocusArea === 'skincare') {
    clearTimeout(autoSaveTimer);
    clearTimeout(phaseNameTimeout);
    flushPhaseName();
    persistProtocol();
  } else if (FOCUS_CATEGORIES.some(category => category.key === editorFocusArea)) {
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
    flexible: item.flexible !== false,
    phases: Array.isArray(item.phases)
      ? item.phases.map(phase => String(phase)).filter(Boolean)
      : (item.phase ? [String(item.phase)] : [])
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

function getAllExportData() {
  return {
    skincare: protocolData,
    focusPlanner,
    googleCalendar: {
      selectedCalendarIds: googleCalendarState.selectedCalendarIds
    }
  };
}

function syncExportTextareas() {
  const all = document.getElementById('set-all-json');
  if (all) all.value = JSON.stringify(getAllExportData(), null, 2);
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

function generateTodayFocusBlocks(dayOfWeek, phaseNum) {
  const todaysItems = focusPlanner
    .filter(item => item.days.includes(dayOfWeek) && item.name.trim())
    .filter(item => !item.phases?.length || item.phases.includes(String(phaseNum)))
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
  const blocks = generateTodayFocusBlocks(dayOfWeek, getCurrentRoutineContext().phaseNum);
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

function getFocusAgendaItems(dayOfWeek, historyDay, phaseNum) {
  const done = historyDay?.focusDone || [];
  return generateTodayFocusBlocks(dayOfWeek, phaseNum).map(block => ({
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

function getCalendarAgendaItems(offsetDays = 0) {
  const dateKey = getDateKey(offsetDays);
  return Array.isArray(googleCalendarState.eventsByDate[dateKey]) ? googleCalendarState.eventsByDate[dateKey] : [];
}

function buildAgendaForOffset(phaseNum, phaseData, dayOfWeek, offsetDays = 0) {
  const dateKey = getDateKey(offsetDays);
  const historyDay = historyLog[dateKey] || {};
  return [
    ...getSkincareAgendaItems(phaseNum, phaseData, dayOfWeek, historyDay),
    ...getFocusAgendaItems(dayOfWeek, historyDay, phaseNum),
    ...getCalendarAgendaItems(offsetDays)
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
        ? (agenda[0].allDay ? 'All day' : formatClock(agenda[0].scheduledStart).replace(' AM', '').replace(' PM', ''))
        : '--';
      return;
    }

    const now = new Date();
    const nowMinutes = getCurrentMinutes();
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
    noteEl.innerText = `${nextItem.allDay ? 'All day' : formatClock(nextItem.scheduledStart)} · ${nextItem.name}`;
    if (panelTimeEl) panelTimeEl.innerText = nextItem.allDay ? 'All day' : formatCountdown(countdownMs);
  }

  renderCountdown();
  nextTaskInterval = setInterval(renderCountdown, 1000);
}

function getDateKey(offsetDays = 0) {
  const date = getDateForOffset(offsetDays);
  return formatLocalDateKey(date);
}

function getWeekdayForOffset(offsetDays = 0) {
  const date = getDateForOffset(offsetDays);
  return date.toLocaleDateString('en-AU', { weekday: 'long' });
}

function buildUpcomingPreview(daysAhead = 3) {
  const previews = [];
  const startOffset = Math.max(0, selectedRoutineOffset - 2);
  const endOffset = Math.max(startOffset + daysAhead, selectedRoutineOffset + 2);
  for (let offset = startOffset; offset <= endOffset; offset++) {
    const dayOfWeek = getWeekdayForOffset(offset);
    const phaseNum = calculatePhase(getDateForOffset(offset));
    const phaseData = protocolData[String(phaseNum)] || protocolData[phaseNum] || protocolData[Object.keys(protocolData)[0]];
    const agenda = getVisibleAgendaItems(buildAgendaForOffset(phaseNum, phaseData, dayOfWeek, offset), offset);
    const firstItem = agenda[0];

    previews.push({
      offset,
      label: getRelativeDayLabel(offset),
      dateLabel: formatDateHeading(getDateForOffset(offset)),
      title: firstItem?.name || 'No events yet',
      meta: firstItem
        ? `${firstItem.allDay ? 'All day' : formatClock(firstItem.scheduledStart)} · ${firstItem.category}`
        : 'Nothing planned yet',
      count: agenda.length
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

function getCurrentMinutes() {
  const now = new Date();
  return (now.getHours() * 60) + now.getMinutes();
}

function getAgendaItemCategoryClass(item) {
  if (item.kind === 'skincare') return 'kind-skincare';
  if (item.kind === 'calendar') return 'kind-calendar';
  if (item.category === 'exercise') return 'kind-exercise';
  if (item.category === 'mindfulness') return 'kind-mindfulness';
  if (item.category === 'engagement') return 'kind-engagement';
  return 'kind-generic';
}

function isAgendaItemVisible(item, offsetDays = 0) {
  if (offsetDays !== 0) return true;
  if (item.kind !== 'calendar') return true;
  return toMinutes(item.scheduledEnd) + 60 > getCurrentMinutes();
}

function getVisibleAgendaItems(agenda, offsetDays = 0) {
  return agenda.filter(item => isAgendaItemVisible(item, offsetDays));
}

function getAgendaPresentation(agenda, isPM) {
  const nowMinutes = getCurrentMinutes();
  const nextItem = agenda.find(item => !item.done && toMinutes(item.scheduledStart) >= nowMinutes) || agenda.find(item => !item.done) || null;
  const liveItem = agenda.find(item => {
    const start = toMinutes(item.scheduledStart);
    const end = toMinutes(item.scheduledEnd);
    return !item.done && start <= nowMinutes && nowMinutes < end;
  }) || nextItem || agenda[0] || null;

  return { nextItem, liveItem, nowMinutes, isPM };
}

function renderHeroPanels(agenda, dayLabel, offsetDays = 0) {
  const { nextItem, liveItem } = getAgendaPresentation(agenda, false);
  const heroItem = offsetDays === 0 ? (liveItem || nextItem) : nextItem;
  const nextTitle = document.getElementById('next-panel-title');
  const nextSubtitle = document.getElementById('next-panel-subtitle');
  const nextTime = document.getElementById('next-panel-time');
  const agendaSubtitle = document.getElementById('agenda-subtitle');

  if (heroItem) {
    nextTitle.innerText = heroItem.name;
    nextSubtitle.innerText = heroItem.kind === 'skincare'
      ? `${heroItem.isPM ? 'Evening' : 'Morning'} routine · ${formatClock(heroItem.scheduledStart)}`
      : `${heroItem.category} · ${heroItem.allDay ? 'All day' : formatClock(heroItem.scheduledStart)}`;
    nextTime.innerText = heroItem.allDay ? 'All day' : formatClock(heroItem.scheduledStart).replace(' AM', '').replace(' PM', '');
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

  const nowMinutes = getCurrentMinutes();
  const nextId = offsetDays === 0 ? agenda.find(item => !item.done && toMinutes(item.scheduledStart) >= nowMinutes)?.id : agenda.find(item => !item.done)?.id;

  agenda.forEach(item => {
    const card = document.createElement('div');
    card.className = `agenda-card ${getAgendaItemCategoryClass(item)}${item.done ? ' done' : ''}${item.id === nextId ? ' is-next' : ''}`;
    card.dataset.startMinutes = String(toMinutes(item.scheduledStart));
    card.dataset.endMinutes = String(toMinutes(item.scheduledEnd));
    const action = document.createElement('button');
    action.className = 'agenda-action';
    const canToggle = offsetDays === 0 && item.kind !== 'calendar';
    action.title = canToggle ? 'Mark complete' : (item.kind === 'calendar' ? 'Google Calendar items are read-only' : 'Future items cannot be completed yet');
    action.textContent = item.done ? '✓' : (canToggle ? '○' : '·');
    action.disabled = !canToggle;
    if (canToggle) {
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
        <div class="agenda-time">${item.allDay ? 'All day' : formatClock(item.scheduledStart)}</div>
        <span class="agenda-time-note">${item.allDay ? 'Calendar hold' : `${item.duration} min block`}</span>
      </div>
      <div>
        <div class="agenda-name">${escHtml(item.name)}</div>
        ${item.desc ? `<div class="agenda-desc">${escHtml(item.desc)}</div>` : ''}
        <div class="agenda-tags">
          <span class="agenda-tag">${escHtml(item.category)}</span>
          <span class="agenda-tag">${item.allDay ? 'All day' : `${formatClock(item.scheduledStart)} - ${formatClock(item.scheduledEnd)}`}</span>
          ${item.kind === 'skincare' ? `<span class="agenda-tag">${item.isPM ? 'PM routine' : 'AM routine'}</span>` : ''}
          ${item.kind === 'calendar' && item.calendarName ? `<span class="agenda-tag">${escHtml(item.calendarName)}</span>` : ''}
          ${item.pushed ? '<span class="agenda-tag">smart-pushed</span>' : ''}
          ${timerTag}
        </div>
      </div>
    `;
    card.appendChild(action);
    container.appendChild(card);
  });

  renderDayProgressLine(agenda, offsetDays);
  startNextTaskCountdown(agenda, offsetDays);
}

function renderDayProgressLine(agenda, offsetDays = 0) {
  const container = document.getElementById('routine-container');
  if (!container) return;

  const existing = container.querySelector('.agenda-progress-line');
  if (existing) existing.remove();
  if (offsetDays !== 0 || !agenda.length) return;

  const line = document.createElement('div');
  line.className = 'agenda-progress-line';
  const fill = document.createElement('div');
  fill.className = 'agenda-progress-fill';
  const marker = document.createElement('div');
  marker.className = 'agenda-progress-marker';

  const progressPct = Math.max(0, Math.min(1, getCurrentMinutes() / (24 * 60)));
  fill.style.height = `${progressPct * 100}%`;
  marker.style.top = `${progressPct * 100}%`;

  line.appendChild(fill);
  line.appendChild(marker);
  container.appendChild(line);
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

function getTodayKey() { return formatLocalDateKey(new Date()); }

function setRoutineDayOffset(offsetDays = 0) {
  selectedRoutineOffset = Math.max(0, Math.min(30, Number(offsetDays) || 0));
  if (googleCalendarState.signedIn && selectedRoutineOffset > googleCalendarState.loadedDaysAhead) {
    refreshGoogleCalendarEvents();
  }
  renderRoutine();
}

function shiftRoutineDay(delta) {
  setRoutineDayOffset(selectedRoutineOffset + delta);
}

function jumpToRoutineDate(value) {
  if (!value) return;
  const target = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  setRoutineDayOffset(Math.max(0, diffDays));
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
  const picker = document.getElementById('routine-date-picker');
  if (picker) picker.value = formatLocalDateKey(now);

  const agenda = getVisibleAgendaItems(buildAgendaForOffset(phaseNum, phaseData, dayOfWeek, selectedRoutineOffset), selectedRoutineOffset);

  const completableItems = agenda.filter(item => item.kind !== 'calendar');
  const completedCount = completableItems.filter(item => item.done).length;
  const total      = completableItems.length;
  const percent    = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  const allAgendaDone = completableItems.length > 0 && completableItems.every(item => item.done);
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
  stopTimerAlarm();
  maybeRequestNotificationPermission();
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
      startTimerAlarm();
      showTimerFinishedNotification();
      if ('vibrate' in navigator) navigator.vibrate([200,100,200,100,400]);
      setTimeout(() => {
        display.classList.add('hidden');
        stopTimerAlarm();
      }, 15000);
    }
  }, 1000);
}

function maybeRequestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function showTimerFinishedNotification() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification('Timer finished', {
      body: 'Your protocol timer has completed.',
      requireInteraction: true
    });
  } catch (_) {}
}

function ensureTimerAudioContext() {
  if (!timerAudioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) timerAudioContext = new AudioCtx();
  }
  if (timerAudioContext?.state === 'suspended') {
    timerAudioContext.resume().catch(() => {});
  }
  return timerAudioContext;
}

function playAlarmPulse() {
  const ctx = ensureTimerAudioContext();
  if (!ctx) {
    timerSound.currentTime = 0;
    timerSound.play().catch(() => {});
    return;
  }

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(880, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.35);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.48);
}

function startTimerAlarm() {
  stopTimerAlarm();
  playAlarmPulse();
  timerAlarmInterval = setInterval(playAlarmPulse, 1200);
}

function stopTimerAlarm() {
  if (timerAlarmInterval) {
    clearInterval(timerAlarmInterval);
    timerAlarmInterval = null;
  }
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
  return FOCUS_CATEGORIES.some(category => category.key === editorFocusArea) ? editorFocusArea : 'exercise';
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
  document.getElementById('editor-panel-focus').classList.toggle('hidden', !FOCUS_CATEGORIES.some(category => category.key === editorFocusArea));
  document.getElementById('editor-panel-calendar').classList.toggle('hidden', editorFocusArea !== 'calendar');
  Array.from(document.querySelectorAll('#editor-focus-switcher .focus-switcher-btn')).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.area === editorFocusArea);
  });
  if (editorFocusArea === 'skincare') {
    renderPhasePicker();
    renderRoutineTypePicker();
    renderStepList();
  }
  if (FOCUS_CATEGORIES.some(category => category.key === editorFocusArea)) {
    renderFocusPhasePicker();
    renderFocusEditor();
  }
  // Sync phase name input
  const phaseName = protocolData[editorPhase]?.name || '';
  const phaseInput = document.getElementById('phase-name-input');
  if (phaseInput) phaseInput.value = phaseName;
  // Sync JSON export
  const protocolJson = document.getElementById('set-protocol-json');
  if (protocolJson) protocolJson.value = JSON.stringify(protocolData, null, 2);
  const activeCategory = getActiveFocusCategory();
  const focusContext = document.getElementById('focus-editor-context');
  if (focusContext) focusContext.innerText = `${FOCUS_CATEGORIES.find(category => category.key === activeCategory)?.label || activeCategory} · ${protocolData[editorPhase]?.name || `Phase ${editorPhase}`}`;
  const focusJson = document.getElementById('set-focus-json');
  if (focusJson) {
    focusJson.value = JSON.stringify(
      focusPlanner.filter(item =>
        item.category === activeCategory &&
        (item.phases?.includes(editorPhase) || (!item.phases?.length && editorPhase === '1'))
      ),
      null,
      2
    );
  }
  syncExportTextareas();
  renderGoogleCalendarSettings();
}

function renderPhasePicker() {
  const phases = Object.keys(protocolData).sort((a,b)=>Number(a)-Number(b));
  document.getElementById('phase-picker').innerHTML =
    phases.map(p => `<button class="pill-btn${editorPhase===p?' active':''}" onclick="selectEditorPhase('${p}')">${protocolData[p].name||'Phase '+p}</button>`).join('') +
    `<button class="pill-btn add-pill" onclick="addPhase()">＋</button>`;
  const deleteBtn = document.getElementById('delete-phase-btn');
  if (deleteBtn) deleteBtn.disabled = phases.length <= 1;
  const moveBackBtn = document.getElementById('move-phase-back-btn');
  const moveForwardBtn = document.getElementById('move-phase-forward-btn');
  if (moveBackBtn) moveBackBtn.disabled = editorPhase === phases[0];
  if (moveForwardBtn) moveForwardBtn.disabled = editorPhase === phases[phases.length - 1];
}

function renderFocusPhasePicker() {
  const phases = Object.keys(protocolData).sort((a,b)=>Number(a)-Number(b));
  const target = document.getElementById('focus-phase-picker');
  if (target) {
    target.innerHTML =
      phases.map(p => `<button class="pill-btn${editorPhase===p?' active':''}" onclick="selectEditorPhase('${p}')">${protocolData[p].name||'Phase '+p}</button>`).join('') +
      `<button class="pill-btn add-pill" onclick="addPhase()">＋</button>`;
  }
  const deleteBtn = document.getElementById('focus-delete-phase-btn');
  if (deleteBtn) deleteBtn.disabled = phases.length <= 1;
  const moveBackBtn = document.getElementById('focus-move-phase-back-btn');
  const moveForwardBtn = document.getElementById('focus-move-phase-forward-btn');
  if (moveBackBtn) moveBackBtn.disabled = editorPhase === phases[0];
  if (moveForwardBtn) moveForwardBtn.disabled = editorPhase === phases[phases.length - 1];
}

function renderRoutineTypePicker() {
  document.getElementById('routine-type-picker').innerHTML =
    ROUTINE_TYPES.map(r => `<button class="pill-btn${editorRoutine===r.key?' active':''}" onclick="selectEditorRoutine('${r.key}')">${r.label}</button>`).join('');
  document.getElementById('add-step-btn').textContent = editorRoutine === 'Modifiers' ? '＋ Add Modifier' : '＋ Add Step';
}

function selectEditorPhase(key) {
  if (editorFocusArea === 'skincare') saveEditorState();
  else if (FOCUS_CATEGORIES.some(category => category.key === editorFocusArea)) saveFocusState();
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

function deleteCurrentPhase() {
  const phaseKeys = Object.keys(protocolData).sort((a, b) => Number(a) - Number(b));
  if (phaseKeys.length <= 1) return;
  if (!confirm(`Delete ${protocolData[editorPhase]?.name || `Phase ${editorPhase}`}?`)) return;

  const deletedPhase = Number(editorPhase);
  delete protocolData[editorPhase];
  protocolData = normalizeProtocolPhases(protocolData);
  focusPlanner = focusPlanner.map(item => normalizeFocusItem({
    ...item,
    phases: (item.phases || [])
      .map(Number)
      .filter(phase => phase !== deletedPhase)
      .map(phase => String(phase > deletedPhase ? phase - 1 : phase))
  }));
  persistFocusPlanner();
  const nextKeys = Object.keys(protocolData).sort((a, b) => Number(a) - Number(b));
  editorPhase = nextKeys[Math.max(0, Math.min(nextKeys.length - 1, phaseKeys.indexOf(String(deletedPhase)) - 1))] || '1';
  persistProtocol();
  renderProtocolEditor();
  renderRoutine();
}

function moveCurrentPhase(delta) {
  const phaseKeys = Object.keys(protocolData).sort((a, b) => Number(a) - Number(b));
  const currentIndex = phaseKeys.indexOf(editorPhase);
  const targetIndex = currentIndex + delta;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= phaseKeys.length) return;

  const reorderedKeys = phaseKeys.slice();
  const [moved] = reorderedKeys.splice(currentIndex, 1);
  reorderedKeys.splice(targetIndex, 0, moved);

  const nextProtocol = {};
  const phaseMap = {};
  reorderedKeys.forEach((oldKey, index) => {
    const newKey = String(index + 1);
    nextProtocol[newKey] = protocolData[oldKey];
    phaseMap[oldKey] = newKey;
  });

  protocolData = nextProtocol;
  focusPlanner = focusPlanner.map(item => normalizeFocusItem({
    ...item,
    phases: (item.phases || []).map(phase => phaseMap[String(phase)] || String(phase))
  }));
  persistFocusPlanner();
  editorPhase = phaseMap[editorPhase] || '1';
  persistProtocol();
  renderProtocolEditor();
  renderRoutine();
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
  const filteredPlanner = focusPlanner.filter(item =>
    item.category === activeCategory &&
    (item.phases?.includes(editorPhase) || (!item.phases?.length && editorPhase === '1'))
  );

  if (!filteredPlanner.length) {
    container.innerHTML = '<div class="editor-empty">No focus blocks yet for this activity focus in this phase.</div>';
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
          <div class="focus-category-chip">${escHtml(FOCUS_CATEGORIES.find(category => category.key === activeCategory)?.label || activeCategory)}</div>
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
  const preserved = focusPlanner.filter(item =>
    item.category !== activeCategory || !(item.phases?.includes(editorPhase) || (!item.phases?.length && editorPhase === '1'))
  );
  const edited = Array.from(cards).map(card => {
    const index = Number(card.getAttribute('data-focus-index'));
    const originals = focusPlanner.filter(item =>
      item.category === activeCategory &&
      (item.phases?.includes(editorPhase) || (!item.phases?.length && editorPhase === '1'))
    );
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
      flexible: Boolean(card.querySelector('.focus-flex-input')?.checked),
      phases: [editorPhase]
    });
  }).filter(item => item.name);

  focusPlanner = [...preserved, ...edited];

  persistFocusPlanner();
  document.getElementById('set-focus-json').value = JSON.stringify(edited, null, 2);
  syncExportTextareas();
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
    flexible: true,
    phases: [editorPhase]
  }));
  persistFocusPlanner();
  renderFocusEditor();
}

function deleteFocusItem(index) {
  const activeCategory = getActiveFocusCategory();
  const originals = focusPlanner.filter(item =>
    item.category === activeCategory &&
    (item.phases?.includes(editorPhase) || (!item.phases?.length && editorPhase === '1'))
  );
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
  syncExportTextareas();
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
    protocolData = normalizeProtocolPhases(parsed);
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
    const preserved = focusPlanner.filter(item =>
      item.category !== activeCategory || !(item.phases?.includes(editorPhase) || (!item.phases?.length && editorPhase === '1'))
    );
    focusPlanner = [
      ...preserved,
      ...parsed.map(item => normalizeFocusItem({ ...item, category: activeCategory, phases: [editorPhase] }))
    ];
    persistFocusPlanner();
    renderFocusEditor();
    syncExportTextareas();
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

function isGoogleCalendarConfigured() {
  return Boolean(GOOGLE_CALENDAR_CONFIG.apiKey && GOOGLE_CALENDAR_CONFIG.clientId);
}

function isHttpOrigin() {
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

function getSelectedCalendarIds() {
  if (googleCalendarState.selectedCalendarIds.length) return googleCalendarState.selectedCalendarIds;
  return googleCalendarState.availableCalendars
    .filter(calendar => calendar.selected !== false)
    .map(calendar => calendar.id);
}

function persistSelectedGoogleCalendars(ids) {
  googleCalendarState.selectedCalendarIds = ids;
  localStorage.setItem('googleCalendarSelectedIds', JSON.stringify(ids));
  syncExportTextareas();
}

function renderGoogleCalendarSettings() {
  const statusEl = document.getElementById('google-calendar-status');
  const listEl = document.getElementById('google-calendar-list');
  const connectBtn = document.getElementById('google-calendar-connect-btn');
  const refreshBtn = document.getElementById('google-calendar-refresh-btn');
  const disconnectBtn = document.getElementById('google-calendar-disconnect-btn');
  if (!statusEl || !listEl || !connectBtn || !refreshBtn || !disconnectBtn) return;

  if (!isGoogleCalendarConfigured()) {
    statusEl.innerText = 'Google Calendar is not configured yet.';
    listEl.innerHTML = '';
    connectBtn.disabled = true;
    refreshBtn.disabled = true;
    disconnectBtn.disabled = true;
    return;
  }

  if (!isHttpOrigin()) {
    statusEl.innerText = `Google Calendar requires an http/https origin. Current origin: ${window.location.origin || window.location.protocol}`;
    listEl.innerHTML = '';
    connectBtn.disabled = true;
    refreshBtn.disabled = true;
    disconnectBtn.disabled = true;
    return;
  }

  if (googleCalendarState.syncError) {
    statusEl.innerText = googleCalendarState.syncError;
  } else if (googleCalendarState.isSyncing) {
    statusEl.innerText = 'Syncing Google Calendar…';
  } else if (!googleCalendarState.gapiReady || !googleCalendarState.gisReady || !googleCalendarState.clientReady) {
    statusEl.innerText = 'Loading Google Calendar libraries…';
  } else if (!googleCalendarState.signedIn) {
    statusEl.innerText = `Ready to connect on ${window.location.origin}.`;
  } else {
    const eventCount = Object.values(googleCalendarState.eventsByDate).reduce((sum, items) => sum + items.length, 0);
    statusEl.innerText = `Connected. ${eventCount} calendar item${eventCount === 1 ? '' : 's'} loaded across the next ${googleCalendarState.loadedDaysAhead + 1} days.`;
  }

  connectBtn.disabled = !googleCalendarState.gapiReady || !googleCalendarState.gisReady || !googleCalendarState.clientReady || googleCalendarState.isSyncing || !isHttpOrigin();
  connectBtn.innerText = googleCalendarState.signedIn ? 'Reconnect Google Calendar' : 'Connect Google Calendar';
  refreshBtn.disabled = !googleCalendarState.signedIn || googleCalendarState.isSyncing;
  disconnectBtn.disabled = !googleCalendarState.signedIn;

  if (!googleCalendarState.signedIn) {
    listEl.innerHTML = '<div class="focus-empty">Sign in to load your calendars and choose which ones should appear in the schedule.</div>';
    return;
  }

  if (!googleCalendarState.availableCalendars.length) {
    listEl.innerHTML = '<div class="focus-empty">No calendars available yet. Refresh after connecting.</div>';
    return;
  }

  const selected = new Set(getSelectedCalendarIds());
  listEl.innerHTML = googleCalendarState.availableCalendars.map(calendar => `
    <label class="focus-flags" style="display:flex;justify-content:space-between;margin-bottom:8px">
      <span>${escHtml(calendar.summary || calendar.id)}${googleCalendarState.signedIn ? ` (${googleCalendarState.eventCountsByCalendar[calendar.id] || 0})` : ''}</span>
      <input
        type="checkbox"
        ${selected.has(calendar.id) ? 'checked' : ''}
        onchange='toggleGoogleCalendarSelection(${JSON.stringify(calendar.id)}, this.checked)'
      />
    </label>
  `).join('');
}

function onGoogleApiLoaded() {
  if (!window.gapi) {
    googleCalendarState.syncError = 'Google API client failed to load.';
    renderGoogleCalendarSettings();
    return;
  }

  gapi.load('client', async () => {
    try {
      await gapi.client.init({
        apiKey: GOOGLE_CALENDAR_CONFIG.apiKey,
        discoveryDocs: [GOOGLE_CALENDAR_CONFIG.discoveryDoc]
      });
      googleCalendarState.gapiReady = true;
      googleCalendarState.clientReady = true;
      googleCalendarState.syncError = '';
      renderGoogleCalendarSettings();
    } catch (error) {
      googleCalendarState.syncError = `Google Calendar client init failed: ${error?.message || 'unknown error'}`;
      renderGoogleCalendarSettings();
    }
  });
}

function onGoogleIdentityLoaded() {
  if (!window.google?.accounts?.oauth2) {
    googleCalendarState.syncError = 'Google Identity Services failed to load.';
    renderGoogleCalendarSettings();
    return;
  }

  googleTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CALENDAR_CONFIG.clientId,
    scope: GOOGLE_CALENDAR_CONFIG.scope,
    callback: async (response) => {
      if (response?.error) {
        googleCalendarState.syncError = `Google sign-in failed: ${response.error}`;
        googleCalendarState.signedIn = false;
        renderGoogleCalendarSettings();
        return;
      }

      googleCalendarState.signedIn = true;
      googleCalendarState.syncError = '';
      await refreshGoogleCalendarEvents();
    }
  });

  googleCalendarState.gisReady = true;
  renderGoogleCalendarSettings();
}

async function handleGoogleCalendarAuth() {
  if (!googleTokenClient || !googleCalendarState.clientReady) return;
  googleCalendarState.syncError = '';
  renderGoogleCalendarSettings();
  const existingToken = gapi.client.getToken();
  googleTokenClient.requestAccessToken({ prompt: existingToken ? '' : 'consent' });
}

async function disconnectGoogleCalendar() {
  const token = gapi.client.getToken();
  if (token?.access_token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token.access_token, () => {});
  }
  gapi.client.setToken(null);
  googleCalendarState.signedIn = false;
  googleCalendarState.availableCalendars = [];
  googleCalendarState.eventsByDate = {};
  googleCalendarState.eventCountsByCalendar = {};
  googleCalendarState.syncError = '';
  renderGoogleCalendarSettings();
  renderRoutine();
}

async function refreshGoogleCalendarEvents() {
  if (!googleCalendarState.signedIn || !googleCalendarState.clientReady) return;
  googleCalendarState.isSyncing = true;
  googleCalendarState.syncError = '';
  renderGoogleCalendarSettings();

  try {
    await loadAvailableGoogleCalendars();
    await loadGoogleCalendarEvents();
    renderRoutine();
  } catch (error) {
    googleCalendarState.syncError = `Google Calendar sync failed: ${error?.result?.error?.message || error?.message || 'unknown error'}`;
  } finally {
    googleCalendarState.isSyncing = false;
    renderGoogleCalendarSettings();
  }
}

async function loadAvailableGoogleCalendars() {
  const response = await gapi.client.calendar.calendarList.list({ showHidden: false });
  const items = response.result.items || [];
  googleCalendarState.availableCalendars = items.map(item => ({
    id: item.id,
    summary: item.summary,
    primary: Boolean(item.primary),
    selected: true
  }));

  if (!googleCalendarState.selectedCalendarIds.length) {
    persistSelectedGoogleCalendars(items.map(item => item.id));
  }
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDateKeyFromDate(date) {
  return formatLocalDateKey(date);
}

function buildDateRangeKeys(startDate, endDateInclusive) {
  const keys = [];
  let cursor = startOfDay(startDate);
  const limit = startOfDay(endDateInclusive);
  while (cursor <= limit) {
    keys.push(getDateKeyFromDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function toLocalTimeString(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function mapGoogleEventToAgendaItems(event, calendarMeta, rangeStart, rangeEnd) {
  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  const start = event.start?.dateTime ? new Date(event.start.dateTime) : new Date(`${event.start?.date}T00:00:00`);
  const endExclusive = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(`${event.end?.date}T00:00:00`);
  const summary = event.summary || 'Untitled calendar event';
  const detailParts = [calendarMeta?.summary, event.location].filter(Boolean);

  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) return [];

  const boundedStart = start < rangeStart ? rangeStart : start;
  const boundedEnd = endExclusive > rangeEnd ? rangeEnd : endExclusive;
  if (boundedEnd <= boundedStart) return [];

  if (!isAllDay) {
    return [{
      id: `calendar-${calendarMeta?.id || 'calendar'}-${event.id}`,
      kind: 'calendar',
      category: 'calendar',
      calendarName: calendarMeta?.summary || 'Calendar',
      name: summary,
      desc: detailParts.join(' · '),
      duration: Math.max(5, Math.round((endExclusive - start) / 60000)),
      timer: 0,
      scheduledStart: toLocalTimeString(start),
      scheduledEnd: toLocalTimeString(new Date(Math.max(start.getTime() + 300000, endExclusive.getTime()))),
      done: false,
      allDay: false,
      dateKey: getDateKeyFromDate(start)
    }];
  }

  const spanEnd = addDays(endExclusive, -1);
  return buildDateRangeKeys(start, spanEnd).map(dateKey => ({
    id: `calendar-${calendarMeta?.id || 'calendar'}-${event.id}-${dateKey}`,
    kind: 'calendar',
    category: 'calendar',
    calendarName: calendarMeta?.summary || 'Calendar',
    name: summary,
    desc: detailParts.join(' · '),
    duration: 24 * 60,
    timer: 0,
    scheduledStart: '00:00',
    scheduledEnd: '23:59',
    done: false,
    allDay: true,
    dateKey
  }));
}

async function loadGoogleCalendarEvents() {
  const selectedIds = getSelectedCalendarIds();
  const rangeStart = startOfDay(new Date());
  const daysAhead = Math.max(GOOGLE_CALENDAR_DAYS_AHEAD, selectedRoutineOffset + 3);
  const rangeEnd = addDays(rangeStart, daysAhead + 1);
  const eventsByDate = {};
  const eventCountsByCalendar = {};

  buildDateRangeKeys(rangeStart, addDays(rangeEnd, -1)).forEach(dateKey => {
    eventsByDate[dateKey] = [];
  });

  const requests = selectedIds.map(async (calendarId) => {
    const response = await gapi.client.calendar.events.list({
      calendarId,
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: 100
    });
    const calendarMeta = googleCalendarState.availableCalendars.find(calendar => calendar.id === calendarId);
    eventCountsByCalendar[calendarId] = (response.result.items || []).length;
    (response.result.items || []).forEach(event => {
      mapGoogleEventToAgendaItems(event, calendarMeta, rangeStart, rangeEnd).forEach(item => {
        if (!eventsByDate[item.dateKey]) eventsByDate[item.dateKey] = [];
        eventsByDate[item.dateKey].push(item);
      });
    });
  });

  await Promise.all(requests);

  Object.keys(eventsByDate).forEach(dateKey => {
    eventsByDate[dateKey].sort((a, b) => toMinutes(a.scheduledStart) - toMinutes(b.scheduledStart));
  });

  googleCalendarState.eventsByDate = eventsByDate;
  googleCalendarState.eventCountsByCalendar = eventCountsByCalendar;
  googleCalendarState.loadedDaysAhead = daysAhead;
}

function toggleGoogleCalendarSelection(calendarId, checked) {
  const selected = new Set(getSelectedCalendarIds());
  if (checked) selected.add(calendarId);
  else selected.delete(calendarId);
  persistSelectedGoogleCalendars(Array.from(selected));
  refreshGoogleCalendarEvents();
}

window.onGoogleApiLoaded = onGoogleApiLoaded;
window.onGoogleIdentityLoaded = onGoogleIdentityLoaded;
window.handleGoogleCalendarAuth = handleGoogleCalendarAuth;
window.refreshGoogleCalendarEvents = refreshGoogleCalendarEvents;
window.disconnectGoogleCalendar = disconnectGoogleCalendar;
window.toggleGoogleCalendarSelection = toggleGoogleCalendarSelection;
window.shiftRoutineDay = shiftRoutineDay;
window.setRoutineDayOffset = setRoutineDayOffset;
window.jumpToRoutineDate = jumpToRoutineDate;
window.deleteCurrentPhase = deleteCurrentPhase;
window.moveCurrentPhase = moveCurrentPhase;

// Init
syncExportTextareas();
renderRoutine();
