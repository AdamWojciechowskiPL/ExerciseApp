// ui/wizard.js
import { state } from '../state.js';
import dataStore from '../dataStore.js';
import { navigateTo, showLoader, hideLoader } from './core.js';
import { renderMainScreen } from './screens/dashboard.js';

let currentStep = 0;
let wizardAnswers = {};

const STEPS = [
    { id: 'start', title: 'Witaj', render: renderIntro },
    { id: 'p1', title: 'Mapa Bólu', render: renderP1 },
    { id: 'p2', title: 'Nasilenie', render: renderP2 },
    { id: 'p3', title: 'Charakter', render: renderP3 },
    { id: 'p4', title: 'Diagnoza', render: renderP4 },
    { id: 'p5', title: 'Co nasila?', render: renderP5 },
    { id: 'p6', title: 'Co pomaga?', render: renderP6 },
    { id: 'p7', title: 'Wpływ na życie', render: renderP7 },
    { id: 'p8', title: 'Tryb dnia', render: renderP8 },
    { id: 'p9', title: 'Aktywność', render: renderP9 },
    { id: 'p10', title: 'Sprzęt', render: renderP10 },
    { id: 'p11', title: 'Doświadczenie', render: renderP11 },
    { id: 'p12', title: 'Czas', render: renderP12 },
    { id: 'p13', title: 'Priorytety', render: renderP13 },
    { id: 'p14', title: 'Główny Cel', render: renderP14 },
    { id: 'p15', title: 'Cele Extra', render: renderP15 },
    { id: 'p16', title: 'Ograniczenia', render: renderP16 },
    { id: 'summary', title: 'Gotowe', render: renderSummary },
    { id: 'generating', title: 'Analiza', render: renderProcessing }
];

export function initWizard(forceStart = false) {
    if (state.settings.onboardingCompleted && !forceStart) return false;
    const saved = state.settings.wizardData || {};
    wizardAnswers = {
        pain_locations: saved.pain_locations || [],
        pain_intensity: saved.pain_intensity !== undefined ? saved.pain_intensity : 0,
        pain_character: saved.pain_character || [],
        medical_diagnosis: saved.medical_diagnosis || [],
        trigger_movements: saved.trigger_movements || [],
        relief_movements: saved.relief_movements || [],
        daily_impact: saved.daily_impact !== undefined ? saved.daily_impact : 0,
        work_type: saved.work_type || '',
        hobby: saved.hobby || [],
        equipment_available: saved.equipment_available || [''],
        exercise_experience: saved.exercise_experience || '',
        sessions_per_week: saved.sessions_per_week || 3,
        target_session_duration_min: saved.target_session_duration_min || 30,
        session_component_weights: saved.session_component_weights || [],
        primary_goal: saved.primary_goal || '',
        secondary_goals: saved.secondary_goals || [],
        physical_restrictions: saved.physical_restrictions || []
    };
    let wizardScreen = document.getElementById('wizard-screen');
    if (!wizardScreen) {
        wizardScreen = document.createElement('section');
        wizardScreen.id = 'wizard-screen';
        wizardScreen.className = 'screen';
        document.querySelector('main').appendChild(wizardScreen);
        const wizardContainer = document.createElement('div');
        wizardContainer.id = 'wizard-container';
        wizardScreen.appendChild(wizardContainer);
    }
    document.querySelector('header').style.display = 'none';
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
    document.querySelector('header').style.display = '';
    const bottomNav = document.getElementById('app-bottom-nav');
    if (bottomNav && window.innerWidth <= 768) bottomNav.style.display = 'flex';
    renderMainScreen();
}

