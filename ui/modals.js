// js/ui/modals.js
import { state } from '../state.js';
import dataStore from '../dataStore.js';
import { processSVG } from '../utils.js';
import { buildClinicalContext, checkExerciseAvailability } from '../clinicalEngine.js';

// --- NOWOŚĆ: MODAL PRZENOSZENIA DNIA ---
export function renderMoveDayModal(availableTargets, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const datesHtml = availableTargets.map(d => {
        const dateObj = new Date(d.date);
        const dayName = dateObj.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'short' });
        return `
            <button class="target-date-btn" data-date="${d.date}">
                📅 ${dayName}
            </button>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="swap-modal">
            <h3>Przenieś trening</h3>
            <p style="font-size:0.9rem; color:#666; margin-bottom:1rem;">Wybierz dzień wolny, na który chcesz przenieść ten trening:</p>
            <div class="target-dates-list" style="display:flex; flex-direction:column; gap:8px; max-height:300px; overflow-y:auto;">
                ${datesHtml}
            </div>
            <button id="cancel-move" class="nav-btn" style="margin-top:1.5rem; width:100%;">Anuluj</button>
        </div>
        <style>
            .target-date-btn {
                background: #f8f9fa; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px;
                text-align: left; font-weight: 600; cursor: pointer; transition: all 0.2s;
                color: var(--text-color);
            }
            .target-date-btn:hover {
                background: #e0f2fe; border-color: var(--primary-color);
            }
        </style>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.target-date-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            onConfirm(btn.dataset.date);
            overlay.remove();
        });
    });

    overlay.querySelector('#cancel-move').addEventListener('click', () => overlay.remove());
}

export function renderSwapModal(currentExercise, onConfirm) {
    const currentId = currentExercise.id || currentExercise.exerciseId;
    let categoryId = currentExercise.categoryId;
    const libraryExercise = state.exerciseLibrary[currentId];

    if (!categoryId && libraryExercise) categoryId = libraryExercise.categoryId;
    if (!categoryId) { alert("Błąd danych: brak kategorii."); return; }

    const wizardData = state.settings.wizardData;
    let clinicalCtx = null;

    if (wizardData) {
        clinicalCtx = buildClinicalContext(wizardData);
        if (clinicalCtx) {
            clinicalCtx.blockedIds = new Set(state.blacklist || []);
        }
    }

    const alternatives = Object.entries(state.exerciseLibrary)
        .map(([id, data]) => ({ id, ...data }))
        .filter(ex => {
            if (ex.categoryId !== categoryId) return false;
            if (String(ex.id) === String(currentId)) return false;
            if (clinicalCtx) {
                const result = checkExerciseAvailability(ex, clinicalCtx, {
                    ignoreEquipment: false,
                    strictSeverity: true,
                    ignoreDifficulty: false
                });
                return result.allowed;
            }
            return true;
        });

    if (alternatives.length === 0) {
        alert(`Brak bezpiecznych alternatyw dla kategorii "${categoryId}".`);
        return;
    }

    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';

    const altsHtml = alternatives.map(alt => `
        <div class="alt-exercise-card" data-id="${alt.id}">
            <div class="alt-info">
                <h4>${alt.name}</h4>
                <p><span class="alt-badge">Lvl ${alt.difficultyLevel || 1}</span> ${alt.equipment || 'Brak sprzętu'}</p>
            </div>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div class="swap-modal">
            <h3>Wymień: ${currentExercise.name || libraryExercise?.name}</h3>
            <p style="font-size:0.85rem; color:#666;">Kategoria: ${categoryId}</p>
            <div class="swap-options-list">${altsHtml}</div>
            <div class="swap-actions">
                <div style="font-size:0.85rem; font-weight:bold;">Tryb wymiany:</div>
                <div class="swap-type-toggle">
                    <button class="toggle-btn active" data-type="today">Tylko dziś</button>
                    <button class="toggle-btn" data-type="blacklist">🚫 Nie lubię</button>
                </div>

                <div style="display:flex; gap:10px; margin-top:1.5rem;">
                    <button id="cancel-swap" class="nav-btn" style="flex:1; padding: 0.8rem; justify-content: center; height: auto;">Anuluj</button>
                    <button id="confirm-swap" class="action-btn" style="flex:1; margin-top: 0;" disabled>Wymień</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let selectedAltId = null;
    let swapType = 'today';

    const cards = overlay.querySelectorAll('.alt-exercise-card');
    const confirmBtn = overlay.querySelector('#confirm-swap');
    const toggleBtns = overlay.querySelectorAll('.toggle-btn');

    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedAltId = card.dataset.id;
            confirmBtn.disabled = false;
        });
    });

    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            swapType = btn.dataset.type;
        });
    });

    overlay.querySelector('#cancel-swap').addEventListener('click', () => overlay.remove());
    confirmBtn.addEventListener('click', () => {
        if (selectedAltId) {
            onConfirm({ id: selectedAltId, ...state.exerciseLibrary[selectedAltId] }, swapType);
            overlay.remove();
        }
    });
}

