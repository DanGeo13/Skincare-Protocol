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
    
    if(tab === 'routine') renderRoutine();
    if(tab === 'history') renderHistory();
}

function calculatePhase() {
    const start = new Date(settings.startDate);
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now - start) / (1000 * 60 * 60 * 24));
    let phaseNum = Math.floor(diffDays / settings.phaseDays) + 1;
    const maxPhase = Math.max(...Object.keys(protocolData).map(Number));
    return phaseNum > maxPhase ? maxPhase : phaseNum;
}

function getTodayKey() { return new Date().toISOString().split('T')[0]; }

function toggleStep(index, totalSteps, isPM) {
    if ("vibrate" in navigator) navigator.vibrate(50);

    const today = getTodayKey();
    const timeOfDay = isPM ? 'PM' : 'AM';
    
    if (!historyLog[today]) historyLog[today] = { AM: { done: 0, total: 0 }, PM: { done: 0, total: 0 }, steps: { AM: [], PM: [] } };
    
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

function renderRoutine() {
    const now = new Date();
    const isPM = now.getHours() >= 12; 
    const dayOfWeek = now.toLocaleDateString('en-AU', { weekday: 'long' });
    
    document.body.className = isPM ? 'theme-pm' : 'theme-am';
    document.getElementById('greeting-text').innerText = isPM ? 'Good Evening, Dan' : 'Good Morning, Dan';
    
    const phaseNum = calculatePhase();
    const phaseData = protocolData[phaseNum] || protocolData[1]; 
    
    document.getElementById('phase-badge').innerText = phaseData.name || `Phase ${phaseNum}`;
    document.getElementById('time-context').innerText = `${dayOfWeek} Routine`;

    let routineSteps = [];
    if (!isPM) {
        routineSteps = phaseData.AM || [];
    } else {
        const isRetrieveNight = ["Monday", "Wednesday", "Friday"].includes(dayOfWeek);
        if (phaseNum <= 2) {
            routineSteps = isRetrieveNight ? phaseData.PM_A : phaseData.PM_B;
        } else {
            if (isRetrieveNight) routineSteps = phaseData.PM_A;
            else if (["Tuesday", "Thursday"].includes(dayOfWeek)) routineSteps = phaseData.PM_B_TueThu || phaseData.PM_B;
            else if (dayOfWeek === "Saturday") routineSteps = phaseData.PM_B_Sat || phaseData.PM_B;
            else if (dayOfWeek === "Sunday") routineSteps = phaseData.PM_B_Sun || phaseData.PM_B;
        }
    }

    if (isPM && phaseData.Modifiers && phaseData.Modifiers[dayOfWeek]) {
        routineSteps.push(phaseData.Modifiers[dayOfWeek]);
    }

    const today = getTodayKey();
    const timeOfDay = isPM ? 'PM' : 'AM';
    const completedSteps = historyLog[today]?.steps?.[timeOfDay] || [];
    const totalSteps = routineSteps.length;

    const percent = totalSteps === 0 ? 0 : Math.round((completedSteps.length / totalSteps) * 100);
    const circle = document.getElementById('progress-circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percent / 100) * circumference;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = offset;
    document.getElementById('progress-text').innerText = `${percent}%`;

    const container = document.getElementById('routine-container');
    const successMsg = document.getElementById('success-message');
    
    if (percent === 100 && totalSteps > 0) {
        container.classList.add('hidden');
        successMsg.classList.remove('hidden');
        if ("vibrate" in navigator && completedSteps.length === totalSteps) navigator.vibrate([100, 50, 100]); 
    } else {
        container.classList.remove('hidden');
        successMsg.classList.add('hidden');
        container.innerHTML = '';
        
        routineSteps.forEach((step, index) => {
            const isObj = typeof step === 'object';
            const name = isObj ? step.name : step;
            const isDone = completedSteps.includes(index);
            
            const desc = isObj && step.desc ? `<div class="step-desc">${step.desc}</div>` : '';
            const timerBtn = isObj && step.timer ? `<button class="btn-timer" onclick="startTimer(${step.timer}, event)">⏱️ Start ${step.timer / 60}m</button>` : '';

            const div = document.createElement('div');
            div.className = `step ${isDone ? 'done' : ''}`;
            div.onclick = () => toggleStep(index, totalSteps, isPM);
            
            div.innerHTML = `
                <div class="custom-checkbox">
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="step-content">
                    <div class="step-title">${name}</div>
                    ${desc}
                    ${timerBtn}
                </div>
            `;
            container.appendChild(div);
        });
    }
}

function renderHistory() {
    const container = document.getElementById('history-container');
    container.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toISOString().split('T')[0];
        const displayDate = i === 0 ? "Today" : d.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
        
        const log = historyLog[dateKey] || { AM: { done: 0, total: 0 }, PM: { done: 0, total: 0 } };
        const formatStat = (session) => {
            if (session.total === 0) return `<span class="skipped">-</span>`;
            if (session.done === session.total && session.total > 0) return `<span class="perfect">${session.done}/${session.total}</span>`;
            return `<span>${session.done}/${session.total}</span>`;
        };

        const div = document.createElement('div');
        div.className = 'log-day';
        div.innerHTML = `
            <div class="log-date">${displayDate}</div>
            <div class="log-stats">
                <div style="margin-bottom: 4px;">☀️ AM: ${formatStat(log.AM)}</div>
                <div>🌙 PM: ${formatStat(log.PM)}</div>
            </div>
        `;
        container.appendChild(div);
    }
}

function startTimer(totalSeconds, event) {
    event.stopPropagation();
    clearInterval(timerInterval);
    let timeLeft = totalSeconds;
    
    const bar = document.getElementById('active-timer-bar');
    const display = document.getElementById('timer-display');
    bar.classList.remove('hidden');

    const updateDisplay = () => {
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        display.innerText = `${m}:${s}`;
    };

    updateDisplay();
    
    timerInterval = setInterval(() => {
        timeLeft--;
        updateDisplay();
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            display.innerText = "Time's Up!";
            timerSound.play();
            if ("vibrate" in navigator) navigator.vibrate([500, 200, 500]);
            setTimeout(() => bar.classList.add('hidden'), 5000);
        }
    }, 1000);
}

document.getElementById('btn-stop-timer').addEventListener('click', () => {
    clearInterval(timerInterval);
    document.getElementById('active-timer-bar').classList.add('hidden');
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
    localStorage.setItem('startDate', document.getElementById('set-start-date').value);
    localStorage.setItem('phaseDays', document.getElementById('set-phase-days').value);
    alert('Settings Saved!');
    location.reload(); 
});

document.getElementById('btn-save-protocol').addEventListener('click', () => {
    try {
        const parsed = JSON.parse(document.getElementById('set-protocol-json').value);
        localStorage.setItem('customProtocol', JSON.stringify(parsed));
        protocolData = parsed;
        alert('Protocol Updated!');
        renderRoutine();
    } catch (e) {
        alert("JSON Format Error.\n\nError: " + e.message);
    }
});

renderRoutine();