async function renderStep() {
    const container = document.getElementById('wizard-container');
    if (!container) return;
    container.innerHTML = '';
    const step = STEPS[currentStep];
    const progressPct = Math.round(((currentStep) / (STEPS.length - 1)) * 100);
    const closeBtn = document.createElement('button');
    closeBtn.id = 'wiz-close';
    closeBtn.className = 'wizard-close-btn';
    closeBtn.title = 'Zamknij';
    closeBtn.innerHTML = '<img src="/icons/close.svg" alt="X" style="width:20px; height:20px;">';
    closeBtn.onclick = () => { if (confirm("Przerwać konfigurację? Postęp zostanie utracony.")) closeWizardWithoutSaving(); };
    container.appendChild(closeBtn);
    const content = document.createElement('div');
    content.className = 'wizard-content';
    const isIntro = step.id === 'start';
    const isProcessing = step.id === 'generating';
    let navHTML = '';
    if (!isProcessing) {
        navHTML = `
        <div class="wizard-nav ${isIntro ? 'single-btn' : ''}">
            ${!isIntro ? '<button id="wiz-prev" class="nav-btn">Wstecz</button>' : ''}
            <button id="wiz-next" class="action-btn">${step.id === 'summary' ? 'Generuj Plan' : 'Dalej'}</button>
        </div>`;
    }
    content.innerHTML = `<div class="wizard-progress-bar"><div class="wizard-progress-fill" style="width: ${progressPct}%;"></div></div><h2 class="wizard-step-title">${step.title}</h2><div id="step-body"></div>${navHTML}`;
    container.appendChild(content);
    const bodyContainer = content.querySelector('#step-body');
    await step.render(bodyContainer);
    const prevBtn = content.querySelector('#wiz-prev');
    const nextBtn = content.querySelector('#wiz-next');
    if (prevBtn) prevBtn.onclick = () => { currentStep--; renderStep(); };
    if (nextBtn) nextBtn.onclick = () => {
        if (validateStep(step.id)) { currentStep++; renderStep(); } else { alert("Proszę wybrać przynajmniej jedną opcję, aby kontynuować."); }
    };
}

function validateStep(stepId) {
    switch (stepId) {
        case 'p1': return wizardAnswers.pain_locations.length > 0;
        case 'p3': return wizardAnswers.pain_character.length > 0;
        case 'p4': return wizardAnswers.medical_diagnosis.length > 0;
        case 'p5': return wizardAnswers.trigger_movements.length > 0;
        case 'p6': return wizardAnswers.relief_movements.length > 0;
        case 'p8': return wizardAnswers.work_type !== '';
        case 'p9': return wizardAnswers.hobby.length > 0;
        case 'p10': return wizardAnswers.equipment_available.length > 0;
        case 'p11': return wizardAnswers.exercise_experience !== '';
        case 'p13': return wizardAnswers.session_component_weights.length > 0;
        case 'p14': return wizardAnswers.primary_goal !== '';
        case 'p15': return wizardAnswers.secondary_goals.length > 0;
        case 'p16': return wizardAnswers.physical_restrictions.length > 0;
        default: return true;
    }
}

