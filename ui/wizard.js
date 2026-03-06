// ExerciseApp/ui/wizard.js
import { state } from '../state.js';
import dataStore from '../dataStore.js';
import { navigateTo, showLoader, hideLoader } from './core.js';
import { renderMainScreen } from './screens/dashboard.js';
import { HOBBY_OPTIONS, MEDICAL_DIAGNOSIS_OPTIONS, RESTRICTION_OPTIONS } from './wizardCanonical.js';

let currentStep = 0;
let wizardAnswers = {};

const STEPS = [
    { id: 'start', title: 'Witaj', render: renderIntro },
    { id: 'p1', title: 'Mapa Ciała', render: renderP1 },
    { id: 'p2', title: 'Nasilenie', render: renderP2 },
    { id: 'p3', title: 'Charakter', render: renderP3 },
    { id: 'p4', title: 'Rozpoznanie zgłoszone', render: renderP4 },
    { id: 'p4b', title: 'Czerwone flagi', render: renderP4b },
    { id: 'p5', title: 'Co nasila?', render: renderP5 },
    { id: 'p6', title: 'Co pomaga?', render: renderP6 },
    { id: 'p7', title: 'Wpływ na życie', render: renderP7 },
    { id: 'p8', title: 'Tryb dnia', render: renderP8 },
    { id: 'p9', title: 'Aktywność', render: renderP9 },
    { id: 'p10', title: 'Sprzęt', render: renderP10 },
    { id: 'p11', title: 'Doświadczenie', render: renderP11 },
    { id: 'p12', title: 'Twój Kalendarz', render: renderP12 },
    { id: 'p13', title: 'Priorytety', render: renderP13 },
    { id: 'p14', title: 'Główny Cel', render: renderP14 },
    { id: 'p15', title: 'Cele Extra', render: renderP15 },
    { id: 'p16', title: 'Ograniczenia', render: renderP16 },
    { id: 'summary', title: 'Gotowe', render: renderSummary },
    { id: 'generating', title: 'Przetwarzanie', render: renderProcessing }
];

