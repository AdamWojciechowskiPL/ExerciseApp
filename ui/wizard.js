// ui/wizard.js
import { state } from '../state.js';
import dataStore from '../dataStore.js';
import { navigateTo } from './core.js';
import { renderMainScreen } from './screens/dashboard.js';

let currentStep = 0;
let wizardData = {
    painZones: new Set(),
    equipment: new Set(['Mata']), 
    schedule: {}
};

const STEPS = [
    { id: 'intro', title: 'Kalibracja', render: renderIntro },
    { id: 'pain', title: 'Bio-Skaner', render: renderPainMap },
    { id: 'equip', title: 'Zbrojownia', render: renderEquipment },
    { id: 'time', title: 'Grafik', render: renderSchedule },
    { id: 'process', title: 'Analiza', render: renderProcessing }
];

export function initWizard(forceStart = false) {
    if (state.settings.onboardingCompleted && !forceStart) return false;

    wizardData.painZones = new Set(state.settings.painZones || []);
    
    wizardData.equipment = new Set();
    if (state.settings.equipment) {
        state.settings.equipment.forEach(e => {
            const clean = e.charAt(0).toUpperCase() + e.slice(1).toLowerCase();
            wizardData.equipment.add(clean);
        });
    } else {
        wizardData.equipment.add('Mata');
    }

    if (state.settings.schedule) wizardData.schedule = JSON.parse(JSON.stringify(state.settings.schedule));

    let wizardScreen = document.getElementById('wizard-screen');
    
    if (!wizardScreen) {
        wizardScreen = document.createElement('section');
        wizardScreen.id = 'wizard-screen';
        wizardScreen.className = 'screen';
        const main = document.querySelector('main') || document.body;
        main.appendChild(wizardScreen);
        
        const wizardContainer = document.createElement('div');
        wizardContainer.id = 'wizard-container';
        wizardScreen.appendChild(wizardContainer);
    }

    const header = document.querySelector('header');
    if (header) header.style.display = 'none';
    
    const bottomNav = document.getElementById('app-bottom-nav');
    if (bottomNav) bottomNav.style.display = 'none';
    
    wizardScreen.classList.add('active');
    
    currentStep = 0;
    renderStep();
    return true;
}

function closeWizardWithoutSaving() {
    const wizardScreen = document.getElementById('wizard-screen');
    if (wizardScreen) wizardScreen.classList.remove('active');
    
    const header = document.querySelector('header');
    if (header) header.style.display = '';
    
    const bottomNav = document.getElementById('app-bottom-nav');
    if (bottomNav && window.innerWidth <= 768) bottomNav.style.display = 'flex';

    renderMainScreen();
}