function renderIntro(c) { c.innerHTML = `<p class="wizard-step-desc">Algorytm <strong>Virtual Physio</strong> przygotuje dla Ciebie plan rehabilitacyjno-treningowy.<br><br>Odpowiedz na kilka pytań, abyśmy mogli dopasować ćwiczenia do Twojego bólu i możliwości.</p><div style="font-size:5rem; text-align:center; margin:2rem; animation: pulse-fade 2s infinite;">🧬</div>`; }
async function renderP1(c) {
    c.innerHTML = `<p class="wizard-step-desc">Gdzie czujesz ból? Dotknij obszaru na modelu.</p><div class="body-map-container" id="svg-placeholder" style="flex-grow:1; display:flex; justify-content:center;">Ładowanie...</div>`;
    const svgContent = `<svg viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" style="height:100%; max-height:50vh;"><circle cx="100" cy="40" r="25" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" /><path id="cervical" class="zone" d="M85 65 L115 65 L115 85 L85 85 Z" data-label="Szyja"/><path id="thoracic" class="zone" d="M80 85 L120 85 L115 145 L85 145 Z" data-label="Górne plecy"/><path id="lumbar_general" class="zone" d="M85 145 L115 145 L115 175 L85 175 Z" data-label="Dolne plecy"/><path id="si_joint" class="zone" d="M85 175 L115 175 L100 195 Z" data-label="Staw Krzyżowo-Biodrowy"/><circle id="hip_left" class="zone" cx="70" cy="185" r="15" data-val="hip"/><circle id="hip_right" class="zone" cx="130" cy="185" r="15" data-val="hip"/><rect id="sciatica_left" class="zone" x="65" y="210" width="25" height="120" rx="10" data-val="sciatica"/><rect id="sciatica_right" class="zone" x="110" y="210" width="25" height="120" rx="10" data-val="sciatica"/></svg>`;
    document.getElementById('svg-placeholder').innerHTML = svgContent;
    wizardAnswers.pain_locations.forEach(loc => { const els = c.querySelectorAll(`[id="${loc}"], [data-val="${loc}"]`); els.forEach(el => el.classList.add('selected')); });
    c.querySelectorAll('.zone').forEach(el => {
        el.addEventListener('click', () => {
            const val = el.dataset.val || el.id;
            const allRelated = c.querySelectorAll(`[id="${val}"], [data-val="${val}"]`);
            const isSelected = el.classList.contains('selected');
            if (isSelected) { allRelated.forEach(e => e.classList.remove('selected')); wizardAnswers.pain_locations = wizardAnswers.pain_locations.filter(x => x !== val); }
            else { allRelated.forEach(e => e.classList.add('selected')); if (!wizardAnswers.pain_locations.includes(val)) wizardAnswers.pain_locations.push(val); }
        });
    });
}
function renderP2(c) { c.innerHTML = `<p class="wizard-step-desc">Poziom bólu (0-10)</p><div style="padding:2rem 0; text-align:center;"><div id="pain-val-display" style="font-size:4rem; font-weight:800; color:var(--danger-color); text-shadow:0 0 20px rgba(231,111,81,0.4);">${wizardAnswers.pain_intensity}</div><input type="range" min="0" max="10" value="${wizardAnswers.pain_intensity}" style="width:100%; margin-top:2rem;" id="pain-slider"><div style="display:flex; justify-content:space-between; opacity:0.6; font-size:0.8rem; margin-top:10px;"><span>Brak</span><span>Ekstremalny</span></div></div>`; c.querySelector('#pain-slider').addEventListener('input', (e) => { wizardAnswers.pain_intensity = parseInt(e.target.value); c.querySelector('#pain-val-display').textContent = wizardAnswers.pain_intensity; }); }
function renderP3(c) { renderMultiSelect(c, 'Jaki to rodzaj bólu?', [{ val: 'sharp', label: '🔪 Ostry / Kłujący' }, { val: 'dull', label: '🪨 Tępy / Uciskający' }, { val: 'burning', label: '🔥 Palący' }, { val: 'stiffness', label: '🪵 Sztywność' }, { val: 'radiating', label: '⚡ Promieniujący do nogi' }, { val: 'numbness', label: '🧊 Mrowienie / Drętwienie' }], 'pain_character'); }
function renderP4(c) { renderMultiSelect(c, 'Czy masz diagnozę lekarską?', [{ val: 'scoliosis', label: 'Skolioza' }, { val: 'disc_herniation', label: 'Dyskopatia / Przepuklina' }, { val: 'stenosis', label: 'Stenoza kanału' }, { val: 'facet_syndrome', label: 'Stawy międzykręgowe' }, { val: 'piriformis', label: 'Mięsień gruszkowaty' }, { val: 'none', label: 'Brak diagnozy' }], 'medical_diagnosis'); }
function renderP5(c) { renderMultiSelect(c, 'Kiedy ból się NASILA?', [{ val: 'bending_forward', label: 'Pochylanie do przodu' }, { val: 'bending_backward', label: 'Odchylanie w tył' }, { val: 'twisting', label: 'Skręty tułowia' }, { val: 'sitting', label: 'Długie siedzenie' }, { val: 'standing', label: 'Długie stanie' }, { val: 'walking', label: 'Chodzenie' }, { val: 'lying_back', label: 'Leżenie na plecach' }], 'trigger_movements'); }
function renderP6(c) { renderMultiSelect(c, 'Co przynosi ULGĘ?', [{ val: 'bending_forward', label: 'Lekki skłon / Zwinięcie się' }, { val: 'bending_backward', label: 'Wyprostowanie się' }, { val: 'lying_knees_bent', label: 'Leżenie z ugiętymi nogami' }, { val: 'walking', label: 'Rozchodzenie' }, { val: 'rest', label: 'Odpoczynek' }], 'relief_movements'); }
function renderP7(c) { c.innerHTML = `<p class="wizard-step-desc">Wpływ bólu na życie (0-10)</p><div style="padding:2rem 0; text-align:center;"><div id="impact-val-display" style="font-size:4rem; font-weight:800; color:var(--primary-color);">${wizardAnswers.daily_impact}</div><input type="range" min="0" max="10" value="${wizardAnswers.daily_impact}" style="width:100%; margin-top:2rem;" id="impact-slider"></div>`; c.querySelector('#impact-slider').addEventListener('input', (e) => { wizardAnswers.daily_impact = parseInt(e.target.value); c.querySelector('#impact-val-display').textContent = wizardAnswers.daily_impact; }); }
function renderP8(c) { renderSingleSelect(c, 'Twój typowy dzień?', [{ val: 'sedentary', label: '🪑 Siedzący (Biuro)' }, { val: 'standing', label: '🧍 Stojący' }, { val: 'physical', label: '💪 Fizyczny' }, { val: 'mixed', label: '🔄 Mieszany' }], 'work_type'); }
function renderP9(c) { renderMultiSelect(c, 'Twoje aktywności?', [{ val: 'cycling', label: '🚴 Rower' }, { val: 'running', label: '🏃 Bieganie' }, { val: 'swimming', label: '🏊 Pływanie' }, { val: 'gym', label: '🏋️ Siłownia' }, { val: 'yoga', label: '🧘 Joga' }, { val: 'walking', label: '🚶 Spacery' }, { val: 'none', label: '❌ Brak' }], 'hobby'); }