export function renderPreviewModal(svgContent, title) {
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    const cleanSvg = processSVG(svgContent);

    overlay.innerHTML = `
        <div class="swap-modal" style="align-items: center; text-align: center;">
            <h3>${title}</h3>
            <div style="width: 100%; max-width: 300px; margin: 1rem 0;">${cleanSvg}</div>
            <button id="close-preview" class="nav-btn" style="width: 100%">Zamknij</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#close-preview').addEventListener('click', () => overlay.remove());
}

export function renderEvolutionModal(adaptation, onCheck) {
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    const isEvo = adaptation.type === 'evolution';

    const config = isEvo
        ? { title: "Ewolucja!", desc: "Twoja stabilność osiągnęła 100%. System odblokował trudniejszy wariant.", icon: "🏆", color: "var(--gold-color)", btnText: "Przyjmuję Wyzwanie" }
        : { title: "Korekta", desc: "Wykryto przeciążenie. System tymczasowo cofa trudność.", icon: "🛡️", color: "var(--secondary-color)", btnText: "Zrozumiałem" };

    overlay.innerHTML = `
        <div class="evolution-modal" style="--glow-color: ${config.color}">
            <div class="evo-icon-wrapper"><span style="font-size: 3rem;">${config.icon}</span></div>
            <h2 class="evo-title">${config.title}</h2>
            <p class="evo-desc">${config.desc}</p>
            <div class="change-box">
                <div class="ex-name" style="opacity: 0.7; text-decoration: line-through;">${adaptation.original}</div>
                <div class="change-arrow">⬇</div>
                <div class="ex-name" style="color: ${config.color}">${adaptation.newName || "Nowy Wariant"}</div>
            </div>
            <button id="close-evo" class="action-btn" style="background: ${config.color}; color: #000; border: none;">${config.btnText}</button>
        </div>
    `;

    document.body.appendChild(overlay);
    if (state.completionSound && isEvo) state.finalCompletionSound();

    overlay.querySelector('#close-evo').onclick = () => {
        overlay.querySelector('.evolution-modal').style.transform = 'scale(0.8)';
        overlay.querySelector('.evolution-modal').style.opacity = '0';
        setTimeout(() => { overlay.remove(); if (onCheck) onCheck(); }, 200);
    };
}

export function renderSessionRecoveryModal(backup, timeGapFormatted, onRestore, onDiscard) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const totalSteps = backup.flatExercises?.length || 0;
    const currentStep = backup.currentExerciseIndex || 0;
    const progressPercent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

    overlay.innerHTML = `
        <div class="swap-modal" style="max-width: 380px;">
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <span style="font-size: 3rem;">⚠️</span>
                <h2 style="margin: 0.5rem 0;">Przerwana sesja</h2>
                <p style="opacity: 0.7; font-size: 0.9rem;">Wykryto niezakończony trening</p>
            </div>

            <div style="background: var(--card-color); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
                <div style="font-weight: 600; margin-bottom: 0.5rem;">${backup.trainingTitle || 'Trening'}</div>
                <div style="font-size: 0.85rem; opacity: 0.7; margin-bottom: 0.75rem;">Przerwa: ${timeGapFormatted} temu</div>

                <div style="background: var(--bg-color); border-radius: 8px; padding: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.25rem;">
                        <span>Postęp</span>
                        <span>${currentStep} / ${totalSteps} (${progressPercent}%)</span>
                    </div>
                    <div style="height: 6px; background: var(--secondary-color); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: ${progressPercent}%; background: var(--primary-color); transition: width 0.3s;"></div>
                    </div>
                </div>
            </div>

            <p style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 1.5rem; text-align: center;">
                Czas przerwy zostanie dodany do całkowitego czasu pauzy.
            </p>

            <div style="display: flex; gap: 12px;">
                <button id="discard-session" class="nav-btn"
                    style="flex: 1; padding: 12px; font-size: 1rem; display: flex; align-items: center; justify-content: center;">
                    Porzuć
                </button>
                <button id="restore-session" class="action-btn"
                    style="flex: 1; margin: 0; padding: 12px; font-size: 1rem; display: flex; align-items: center; justify-content: center;">
                    Przywróć
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#restore-session').addEventListener('click', () => { overlay.remove(); if (onRestore) onRestore(); });
    overlay.querySelector('#discard-session').addEventListener('click', () => { overlay.remove(); if (onDiscard) onDiscard(); });
}