export function initWizard(forceStart = false) {
    if (state.settings.onboardingCompleted && !forceStart) return false;
    const saved = state.settings.wizardData || {};

    wizardAnswers = {
        pain_locations: saved.pain_locations || [],
        focus_locations: saved.focus_locations || [],
        pain_intensity: saved.pain_intensity !== undefined ? saved.pain_intensity : 0,
        pain_character: saved.pain_character || [],
        medical_diagnosis: saved.medical_diagnosis || [],
        red_flags: saved.red_flags || [],
        trigger_movements: saved.trigger_movements || [],
        relief_movements: saved.relief_movements || [],
        daily_impact: saved.daily_impact !== undefined ? saved.daily_impact : 0,
        work_type: saved.work_type || '',
        hobby: saved.hobby || [],
        equipment_available: saved.equipment_available || [],
        exercise_experience: saved.exercise_experience || '',
        schedule_pattern: saved.schedule_pattern || [1, 3, 5],
        target_session_duration_min: saved.target_session_duration_min || 30,
        session_component_weights: saved.session_component_weights || [],
        primary_goal: saved.primary_goal || '',
        secondary_goals: saved.secondary_goals || [],
        physical_restrictions: saved.physical_restrictions || []
    };

    wizardAnswers.hasPain = wizardAnswers.pain_locations.length > 0;

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

function getStepsToSkip() {
    if (wizardAnswers.pain_locations.length === 0) {
        return ['p2', 'p3', 'p4', 'p4b', 'p5', 'p6', 'p7'];
    }
    return [];
}

function calculateNextStep(current) {
    let next = current + 1;
    const skipIds = getStepsToSkip();
    while (next < STEPS.length && skipIds.includes(STEPS[next].id)) {
        resetSkippedStepData(STEPS[next].id);
        next++;
    }
    return next;
}

function calculatePrevStep(current) {
    let prev = current - 1;
    const skipIds = getStepsToSkip();
    while (prev >= 0 && skipIds.includes(STEPS[prev].id)) {
        prev--;
    }
    return prev;
}

function resetSkippedStepData(stepId) {
    switch (stepId) {
        case 'p2': wizardAnswers.pain_intensity = 0; break;
        case 'p3': wizardAnswers.pain_character = []; break;
        case 'p4': wizardAnswers.medical_diagnosis = ['none']; break;
        case 'p4b': wizardAnswers.red_flags = []; break;
        case 'p5': wizardAnswers.trigger_movements = []; break;
        case 'p6': wizardAnswers.relief_movements = []; break;
        case 'p7': wizardAnswers.daily_impact = 0; break;
    }
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
    closeBtn.innerHTML = '<svg width="20" height="20"><use href="#icon-close"/></svg>';
    closeBtn.onclick = () => { if (confirm("Przerwać konfigurację? Postęp zostanie utracony.")) closeWizardWithoutSaving(); };
    container.appendChild(closeBtn);

    const content = document.createElement('div');
    content.className = 'wizard-content wizard-content-layout';
    content.style.height = '100%';
    content.style.overflow = 'hidden';

    const isIntro = step.id === 'start';
    const isProcessing = step.id === 'generating';
    let navHTML = '';

    if (!isProcessing) {
        navHTML = `
        <div class="wizard-nav wizard-nav-container ${isIntro ? 'single-btn' : ''}" style="flex-shrink: 0; padding-top: 10px;">
            ${!isIntro ? '<button id="wiz-prev" class="nav-btn">Wstecz</button>' : ''}
            <button id="wiz-next" class="action-btn">${step.id === 'summary' ? 'Generuj Plan' : 'Dalej'}</button>
        </div>`;
    }

    content.innerHTML = `
        <div class="wizard-progress-bar" style="flex-shrink: 0; margin-bottom: 10px;">
            <div class="wizard-progress-fill" style="width: ${progressPct}%;"></div>
        </div>
        <h2 class="wizard-step-title" style="flex-shrink: 0; font-size: 1.5rem; margin-bottom: 5px;">${step.title}</h2>
        <div id="step-body" class="wizard-body-layout" style="flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column;"></div>
        ${navHTML}
    `;

    container.appendChild(content);

    const bodyContainer = content.querySelector('#step-body');
    await step.render(bodyContainer);

    const prevBtn = content.querySelector('#wiz-prev');
    const nextBtn = content.querySelector('#wiz-next');

    if (prevBtn) prevBtn.onclick = () => {
        currentStep = calculatePrevStep(currentStep);
        renderStep();
    };

    if (nextBtn) nextBtn.onclick = () => {
        wizardAnswers.hasPain = wizardAnswers.pain_locations.length > 0;

        if (validateStep(step.id)) {
            currentStep = calculateNextStep(currentStep);
            renderStep();
        } else {
            alert("Proszę wybrać przynajmniej jedną opcję, aby kontynuować.");
        }
    };
}

function validateStep(stepId) {
    switch (stepId) {
        case 'p1': return (wizardAnswers.pain_locations.length > 0 || wizardAnswers.focus_locations.length > 0);
        case 'p3': return wizardAnswers.pain_locations.length === 0 || wizardAnswers.pain_character.length > 0;
        case 'p4': return wizardAnswers.medical_diagnosis.length > 0;
        case 'p4b': return wizardAnswers.pain_locations.length === 0 || wizardAnswers.red_flags.length > 0;
        case 'p5': return wizardAnswers.pain_locations.length === 0 || wizardAnswers.trigger_movements.length > 0;
        case 'p6': return wizardAnswers.pain_locations.length === 0 || wizardAnswers.relief_movements.length > 0;
        case 'p8': return wizardAnswers.work_type !== '';
        case 'p9': return wizardAnswers.hobby.length > 0;
        case 'p10': return wizardAnswers.equipment_available.length > 0;
        case 'p11': return wizardAnswers.exercise_experience !== '';
        case 'p12': return wizardAnswers.schedule_pattern && wizardAnswers.schedule_pattern.length > 0;
        case 'p13': return wizardAnswers.session_component_weights.length > 0;
        case 'p14': return wizardAnswers.primary_goal !== '';
        case 'p15': return wizardAnswers.secondary_goals.length > 0;
        case 'p16': return wizardAnswers.physical_restrictions.length > 0;
        default: return true;
    }
}

function renderIntro(c) { c.innerHTML = `<p class="wizard-step-desc">Moduł <strong>Virtual Physio</strong> przeanalizuje Twoje odpowiedzi i przygotuje plan ćwiczeń.<br><br>Odpowiedz na kilka pytań, abyśmy mogli bezpiecznie dopasować trening do Twoich potrzeb.</p><div style="font-size:5rem; text-align:center; margin:2rem; animation: pulse-fade 2s infinite;">🧬</div>`; }

async function renderP1(c) {
    const initialMode = (wizardAnswers.pain_locations.length === 0 && wizardAnswers.focus_locations.length > 0) ? 'focus' : 'pain';
    const isInitialPain = initialMode === 'pain';

    c.className = "p1-container wizard-body-layout";
    c.style.display = "flex";
    c.style.flexDirection = "column";
    c.style.height = "100%";
    c.style.overflow = "hidden";
    c.style.justifyContent = "space-between";

    c.innerHTML = `
        <div class="p1-svg-wrapper" style="flex: 1; min-height: 0; position: relative; display: flex; justify-content: center; align-items: center; padding-bottom: 10px;">
            <div id="svg-placeholder" style="height: 100%; width: 100%; display: flex; justify-content: center;">
                Ładowanie...
            </div>
        </div>

        <div class="p1-controls-panel" style="flex-shrink: 0; background: rgba(255,255,255,0.08); border-top: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 16px; margin-bottom: 5px;">
            <div class="p1-legend" style="display: flex; gap: 20px; justify-content: center; margin-bottom: 12px; font-size: 0.85rem; font-weight: 600;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 10px; height: 10px; background: var(--danger-color); border-radius: 50%; display: inline-block;"></span> 
                    Ból / Uraz
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 10px; height: 10px; background: #3b82f6; border-radius: 50%; display: inline-block;"></span> 
                    Cel / Focus
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 8px 15px; border-radius: 12px;">
                <div id="tool-label" style="font-weight: 700; font-size: 0.95rem; color: #fff;">
                    ${isInitialPain ? '🖊️ Zaznaczam: BÓL' : '🖊️ Zaznaczam: CEL'}
                </div>
                
                <label class="switch-container" style="margin: 0;">
                    <div class="switch-wrapper">
                        <input type="checkbox" id="paint-tool-toggle" ${isInitialPain ? 'checked' : ''} class="switch-input">
                        <span class="slider-round"></span>
                        <span class="slider-knob"></span>
                    </div>
                </label>
            </div>
            
            <p style="text-align: center; font-size: 0.8rem; opacity: 0.6; margin: 8px 0 0 0;">
                Dotknij obszarów na modelu.
            </p>
        </div>
    `;

    const svgContent = `
    <svg viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg"
         style="height: 100%; width: auto; max-width: 100%; display: block;" preserveAspectRatio="xMidYMid meet">
      <defs>
        <style>
          .zone {
            fill: rgba(255,255,255,0.05);
            stroke: rgba(255,255,255,0.3);
            stroke-width: 1;
            cursor: pointer;
            transition: all 0.2s;
          }
          .zone:hover { stroke: #fff; fill: rgba(255,255,255,0.15); }
        </style>
      </defs>
      <g opacity="0.3" pointer-events="none" fill="#fff">
         <circle cx="100" cy="38" r="20" />
         <path d="M92 58 h16 v15 h-16 z" />
         <path d="M100 74 C80 74 70 85 68 130 C70 180 70 200 78 220 C85 235 115 235 122 220 C130 200 130 180 132 130 C130 85 120 74 100 74" />
         <path d="M62 230 L90 230 L90 350 L75 350 L62 230" />
         <path d="M138 230 L110 230 L110 350 L125 350 L138 230" />
         <rect x="52" y="98" width="16" height="110" rx="5" />
         <rect x="132" y="98" width="16" height="110" rx="5" />
      </g>
      <g id="zones">
        <rect id="cervical" class="zone" x="86" y="60" width="28" height="20" rx="5" data-label="Szyja"/>
        <path id="thoracic" class="zone" d="M80 85 C84 80 116 80 120 85 L116 145 C114 150 86 150 84 145 Z" data-label="Plecy (Góra)"/>
        <path id="low_back" class="zone" d="M84 148 C88 145 112 145 116 148 L114 185 C112 190 88 190 86 185 Z" data-label="Lędźwia"/>
        <path id="si_joint" class="zone" d="M100 188 L116 200 L100 215 L84 200 Z" data-label="Krzyż"/>
        <circle id="hip_left" class="zone" cx="74" cy="210" r="14" data-val="hip" data-label="Biodro L"/>
        <circle id="hip_right" class="zone" cx="126" cy="210" r="14" data-val="hip" data-label="Biodro P"/>
        <rect id="sciatica_left" class="zone" x="65" y="235" width="22" height="100" rx="5" data-val="sciatica" data-label="Noga L"/>
        <rect id="sciatica_right" class="zone" x="113" y="235" width="22" height="100" rx="5" data-val="sciatica" data-label="Noga P"/>
        <circle id="knee_left" class="zone" cx="76" cy="285" r="12" data-val="knee" data-label="Kolano L"/>
        <circle id="knee_right" class="zone" cx="124" cy="285" r="12" data-val="knee" data-label="Kolano P"/>
      </g>
    </svg>`;

    document.getElementById('svg-placeholder').innerHTML = svgContent;

    const updateVisuals = () => {
        c.querySelectorAll('.zone').forEach(el => {
            el.classList.remove('pain', 'focus');
            const val = el.dataset.val || el.id;

            if (wizardAnswers.pain_locations.includes(val)) {
                el.classList.add('pain');
            } else if (wizardAnswers.focus_locations.includes(val)) {
                el.classList.add('focus');
            }
        });
    };

    updateVisuals();

    const toggle = c.querySelector('#paint-tool-toggle');
    const label = c.querySelector('#tool-label');

    toggle.addEventListener('change', (e) => {
        label.textContent = e.target.checked ? '🖊️ Zaznaczam: BÓL' : '🖊️ Zaznaczam: CEL';
        label.style.color = e.target.checked ? 'var(--danger-color)' : '#3b82f6';
    });
    
    label.style.color = toggle.checked ? 'var(--danger-color)' : '#3b82f6';

    c.querySelectorAll('.zone').forEach(el => {
        el.addEventListener('click', () => {
            const val = el.dataset.val || el.id;
            const currentMode = toggle.checked ? 'pain' : 'focus';

            if (currentMode === 'pain') {
                if (wizardAnswers.pain_locations.includes(val)) {
                    wizardAnswers.pain_locations = wizardAnswers.pain_locations.filter(x => x !== val);
                } else {
                    wizardAnswers.pain_locations.push(val);
                    wizardAnswers.focus_locations = wizardAnswers.focus_locations.filter(x => x !== val);
                }
            } else {
                if (wizardAnswers.focus_locations.includes(val)) {
                    wizardAnswers.focus_locations = wizardAnswers.focus_locations.filter(x => x !== val);
                } else {
                    wizardAnswers.focus_locations.push(val);
                    wizardAnswers.pain_locations = wizardAnswers.pain_locations.filter(x => x !== val);
                }
            }
            updateVisuals();
        });
    });
}

function renderP2(c) {
    c.innerHTML = `
        <p class="wizard-step-desc">Poziom bólu (0-10)</p>
        <div class="pain-display-container">
            <div id="pain-val-display" class="pain-value-large">${wizardAnswers.pain_intensity}</div>
            <div class="pain-slider-wrapper">
                <input type="range" min="0" max="10" value="${wizardAnswers.pain_intensity}" style="width:100%;" id="pain-slider">
                <div class="pain-labels" style="display: flex; justify-content: space-between; width: 100%; margin-top: 5px; font-size: 0.8rem; opacity: 0.8; font-weight: 500;">
                    <span>🙂 Brak</span>
                    <span style="color: #ef4444;">😫 Ekstremalny</span>
                </div>
            </div>
        </div>`;
    c.querySelector('#pain-slider').addEventListener('input', (e) => {
        wizardAnswers.pain_intensity = parseInt(e.target.value);
        c.querySelector('#pain-val-display').textContent = wizardAnswers.pain_intensity;
    });
}

function renderP3(c) { renderMultiSelect(c, 'Jaki to rodzaj bólu?', [{ val: 'sharp', label: '🔪 Ostry / Kłujący' }, { val: 'dull', label: '🪨 Tępy / Uciskający' }, { val: 'burning', label: '🔥 Palący' }, { val: 'stiffness', label: '🪵 Sztywność' }, { val: 'radiating', label: '⚡ Promieniujący' }, { val: 'numbness', label: '🧊 Mrowienie' }], 'pain_character'); }

function renderP4(c) {
    const title = 'Czy masz rozpoznanie zgłoszone przez specjalistę?';
    const diagnosisTriggerMap = {
        'scoliosis': ['thoracic', 'low_back', 'cervical'],
        'disc_herniation': ['low_back', 'cervical', 'sciatica'],
        'stenosis': ['low_back', 'cervical'],
        'facet_syndrome': ['low_back', 'thoracic', 'cervical', 'si_joint'],
        'piriformis': ['sciatica', 'hip'],
        'chondromalacia': ['knee'],
        'meniscus_tear': ['knee'],
        'acl_rehab': ['knee'],
        'jumpers_knee': ['knee']
    };

    const allOptions = MEDICAL_DIAGNOSIS_OPTIONS;

    const currentPainZones = wizardAnswers.pain_locations;
    const filteredOptions = allOptions.filter(opt => {
        if (opt.val === 'none') return true;
        const requiredZones = diagnosisTriggerMap[opt.val];
        if (!requiredZones) return true;
        return requiredZones.some(zone => currentPainZones.includes(zone));
    });

    renderMultiSelect(c, title, filteredOptions, 'medical_diagnosis');
}


function renderP4b(c) {
    renderMultiSelect(c, 'Czy występuje coś z poniższych objawów alarmowych?', [
        { val: 'trauma_recent', label: '🚨 Świeży uraz / upadek + ból kręgosłupa' },
        { val: 'cauda_equina_symptoms', label: '🚨 Problemy z oddawaniem moczu/stolca lub drętwienie krocza' },
        { val: 'progressive_neuro_deficit', label: '🚨 Narastające osłabienie lub niedowład kończyny' },
        { val: 'unexplained_weight_loss_fever', label: '🚨 Niewyjaśniona utrata masy ciała / gorączka + ból' },
        { val: 'night_rest_pain_unrelenting', label: '🚨 Stały ból nocny, nieustępujący w spoczynku' },
        { val: 'none', label: '✅ Żadna z powyższych' }
    ], 'red_flags');
}

function renderP5(c) { renderMultiSelect(c, 'Kiedy ból się NASILA?', [{ val: 'bending_forward', label: 'Pochylanie do przodu' }, { val: 'bending_backward', label: 'Odchylanie w tył' }, { val: 'twisting', label: 'Skręty tułowia' }, { val: 'sitting', label: 'Długie siedzenie' }, { val: 'standing', label: 'Długie stanie' }, { val: 'walking', label: 'Chodzenie' }, { val: 'lying_back', label: 'Leżenie na plecach' }], 'trigger_movements'); }
function renderP6(c) { renderMultiSelect(c, 'Co przynosi ULGĘ?', [{ val: 'bending_forward', label: 'Lekki skłon / Zwinięcie' }, { val: 'bending_backward', label: 'Wyprostowanie' }, { val: 'lying_knees_bent', label: 'Leżenie z ugiętymi nogami' }, { val: 'walking', label: 'Rozchodzenie' }, { val: 'rest', label: 'Odpoczynek' }], 'relief_movements'); }

function renderP7(c) {
    c.innerHTML = `
        <p class="wizard-step-desc">Wpływ bólu na życie (0-10)</p>
        <div class="pain-display-container">
            <div id="impact-val-display" class="pain-value-large" style="color:var(--primary-color)">${wizardAnswers.daily_impact}</div>
            <div class="pain-slider-wrapper">
                <input type="range" min="0" max="10" value="${wizardAnswers.daily_impact}" style="width:100%;" id="impact-slider">
                <div class="pain-labels" style="display: flex; justify-content: space-between; width: 100%; margin-top: 5px; font-size: 0.8rem; opacity: 0.8; font-weight: 500;">
                    <span>Brak wpływu</span>
                    <span>Paraliżujący</span>
                </div>
            </div>
        </div>`;
    c.querySelector('#impact-slider').addEventListener('input', (e) => {
        wizardAnswers.daily_impact = parseInt(e.target.value);
        c.querySelector('#impact-val-display').textContent = wizardAnswers.daily_impact;
    });
}

function renderP8(c) { renderSingleSelect(c, 'Twój typowy dzień?', [{ val: 'sedentary', label: '🪑 Siedzący (Biuro)' }, { val: 'standing', label: '🧍 Stojący' }, { val: 'physical', label: '💪 Fizyczny' }, { val: 'mixed', label: '🔄 Mieszany' }], 'work_type'); }
function renderP9(c) { renderMultiSelect(c, 'Twoje aktywności?', HOBBY_OPTIONS, 'hobby'); }

function renderP10(c) {
    const uniqueEquipment = new Set(['Mata']);
    if (state.exerciseLibrary) {
        Object.values(state.exerciseLibrary).forEach(ex => {
            if (Array.isArray(ex.equipment)) {
                ex.equipment.forEach(item => {
                    const niceName = item.charAt(0).toUpperCase() + item.slice(1);
                    uniqueEquipment.add(niceName);
                });
            } else if (ex.equipment) {
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

function renderP12(c) {
    const days = [
        { label: 'Pn', val: 1 },
        { label: 'Wt', val: 2 },
        { label: 'Śr', val: 3 },
        { label: 'Cz', val: 4 },
        { label: 'Pt', val: 5 },
        { label: 'So', val: 6 },
        { label: 'Nd', val: 0 }
    ];

    let pattern = wizardAnswers.schedule_pattern || [];
    if (pattern.length === 0) pattern = [1, 3, 5];

    c.innerHTML = `
        <p class="wizard-step-desc">W które dni chcesz ćwiczyć?</p>
        <div class="p12-wrapper">
            <div class="day-selector-container">
                ${days.map(d => `
                    <div class="day-toggle ${pattern.includes(d.val) ? 'active' : ''}" data-val="${d.val}">
                        ${d.label}
                    </div>
                `).join('')}
            </div>
            <div class="wizard-step-hint">
                Wybrano: <strong id="days-count">${pattern.length}</strong> dni w tygodniu
            </div>
            <div class="form-group p12-slider-group">
                <label class="p12-label-row">
                    <span>Czas na sesję:</span>
                    <span id="dur-disp" class="dur-display">${wizardAnswers.target_session_duration_min} min</span>
                </label>
                <input type="range" min="15" max="60" step="5" value="${wizardAnswers.target_session_duration_min}" id="dur-slider" style="width: 100%;">
            </div>
        </div>
    `;

    const toggles = c.querySelectorAll('.day-toggle');
    const countDisplay = c.querySelector('#days-count');

    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const val = parseInt(toggle.dataset.val);
            if (pattern.includes(val)) {
                pattern = pattern.filter(d => d !== val);
                toggle.classList.remove('active');
            } else {
                pattern.push(val);
                toggle.classList.add('active');
            }
            pattern.sort();
            wizardAnswers.schedule_pattern = pattern;
            countDisplay.textContent = pattern.length;
        });
    });

    c.querySelector('#dur-slider').addEventListener('input', (e) => {
        wizardAnswers.target_session_duration_min = parseInt(e.target.value);
        c.querySelector('#dur-disp').textContent = e.target.value + " min";
    });
}

function renderP13(c) {
    renderMultiSelect(c, 'Priorytety treningowe?', [
        { val: 'mobility', label: '🤸 Mobilność' },
        { val: 'stability', label: '🧱 Stabilizacja' },
        { val: 'strength', label: '💪 Siła' },
        { val: 'conditioning', label: '🔥 Kondycja' },
        { val: 'breathing', label: '🌬️ Oddech' }
    ], 'session_component_weights');
}

function renderP14(c) {
    renderSingleSelect(c, 'Główny cel na 6 tygodni?', [
        { val: 'pain_relief', label: '💊 Redukcja bólu' },
        { val: 'fat_loss', label: '🔥 Redukcja tłuszczu' },
        { val: 'prevention', label: '🛡️ Zapobieganie' },
        { val: 'mobility', label: '🤸 Sprawność' },
        { val: 'sport_return', label: '🏆 Powrót do sportu' }
    ], 'primary_goal');
}

function renderP15(c) {
    renderMultiSelect(c, 'Cele dodatkowe?', [
        { val: 'posture', label: 'Prosta postawa' },
        { val: 'core_side', label: 'Talia / Boczny brzuch' },
        { val: 'energy', label: 'Więcej energii' },
        { val: 'strength', label: 'Siła ogólna' },
        { val: 'flexibility', label: 'Elastyczność' }
    ], 'secondary_goals');
}

function renderP16(c) {
    renderMultiSelect(c, 'Ograniczenia?', RESTRICTION_OPTIONS, 'physical_restrictions');
}

function renderSummary(c) {
    const painCount = wizardAnswers.pain_locations.length;
    const focusCount = wizardAnswers.focus_locations.length;

    let painSection = '';
    if (painCount > 0) {
        painSection = `
            <li style="color:var(--danger-color)">🔴 <strong>Ból:</strong> ${wizardAnswers.pain_locations.join(', ')}</li>
            <li>🤕 <strong>Nasilenie:</strong> ${wizardAnswers.pain_intensity}/10</li>
        `;
    } else {
        painSection = `<li>✅ <strong>Ból:</strong> Brak</li>`;
    }

    let focusSection = '';
    if (focusCount > 0) {
        focusSection = `<li style="color:#3b82f6">🔵 <strong>Cel:</strong> ${wizardAnswers.focus_locations.join(', ')}</li>`;
    }

    const hasRedFlags = Array.isArray(wizardAnswers.red_flags) && wizardAnswers.red_flags.some(flag => flag !== 'none');

    const dayLabels = { 1: 'Pn', 2: 'Wt', 3: 'Śr', 4: 'Cz', 5: 'Pt', 6: 'So', 0: 'Nd' };
    const pattern = wizardAnswers.schedule_pattern || [];
    const formattedDays = pattern.map(d => dayLabels[d]).join(', ');

    const oldGoal = state.settings.wizardData?.primary_goal;
    const newGoal = wizardAnswers.primary_goal;
    const isGoalChanged = state.settings.onboardingCompleted && oldGoal && oldGoal !== newGoal;

    let warningHTML = '';
    if (isGoalChanged) {
        const translateGoal = (g) => {
            const map = { 'pain_relief': 'Redukcja Bólu', 'fat_loss': 'Redukcja Tłuszczu', 'strength': 'Siła', 'mobility': 'Mobilność', 'prevention': 'Prewencja' };
            return map[g] || g;
        };

        warningHTML = `
        <div class="wizard-warning-box">
            <div class="warning-icon">⚠️</div>
            <div class="warning-content">
                <strong>Zmiana Celu Głównego</strong>
                <p>Zmieniasz cel z <span class="old-goal">${translateGoal(oldGoal)}</span> na <span class="new-goal">${translateGoal(newGoal)}</span>.</p>
                <p class="warning-sub">Twój obecny cykl treningowy (Faza i Liczniki) zostanie zresetowany, aby zbudować nową, bezpieczną progresję.</p>
            </div>
        </div>`;
    }

    c.innerHTML = `
    <div class="summary-box">
        <h3 class="summary-title">Analiza odpowiedzi</h3>
        <ul class="summary-list">
            ${painSection}
            ${focusSection}
            <li>🛠️ <strong>Sprzęt:</strong> ${wizardAnswers.equipment_available.join(', ')}</li>
            <li>🎯 <strong>Główny cel:</strong> ${wizardAnswers.primary_goal}</li>
            <li>📅 <strong>Dni:</strong> ${formattedDays || 'Brak'}</li>
            <li>⏱️ <strong>Czas:</strong> ${wizardAnswers.target_session_duration_min} min</li>
            <li>${hasRedFlags ? '🚨' : '✅'} <strong>Objawy alarmowe:</strong> ${hasRedFlags ? 'Wykryto (wymagana konsultacja)' : 'Brak'}</li>
        </ul>

        ${warningHTML}

        <p class="summary-footer">Na podstawie odpowiedzi system dobierze plan ćwiczeń do Twojego kalendarza i preferencji.</p>
    </div>`;
}

async function renderProcessing(c) {
    c.innerHTML = `
        <div class="processing-container">
            <div class="processing-spinner"></div>
            <div id="console-output" class="processing-log">Przetwarzanie danych...</div>
        </div>`;
    
    // ZMIANA: Usunięcie "Gotowe!" z fałszywej pętli
    const logs = [
        "Analiza odpowiedzi...",
        "Weryfikacja ograniczeń bezpieczeństwa...",
        "Dobór planu ćwiczeń...",
        "Wysyłanie zapytania..."
    ];
    
    const consoleDiv = c.querySelector('#console-output');
    let delay = 0;
    
    logs.forEach((log, index) => {
        setTimeout(() => {
            consoleDiv.textContent = log;
            if (index === logs.length - 1) { 
                setTimeout(() => finalizeGeneration(consoleDiv), 500); 
            }
        }, delay);
        delay += 800;
    });
}

async function finalizeGeneration(consoleDiv) {
    try {
        const hasRedFlags = Array.isArray(wizardAnswers.red_flags) && wizardAnswers.red_flags.some(flag => flag !== 'none');
        if (hasRedFlags) {
            const msg = 'Wykryto objawy alarmowe. Ze względów bezpieczeństwa plan nie został wygenerowany. Skonsultuj się pilnie z lekarzem lub fizjoterapeutą.';
            if (consoleDiv) {
                consoleDiv.textContent = `⛔ ${msg}`;
                consoleDiv.style.color = 'var(--danger-color)';
            }
            setTimeout(() => alert(msg), 150);
            return;
        }

        const payload = {
            ...wizardAnswers,
            secondsPerRep: state.settings.secondsPerRep || 6,
            restBetweenSets: state.settings.restBetweenSets || 30,
            restBetweenExercises: state.settings.restBetweenExercises || 30
        };

        // ZMIANA: Aktualizacja UI w trakcie czekania na serwer
        if(consoleDiv) consoleDiv.textContent = "Generowanie planu ćwiczeń...";

        await dataStore.generateDynamicPlan(payload);
        
        // ZMIANA: Sukces wyświetlany dopiero po zakończeniu requestu
        if(consoleDiv) {
            consoleDiv.textContent = "✅ Plan utworzony pomyślnie!";
            consoleDiv.style.color = "var(--success-color)";
        }

        // Opóźnienie zamknięcia, aby user zobaczył sukces
        setTimeout(() => {
            closeWizardWithoutSaving();
        }, 1500);

    } catch (e) {
        alert("Błąd generowania planu: " + e.message);
        currentStep--;
        renderStep();
    }
}

function renderMultiSelect(container, question, options, key) {
    container.innerHTML = `<p class="wizard-step-desc">${question}</p><div class="options-list"></div>`;
    const list = container.querySelector('.options-list');

    options.forEach(opt => {
        const isSel = wizardAnswers[key].includes(opt.val);
        const btn = document.createElement('div');
        btn.className = `option-btn ${isSel ? 'selected' : ''}`;
        btn.textContent = opt.label;

        btn.addEventListener('click', () => {
            const isNoneOpt = opt.val === 'none';

            if (isNoneOpt) {
                const wasSelected = btn.classList.contains('selected');
                list.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                wizardAnswers[key] = [];
                if (!wasSelected) {
                    btn.classList.add('selected');
                    wizardAnswers[key].push('none');
                }
                return;
            }

            wizardAnswers[key] = wizardAnswers[key].filter(x => x !== 'none');
            const noneOption = Array.from(list.querySelectorAll('.option-btn')).find(b => b.textContent.includes('Brak') || b.textContent.includes('Żadna'));
            if (noneOption) noneOption.classList.remove('selected');

            btn.classList.toggle('selected');
            if (btn.classList.contains('selected')) wizardAnswers[key].push(opt.val);
            else wizardAnswers[key] = wizardAnswers[key].filter(x => x !== opt.val);
        });

        list.appendChild(btn);
    });
}

function renderSingleSelect(container, question, options, key) { container.innerHTML = `<p class="wizard-step-desc">${question}</p><div class="options-list"></div>`; const list = container.querySelector('.options-list'); options.forEach(opt => { const isSel = wizardAnswers[key] === opt.val; const btn = document.createElement('div'); btn.className = `option-btn ${isSel ? 'selected' : ''}`; btn.textContent = opt.label; btn.addEventListener('click', () => { container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); wizardAnswers[key] = opt.val; }); list.appendChild(btn); }); }