function renderP10(c) {
    const uniqueEquipment = new Set(['Mata']);
    if (state.exerciseLibrary) {
        Object.values(state.exerciseLibrary).forEach(ex => {
            // ZMIANA: equipment jest tablicą, iterujemy po niej bezpośrednio
            if (Array.isArray(ex.equipment)) {
                ex.equipment.forEach(item => {
                    const niceName = item.charAt(0).toUpperCase() + item.slice(1);
                    uniqueEquipment.add(niceName);
                });
            } else if (ex.equipment) {
                // Fallback dla stringa (stary kod)
                ex.equipment.split(',').forEach(rawItem => {
                    let item = rawItem.trim();
                    if (item && !['brak', 'none', 'brak sprzętu', 'masa własna', 'bodyweight', ''].includes(item.toLowerCase())) {
                        const niceName = item.charAt(0).toUpperCase() + item.slice(1);
                        uniqueEquipment.add(niceName);
                    }
                });
            }
        });
    }
    const sortedList = Array.from(uniqueEquipment).sort((a, b) => a.localeCompare(b));
    c.innerHTML = `<p class="wizard-step-desc">Co masz w domu?</p><div class="equipment-grid"></div>`;
    const grid = c.querySelector('.equipment-grid');
    sortedList.forEach(eq => {
        const isSel = wizardAnswers.equipment_available.includes(eq);
        const el = document.createElement('div');
        el.className = `eq-card ${isSel ? 'selected' : ''}`;
        el.innerHTML = `<span class="eq-name">${eq}</span>`;
        el.addEventListener('click', () => {
            el.classList.toggle('selected');
            if (el.classList.contains('selected')) { wizardAnswers.equipment_available.push(eq); } else { wizardAnswers.equipment_available = wizardAnswers.equipment_available.filter(x => x !== eq); }
        });
        grid.appendChild(el);
    });
}

