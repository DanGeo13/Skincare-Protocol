// app.js

// 1. Initialize Settings
let settings = {
    startDate: localStorage.getItem('startDate') || new Date().toISOString().split('T')[0],
    amTime: localStorage.getItem('amTime') || '07:00',
    pmTime: localStorage.getItem('pmTime') || '19:00',
    phaseDays: parseInt(localStorage.getItem('phaseDays')) || 14
};

// Populate Settings UI
document.getElementById('set-start-date').value = settings.startDate;
document.getElementById('set-am-time').value = settings.amTime;
document.getElementById('set-pm-time').value = settings.pmTime;
document.getElementById('set-phase-days').value = settings.phaseDays;

function switchTab(tab) {
    document.getElementById('view-routine').classList.add('hidden');
    document.getElementById('view-settings').classList.add('hidden');
    document.getElementById('nav-routine').classList.remove('active');
    document.getElementById('nav-settings').classList.remove('active');
    
    document.getElementById(`view-${tab}`).classList.remove('hidden');
    document.getElementById(`nav-${tab}`).classList.add('active');
    if(tab === 'routine') renderRoutine();
}

function calculatePhase() {
    const start = new Date(settings.startDate);
    const now = new Date();
    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let phaseNum = Math.floor(diffDays / settings.phaseDays) + 1;
    if (phaseNum > 4) phaseNum = 4; // Cap at Phase 4
    return phaseNum;
}

function renderRoutine() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const dayOfWeek = now.toLocaleDateString('en-AU', { weekday: 'long' });
    
    // Determine AM or PM
    const pmSplit = parseInt(settings.pmTime.split(':')[0]);
    const isPM = currentHour >= pmSplit;
    
    const phaseNum = calculatePhase();
    const phaseData = PROTOCOL[phaseNum];
    
    document.getElementById('phase-badge').innerText = phaseData.name;
    document.getElementById('time-context').innerText = `${dayOfWeek} ${isPM ? 'Evening' : 'Morning'} Routine`;

    let routineSteps = [];

    if (!isPM) {
        routineSteps = phaseData.AM;
    } else {
        // Evening Logic
        const isRetrieveNight = ["Monday", "Wednesday", "Friday"].includes(dayOfWeek);
        
        if (phaseNum <= 2) {
            routineSteps = isRetrieveNight ? phaseData.PM_A : phaseData.PM_B;
        } else {
            // Phase 3 & 4 have specific weekend routines
            if (isRetrieveNight) {
                routineSteps = phaseData.PM_A;
            } else if (["Tuesday", "Thursday"].includes(dayOfWeek)) {
                routineSteps = phaseData.PM_B_TueThu;
            } else if (dayOfWeek === "Saturday") {
                routineSteps = phaseData.PM_B_Sat;
            } else if (dayOfWeek === "Sunday") {
                routineSteps = phaseData.PM_B_Sun;
            }
        }
    }

    // Add Modifiers (Red Light)
    if (isPM && phaseData.Modifiers && phaseData.Modifiers[dayOfWeek]) {
        routineSteps.push(phaseData.Modifiers[dayOfWeek]);
    }

    // Render HTML
    const container = document.getElementById('routine-container');
    container.innerHTML = '';
    
    routineSteps.forEach((step, index) => {
        const div = document.createElement('div');
        div.className = 'step';
        div.innerHTML = `<div class="step-number">${index + 1}</div><div>${step}</div>`;
        container.appendChild(div);
    });
}

// Save Settings
document.getElementById('btn-save-settings').addEventListener('click', () => {
    localStorage.setItem('startDate', document.getElementById('set-start-date').value);
    localStorage.setItem('amTime', document.getElementById('set-am-time').value);
    localStorage.setItem('pmTime', document.getElementById('set-pm-time').value);
    localStorage.setItem('phaseDays', document.getElementById('set-phase-days').value);
    
    settings = {
        startDate: localStorage.getItem('startDate'),
        amTime: localStorage.getItem('amTime'),
        pmTime: localStorage.getItem('pmTime'),
        phaseDays: parseInt(localStorage.getItem('phaseDays'))
    };
    alert('Settings Saved!');
    switchTab('routine');
});

// Initial Render
renderRoutine();

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

// Local Notifications
document.getElementById('btn-enable-notifs').addEventListener('click', async () => {
    const perm = await Notification.requestPermission();
    if(perm === 'granted') {
        alert("Notifications enabled! Note: For strict daily alarms on Android, pairing this app's logic with a 'Tasker' alert is recommended for bypass of battery-saving modes.");
    }
});