async function renderStep() {
    const container = document.getElementById('wizard-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const step = STEPS[currentStep];
    const content = document.createElement('div');
    content.className = 'wizard-content';
    
    const isSingleBtn = currentStep === 0;
    
    // FIX: Użycie <img> dla ikony zamykania
    content.innerHTML = `
        <button id="wiz-close" class="wizard-close-btn" title="Zakończ bez zapisu">
            <img src="/icons/close.svg" alt="X">
        </button>
        
        <h2 class="wizard-step-title">${step.title}</h2>
        <div id="step-body">
            <div style="text-align:center; padding:2rem;">Ładowanie...</div>
        </div>
        
        <div class="wizard-nav ${isSingleBtn ? 'single-btn' : ''}">
            ${!isSingleBtn ? '<button id="wiz-prev" class="nav-btn">Wstecz</button>' : ''}
            ${currentStep < STEPS.length - 1 ? '<button id="wiz-next" class="action-btn">Dalej</button>' : ''}
        </div>
    `;
    
    container.appendChild(content);
    
    const closeBtn = content.querySelector('#wiz-close');
    if (closeBtn) {
        closeBtn.onclick = () => {
            if (confirm("Czy na pewno chcesz przerwać konfigurację? Zmiany nie zostaną zapisane.")) {
                closeWizardWithoutSaving();
            }
        };
    }
    
    const bodyContainer = content.querySelector('#step-body');
    bodyContainer.innerHTML = ''; 
    await step.render(bodyContainer);

    const prevBtn = content.querySelector('#wiz-prev');
    const nextBtn = content.querySelector('#wiz-next');
    
    if (prevBtn) prevBtn.onclick = () => { currentStep--; renderStep(); };
    if (nextBtn) nextBtn.onclick = () => { currentStep++; renderStep(); };
}

function renderIntro(container) {
    container.innerHTML = `
        <p class="wizard-step-desc">
            Witaj w Aplikacji Treningowej.<br><br>
            Przeprowadzimy teraz krótką kalibrację, aby Asystent AI mógł przygotować plan idealnie dopasowany do Twojej anatomii, sprzętu i czasu.
        </p>
        <div style="font-size:5rem; margin:2rem; animation: pulse-fade 2s infinite;">🧬</div>
    `;
}

async function renderPainMap(container) {
    container.innerHTML = `
        <p class="wizard-step-desc">Gdzie czujesz dyskomfort? Zaznacz strefy, które wymagają <strong>naprawy i wzmocnienia</strong>.</p>
        <div class="body-map-container" id="svg-placeholder">
            Ładowanie modelu...
        </div>
        <p style="font-size:0.8rem; opacity:0.6; margin-top:1rem;">System dobierze ćwiczenia rehabilitacyjne dla tych obszarów.</p>
    `;

    try {
        const response = await fetch('/icons/body-map.svg');
        if (!response.ok) throw new Error("Błąd ładowania SVG");
        const svgText = await response.text();
        document.getElementById('svg-placeholder').innerHTML = svgText;
        
        wizardData.painZones.forEach(zone => {
            const el = container.querySelector(`[data-zone="${zone}"]`);
            if (el) el.classList.add('selected');
        });

        const zones = container.querySelectorAll('.spine-zone');
        zones.forEach(el => {
            el.addEventListener('click', () => {
                const zone = el.dataset.zone;
                if (wizardData.painZones.has(zone)) {
                    wizardData.painZones.delete(zone);
                    el.classList.remove('selected');
                } else {
                    wizardData.painZones.add(zone);
                    el.classList.add('selected');
                }
            });
        });

    } catch (e) {
        document.getElementById('svg-placeholder').innerHTML = "<p>Nie udało się załadować mapy ciała.</p>";
        console.error(e);
    }
}

function renderEquipment(container) {
    const uniqueEquipment = new Set(['Mata']); 
    const ignoredTerms = ['brak', 'none', 'masa własna', 'bodyweight', 'brak sprzętu', ''];

    if (state.exerciseLibrary) {
        Object.values(state.exerciseLibrary).forEach(ex => {
            if (ex.equipment) {
                const items = ex.equipment.split(',');
                items.forEach(rawItem => {
                    let item = rawItem.trim().toLowerCase();
                    if (!ignoredTerms.includes(item)) {
                        const niceName = item.charAt(0).toUpperCase() + item.slice(1);
                        uniqueEquipment.add(niceName);
                    }
                });
            }
        });
    }
    
    const sortedList = Array.from(uniqueEquipment).sort((a, b) => a.localeCompare(b));

    const gridHTML = sortedList.map(eq => {
        const isSelected = wizardData.equipment.has(eq);
        return `
            <div class="eq-card ${isSelected ? 'selected' : ''}" data-eq="${eq}">
                <div class="eq-name">${eq}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <p class="wizard-step-desc">Zaznacz, czym dysponujesz. Baza ćwiczeń zostanie przefiltrowana pod Twój sprzęt.</p>
        <div class="equipment-grid">${gridHTML}</div>
    `;

    container.querySelectorAll('.eq-card').forEach(card => {
        card.addEventListener('click', () => {
            const eq = card.dataset.eq;
            if (wizardData.equipment.has(eq)) {
                wizardData.equipment.delete(eq);
                card.classList.remove('selected');
            } else {
                wizardData.equipment.add(eq);
                card.classList.add('selected');
            }
        });
    });
}

function renderSchedule(container) {
    const days = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
    
    if (Object.keys(wizardData.schedule).length === 0) {
        days.forEach((_, i) => {
            wizardData.schedule[i] = { active: true, minutes: 45 };
        });
    }

    const rows = days.map((dayName, i) => {
        const daySettings = wizardData.schedule[i] || { active: true, minutes: 45 };
        const opacity = daySettings.active ? '1' : '0.3';
        const pointer = daySettings.active ? 'auto' : 'none';
        
        return `
            <div class="schedule-row">
                <div class="day-toggle ${daySettings.active ? 'active' : ''}" data-day="${i}">${dayName}</div>
                <div class="time-slider-wrapper" style="opacity:${opacity}; pointer-events:${pointer}">
                    <input type="range" class="time-input" data-day="${i}" min="15" max="90" step="5" value="${daySettings.minutes}">
                    <span class="time-val" id="val-${i}">${daySettings.minutes} min</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <p class="wizard-step-desc">Ustal swój grafik. System przesunie treningi z dni wolnych.</p>
        <div class="schedule-container">${rows}</div>
    `;

    container.querySelectorAll('.day-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const dayIndex = btn.dataset.day;
            const isActive = !btn.classList.contains('active');
            
            btn.classList.toggle('active');
            if (!wizardData.schedule[dayIndex]) wizardData.schedule[dayIndex] = { active: true, minutes: 45 };
            
            wizardData.schedule[dayIndex].active = isActive;
            
            const wrapper = btn.nextElementSibling;
            if (isActive) {
                wrapper.style.opacity = '1';
                wrapper.style.pointerEvents = 'auto';
            } else {
                wrapper.style.opacity = '0.3';
                wrapper.style.pointerEvents = 'none';
            }
        });
    });

    container.querySelectorAll('.time-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const dayIndex = e.target.dataset.day;
            const val = e.target.value;
            wizardData.schedule[dayIndex].minutes = parseInt(val, 10);
            document.getElementById(`val-${dayIndex}`).textContent = `${val} min`;
        });
    });
}