export function renderTunerModal(exerciseId, onUpdate) {
    const exercise = state.exerciseLibrary[exerciseId];
    if (!exercise) return;

    const pref = state.userPreferences[exerciseId] || { score: 0, difficulty: 0 };
    let currentScore = pref.score || 0;
    let currentDiff = pref.difficulty || 0;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const gradientStyle = `background: linear-gradient(90deg, #ff4d4d 0%, #d1d5db 50%, #2dd4bf 75%, #f59e0b 100%);`;

    overlay.innerHTML = `
        <div class="swap-modal tuner-modal">
            <div class="tuner-header">
                <h3>${exercise.name}</h3>
                <div class="tuner-badge-preview">Tier: <span id="tuner-tier-name">...</span></div>
            </div>

            <div class="tuner-section">
                <label>Emocjonalny Rezonans (Affinity)</label>
                <div class="slider-wrapper">
                    <input type="range" id="tuner-slider" min="-100" max="100" value="${currentScore}" class="tuner-slider">
                    <div class="slider-track" style="${gradientStyle}"></div>
                </div>
                <div class="tuner-labels">
                    <span>Unikam</span>
                    <span>Neutral</span>
                    <span>Lubię</span>
                    <span>Uwielbiam</span>
                </div>
                <div id="tuner-score-val" class="tuner-val">${currentScore}</div>
            </div>

            <div class="tuner-section">
                <label>Odczuwalna Trudność</label>
                <div class="diff-toggle-group">
                    <button class="diff-btn ${currentDiff === -1 ? 'active' : ''}" data-val="-1">💤 Za łatwe</button>
                    <button class="diff-btn ${currentDiff === 0 ? 'active' : ''}" data-val="0">🎯 Idealnie</button>
                    <button class="diff-btn ${currentDiff === 1 ? 'active' : ''}" data-val="1">🔥 Za trudne</button>
                </div>
            </div>

            <button id="save-tuner" class="action-btn" style="margin-top:1.5rem;">Zapisz Kalibrację</button>
        </div>

        <style>
            .tuner-modal { background: #1f2937; color: white; border: 1px solid #374151; }
            .tuner-header { text-align: center; margin-bottom: 1.5rem; }
            .tuner-header h3 { margin: 0; font-size: 1.3rem; color: #f3f4f6; border: none; }
            .tuner-badge-preview { font-size: 0.8rem; opacity: 0.7; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; }

            .tuner-section { margin-bottom: 1.5rem; }
            .tuner-section label { display: block; font-size: 0.85rem; font-weight: 700; color: #9ca3af; margin-bottom: 10px; text-transform: uppercase; }

            .slider-wrapper { position: relative; height: 10px; margin: 20px 0; }
            .tuner-slider {
                -webkit-appearance: none; width: 100%; height: 10px; background: transparent; position: absolute; z-index: 2; margin: 0; cursor: pointer;
            }
            .slider-track {
                position: absolute; top: 0; left: 0; width: 100%; height: 10px; border-radius: 5px; z-index: 1; opacity: 0.8;
            }
            .tuner-slider::-webkit-slider-thumb {
                -webkit-appearance: none; width: 24px; height: 24px; background: #fff; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5); margin-top: -7px;
            }

            .tuner-labels { display: flex; justify-content: space-between; font-size: 0.7rem; color: #6b7280; margin-top: 5px; }
            .tuner-val { text-align: center; font-size: 1.5rem; font-weight: 800; margin-top: 5px; color: #fff; font-variant-numeric: tabular-nums; }

            .diff-toggle-group { display: flex; gap: 8px; background: #374151; padding: 4px; border-radius: 8px; }
            .diff-btn { flex: 1; background: transparent; border: none; color: #9ca3af; padding: 10px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
            .diff-btn.active { background: #4b5563; color: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
            .diff-btn[data-val="-1"].active { background: #0ea5e9; }
            .diff-btn[data-val="0"].active { background: #10b981; }
            .diff-btn[data-val="1"].active { background: #ef4444; }
        </style>
    `;

    document.body.appendChild(overlay);

    const slider = overlay.querySelector('#tuner-slider');
    const valDisplay = overlay.querySelector('#tuner-score-val');
    const tierDisplay = overlay.querySelector('#tuner-tier-name');
    const diffBtns = overlay.querySelectorAll('.diff-btn');

    const updateUI = () => {
        const val = parseInt(slider.value);
        valDisplay.textContent = val > 0 ? `+${val}` : val;

        let tier = 'Neutral (B)';
        let color = '#9ca3af';
        if (val >= 20) { tier = 'Supreme (S)'; color = '#f59e0b'; }
        else if (val >= 10) { tier = 'Great (A)'; color = '#2dd4bf'; }
        else if (val <= -10) { tier = 'Avoid (C)'; color = '#ef4444'; }

        tierDisplay.textContent = tier;
        tierDisplay.style.color = color;

        if (navigator.vibrate) navigator.vibrate(5);
    };

    slider.addEventListener('input', updateUI);
    updateUI();

    diffBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            diffBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDiff = parseInt(btn.dataset.val);
        });
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#save-tuner').addEventListener('click', async () => {
        const newScore = parseInt(slider.value);
        await dataStore.updatePreference(exerciseId, 'set', newScore);
        await dataStore.updatePreference(exerciseId, 'set_difficulty', currentDiff);
        if (onUpdate) onUpdate();
        overlay.remove();
    });
}