function renderP11(c) { renderSingleSelect(c, 'Doświadczenie w treningu?', [{ val: 'none', label: 'Początkujący (0)' }, { val: 'occasional', label: 'Okazjonalne' }, { val: 'regular', label: 'Regularne (2+/tydz)' }, { val: 'advanced', label: 'Zaawansowane' }], 'exercise_experience'); }
function renderP12(c) { c.innerHTML = `<p class="wizard-step-desc">Ile masz czasu?</p><div style="padding: 0 10px;"><div class="form-group" style="margin-bottom:2.5rem;"><label style="display:flex; justify-content:space-between; margin-bottom:10px;"><span>Sesji w tygodniu:</span><span id="freq-disp" style="font-weight:bold; color:var(--gold-color); min-width: 20px; text-align: right;">${wizardAnswers.sessions_per_week}</span></label><input type="range" min="2" max="7" value="${wizardAnswers.sessions_per_week}" id="freq-slider" style="width: 100%;"></div><div class="form-group"><label style="display:flex; justify-content:space-between; margin-bottom:10px;"><span>Czas na sesję:</span><span id="dur-disp" style="font-weight:bold; color:var(--gold-color); min-width: 60px; text-align: right;">${wizardAnswers.target_session_duration_min} min</span></label><input type="range" min="15" max="60" step="5" value="${wizardAnswers.target_session_duration_min}" id="dur-slider" style="width: 100%;"></div></div>`; c.querySelector('#freq-slider').addEventListener('input', (e) => { wizardAnswers.sessions_per_week = parseInt(e.target.value); c.querySelector('#freq-disp').textContent = e.target.value; }); c.querySelector('#dur-slider').addEventListener('input', (e) => { wizardAnswers.target_session_duration_min = parseInt(e.target.value); c.querySelector('#dur-disp').textContent = e.target.value + " min"; }); }
function renderP13(c) { renderMultiSelect(c, 'Priorytety treningowe?', [{ val: 'mobility', label: '🤸 Mobilność' }, { val: 'stability', label: '🧱 Stabilizacja' }, { val: 'strength', label: '💪 Siła' }, { val: 'breathing', label: '🌬️ Oddech / Relaks' }], 'session_component_weights'); }
function renderP14(c) { renderSingleSelect(c, 'Główny cel na 6 tygodni?', [{ val: 'pain_relief', label: '💊 Redukcja bólu' }, { val: 'prevention', label: '🛡️ Zapobieganie' }, { val: 'mobility', label: '🤸 Sprawność' }, { val: 'sport_return', label: '🏆 Powrót do sportu' }], 'primary_goal'); }
function renderP15(c) { renderMultiSelect(c, 'Cele dodatkowe?', [{ val: 'posture', label: 'Prosta postawa' }, { val: 'energy', label: 'Więcej energii' }, { val: 'strength', label: 'Siła ogólna' }, { val: 'flexibility', label: 'Elastyczność' }], 'secondary_goals'); }
function renderP16(c) { renderMultiSelect(c, 'Ograniczenia?', [{ val: 'foot_injury', label: '🦶 Uraz stopy (bez obciążania)' }, { val: 'no_kneeling', label: 'Nie mogę klęczeć' }, { val: 'no_floor_sitting', label: 'Nie usiądę na podłodze' }, { val: 'no_twisting', label: 'Ból przy skrętach' }, { val: 'no_high_impact', label: 'Zakaz skoków' }, { val: 'none', label: 'Brak' }], 'physical_restrictions'); }
function renderSummary(c) { c.innerHTML = `<div style="text-align:left; font-size:0.95rem; background:rgba(255,255,255,0.05); padding:1.5rem; border-radius:12px;"><h3 style="margin-top:0; color:var(--gold-color);">Twój Profil</h3><ul style="list-style:none; padding:0; line-height:1.8;"><li>📍 <strong>Ból:</strong> ${wizardAnswers.pain_locations.length > 0 ? wizardAnswers.pain_locations.join(', ') : 'Brak'} (${wizardAnswers.pain_intensity}/10)</li><li>🛠️ <strong>Sprzęt:</strong> ${wizardAnswers.equipment_available.join(', ')}</li><li>🎯 <strong>Cel:</strong> ${wizardAnswers.primary_goal}</li><li>📅 <strong>Plan:</strong> ${wizardAnswers.sessions_per_week}x w tygodniu</li><li>⏱️ <strong>Czas:</strong> ${wizardAnswers.target_session_duration_min} min</li></ul><p style="margin-top:1.5rem; opacity:0.8; font-size:0.85rem;">Asystent AI przeanalizuje te dane i ułoży spersonalizowany plan tygodniowy.</p></div>`; }
async function renderProcessing(c) { c.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;"><div style="width:50px; height:50px; border:4px solid var(--gold-color); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; margin-bottom:20px;"></div><div id="console-output" style="font-family:monospace; color:var(--accent-color); font-size:0.9rem;">Analiza danych...</div></div><style>@keyframes spin { to { transform: rotate(360deg); } }</style>`; const consoleDiv = c.querySelector('#console-output'); const logs = ["Mapowanie stref...", "Analiza sprzętu...", "Wybór ćwiczeń...", "Optymalizacja...", "Gotowe!"]; let delay = 0; logs.forEach((log, index) => { setTimeout(() => { consoleDiv.textContent = log; if (index === logs.length - 1) { setTimeout(finalizeGeneration, 500); } }, delay); delay += 800; }); }
async function finalizeGeneration() { try { await dataStore.generateDynamicPlan(wizardAnswers); closeWizardWithoutSaving(); } catch (e) { alert("Błąd generowania planu: " + e.message); currentStep--; renderStep(); } }
function renderMultiSelect(container, question, options, key) { container.innerHTML = `<p class="wizard-step-desc">${question}</p><div class="options-list"></div>`; const list = container.querySelector('.options-list'); options.forEach(opt => { const isSel = wizardAnswers[key].includes(opt.val); const btn = document.createElement('div'); btn.className = `option-btn ${isSel ? 'selected' : ''}`; btn.textContent = opt.label; btn.addEventListener('click', () => { btn.classList.toggle('selected'); if (btn.classList.contains('selected')) { wizardAnswers[key].push(opt.val); } else { wizardAnswers[key] = wizardAnswers[key].filter(x => x !== opt.val); } }); list.appendChild(btn); }); }
function renderSingleSelect(container, question, options, key) { container.innerHTML = `<p class="wizard-step-desc">${question}</p><div class="options-list"></div>`; const list = container.querySelector('.options-list'); options.forEach(opt => { const isSel = wizardAnswers[key] === opt.val; const btn = document.createElement('div'); btn.className = `option-btn ${isSel ? 'selected' : ''}`; btn.textContent = opt.label; btn.addEventListener('click', () => { container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); wizardAnswers[key] = opt.val; }); list.appendChild(btn); }); }