function renderProcessing(container) {
    container.innerHTML = `
        <div class="console-log" id="console-output"></div>
    `;
    
    const painList = Array.from(wizardData.painZones).map(z => {
        if(z === 'neck') return 'Szyja';
        if(z === 'lumbar') return 'Lędźwia';
        if(z === 'thoracic') return 'Piersiowy';
        if(z === 'hips') return 'Miednica';
        return z;
    }).join(', ');

    const logs = [
        "Inicjalizacja profilu...",
        `Strefy naprawcze: ${painList || 'Brak (Profilaktyka)'}...`,
        "Skanowanie bazy ćwiczeń...",
        `Dostępny sprzęt: ${wizardData.equipment.size} pozycji...`,
        "Optymalizacja planu tygodniowego...",
        "ZAPISYWANIE DANYCH..."
    ];

    const consoleDiv = container.querySelector('#console-output');
    let delay = 0;

    logs.forEach((log, index) => {
        setTimeout(() => {
            const p = document.createElement('div');
            p.className = 'log-line';
            p.textContent = `> ${log}`;
            consoleDiv.appendChild(p);
            consoleDiv.scrollTop = consoleDiv.scrollHeight;

            if (index === logs.length - 1) {
                setTimeout(finishWizard, 1200);
            }
        }, delay);
        delay += 800;
    });
}

async function finishWizard() {
    state.settings.onboardingCompleted = true;
    state.settings.painZones = Array.from(wizardData.painZones);
    state.settings.equipment = Array.from(wizardData.equipment);
    state.settings.schedule = wizardData.schedule;

    try {
        await dataStore.saveSettings();
    } catch (e) {
        console.error("Błąd zapisu ustawień w wizardzie:", e);
    }

    const wizardScreen = document.getElementById('wizard-screen');
    if (wizardScreen) wizardScreen.classList.remove('active');
    
    const header = document.querySelector('header');
    if (header) header.style.display = '';
    
    const bottomNav = document.getElementById('app-bottom-nav');
    if (bottomNav && window.innerWidth <= 768) bottomNav.style.display = 'flex';

    renderMainScreen();
}