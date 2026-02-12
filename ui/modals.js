// ExerciseApp/ui/modals.js
import { state } from '../state.js';
import dataStore from '../dataStore.js';
import { processSVG } from '../utils.js';
import { buildClinicalContext, checkExerciseAvailability } from '../clinicalEngine.js';

// Helper do zamykania przy kliknięciu w tło
function attachBackdropClose(overlay) {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

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
            <p class="swap-subtitle">Wybierz dzień wolny, na który chcesz przenieść ten trening:</p>
            <div class="modal-dates-list">
                ${datesHtml}
            </div>
            <button id="cancel-move" class="nav-btn modal-full-btn">Anuluj</button>
        </div>
    `;

    document.body.appendChild(overlay);
    attachBackdropClose(overlay);

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
            <p class="swap-subtitle">Kategoria: ${categoryId}</p>
            <div class="swap-options-list">${altsHtml}</div>
            <div class="swap-actions">
                <div class="swap-section-label">Tryb wymiany:</div>
                <div class="swap-type-toggle">
                    <button class="toggle-btn active" data-type="today">Tylko dziś</button>
                    <button class="toggle-btn" data-type="blacklist">🚫 Nie lubię</button>
                </div>

                <div class="modal-actions-row">
                    <button id="cancel-swap" class="nav-btn" style="flex:1;">Anuluj</button>
                    <button id="confirm-swap" class="action-btn" style="flex:1; margin-top:0;" disabled>Wymień</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    attachBackdropClose(overlay);

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
            <div class="preview-svg-container">${cleanSvg}</div>
            <button id="close-preview" class="nav-btn modal-full-btn">Zamknij</button>
        </div>
    `;
    document.body.appendChild(overlay);
    attachBackdropClose(overlay);

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
    attachBackdropClose(overlay);

    if (state.completionSound && isEvo) state.finalCompletionSound();

    overlay.querySelector('#close-evo').onclick = () => {
        overlay.querySelector('.evolution-modal').style.transform = 'scale(0.8)';
        overlay.querySelector('.evolution-modal').style.opacity = '0';
        setTimeout(() => { overlay.remove(); if (onCheck) onCheck(); }, 200);
    };
}

// --- REWARD MODAL (ODZNAKI) ---
export function renderRewardModal(badge, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const confettiHtml = Array.from({ length: 20 }).map((_, i) =>
        `<div class="confetti" style="--d:${Math.random() * 2}s; --x:${Math.random() * 100}%; --c:${['#ff0000', '#00ff00', '#0000ff', '#ffff00'][i % 4]}"></div>`
    ).join('');

    overlay.innerHTML = `
        <div class="evolution-modal reward-mode" style="--glow-color: var(--gold-color);">
            <div class="confetti-container">${confettiHtml}</div>
            <div class="evo-icon-wrapper reward-icon-wrapper">
                <span style="font-size: 4rem;">${badge.icon}</span>
            </div>

            <h2 class="evo-title" style="color:var(--gold-color); text-shadow:0 0 10px rgba(233,196,106,0.5);">ODBLOKOWANO!</h2>
            <div class="reward-name">${badge.label}</div>
            <p class="evo-desc" style="margin-top:0.5rem; opacity:0.9;">${badge.desc}</p>

            <button id="close-reward" class="action-btn" style="background: var(--gold-color); color: #000; border: none; font-weight:800; box-shadow:0 4px 15px rgba(233,196,106,0.4);">
                Super!
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    if (state.completionSound) state.finalCompletionSound();

    overlay.querySelector('#close-reward').onclick = () => {
        const modalContent = overlay.querySelector('.evolution-modal');
        modalContent.style.transform = 'scale(0.8)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            if (onConfirm) onConfirm();
        }, 200);
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
            <div class="modal-center-content">
                <span style="font-size: 3rem;">⚠️</span>
                <h2 style="margin: 0.5rem 0;">Przerwana sesja</h2>
                <p class="modal-info-text">Wykryto niezakończony trening</p>
            </div>

            <div class="modal-card">
                <div style="font-weight: 600; margin-bottom: 0.5rem;">${backup.trainingTitle || 'Trening'}</div>
                <div style="font-size: 0.85rem; opacity: 0.7; margin-bottom: 0.75rem;">Przerwa: ${timeGapFormatted} temu</div>

                <div class="modal-progress-bar">
                    <div class="modal-progress-row">
                        <span>Postęp</span>
                        <span>${currentStep} / ${totalSteps} (${progressPercent}%)</span>
                    </div>
                    <div class="modal-progress-track">
                        <div class="modal-progress-fill" style="width: ${progressPercent}%;"></div>
                    </div>
                </div>
            </div>

            <p class="modal-note">
                Czas przerwy zostanie dodany do całkowitego czasu pauzy.
            </p>

            <div class="modal-actions-row" style="margin-top:0;">
                <button id="discard-session" class="nav-btn" style="flex: 1;">Porzuć</button>
                <button id="restore-session" class="action-btn" style="flex: 1; margin: 0;">Przywróć</button>
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

            <button id="save-tuner" class="action-btn modal-full-btn">Zapisz Kalibrację</button>
        </div>
    `;

    document.body.appendChild(overlay);
    attachBackdropClose(overlay);

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

    overlay.querySelector('#save-tuner').addEventListener('click', async () => {
        const newScore = parseInt(slider.value);
        await dataStore.updatePreference(exerciseId, 'set', newScore);
        await dataStore.updatePreference(exerciseId, 'set_difficulty', currentDiff);
        if (onUpdate) onUpdate();
        overlay.remove();
    });
}

// --- S.A.F.E: DETAIL ASSESSMENT MODAL (ZAKTUALIZOWANY - BEZ WALKI) ---
export function renderDetailAssessmentModal(exerciseName, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="swap-modal" style="text-align: center;">
            <div class="amps-modal-header">
                <h3 class="amps-modal-title">${exerciseName}</h3>
                <p class="amps-modal-subtitle">Jak poszła ta seria?</p>
            </div>

            <!-- USUNIĘTO: Czerwony przycisk 'WALKA' -->
            <div class="safe-buttons-grid" style="margin-top: 20px; grid-template-columns: 1fr 1fr;">
                <button class="safe-btn easy" data-type="easy">
                    <span class="icon">🟢</span>
                    Lekko
                </button>
                <button class="safe-btn solid" data-type="solid">
                    <span class="icon">🔵</span>
                    Kontrola
                </button>
            </div>

            <button id="cancel-detail" class="nav-btn modal-full-btn">Anuluj</button>
        </div>
    `;

    document.body.appendChild(overlay);
    attachBackdropClose(overlay);

    overlay.querySelector('#cancel-detail').addEventListener('click', () => overlay.remove());

    const buttons = overlay.querySelectorAll('.safe-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            let newTech, newRir;

            if (type === 'easy') {
                newTech = 10; newRir = 4;
            } else if (type === 'solid') {
                newTech = 9; newRir = 2;
            }

            if (onConfirm) onConfirm(newTech, newRir);
            overlay.remove();
        });
    });
}

const PHASE_LABELS = {
    'control': 'Kontrola & Stabilizacja',
    'mobility': 'Mobilność',
    'capacity': 'Budowa Pojemności',
    'strength': 'Siła Maksymalna',
    'metabolic': 'Kondycja',
    'deload': 'Roztrenowanie (Deload)',
    'rehab': 'Regeneracja (Rehab)'
};

const TRANSITION_MESSAGES = {
    'target_reached': {
        title: "LEVEL UP! 🏆",
        icon: "🚀",
        color: "var(--gold-color)",
        btn: "Lecimy Dalej!",
        getMessage: (phaseName) => `Gratulacje! Opanowałeś fazę <strong>${phaseName}</strong>. Twój organizm jest gotowy na nowe wyzwania. Zwiększamy intensywność, aby utrzymać progres.`
    },
    'deload_entry': {
        title: "Tarcza Aktywna 🛡️",
        icon: "🔋",
        color: "#60a5fa",
        btn: "Zregeneruj się",
        getMessage: () => `Wykryliśmy nagromadzone zmęczenie. To normalne w procesie treningowym. Przechodzimy w tryb <strong>Deload</strong> (mniejsza objętość), abyś mógł się w pełni zregenerować i wrócić silniejszy ("Superkompensacja").`
    },
    'rehab_entry': {
        title: "Tryb Ochronny 🚑",
        icon: "❤️‍🩹",
        color: "#f87171",
        btn: "Zadbaj o siebie",
        getMessage: () => `Twoje raporty wskazują na nasilenie dolegliwości. Spokojnie – to nie regres, a sygnał od ciała. Tymczasowo zmieniamy plan na <strong>Rehab</strong>: skupimy się na bezbólowym ruchu i regeneracji, by wyciszyć objawy.`
    },
    'time_cap': {
        title: "Zmiana Bodźca ⏱️",
        icon: "🔄",
        color: "var(--secondary-color)",
        btn: "Rozumiem",
        getMessage: (phaseName) => `Minął czas przewidziany na ten etap. Aby uniknąć stagnacji (przyzwyczajenia mięśni), przechodzimy do fazy <strong>${phaseName}</strong>. Zmiana bodźca to klucz do rozwoju.`
    },
    'default': {
        title: "Nowy Etap",
        icon: "✨",
        color: "var(--primary-color)",
        btn: "OK",
        getMessage: (phaseName) => `Rozpoczynasz fazę: <strong>${phaseName}</strong>.`
    }
};

export function renderPhaseTransitionModal(updateData, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const newPhaseId = updateData.newPhaseId;
    const transitionType = updateData.transition;
    const isSoft = updateData.isSoft;

    const newPhaseName = PHASE_LABELS[newPhaseId] || newPhaseId.toUpperCase();

    let msgKey = 'default';
    if (newPhaseId === 'rehab') msgKey = 'rehab_entry';
    else if (newPhaseId === 'deload') msgKey = 'deload_entry';
    else if (transitionType === 'target_reached') msgKey = 'target_reached';
    else if (transitionType === 'time_cap' || isSoft) msgKey = 'time_cap';

    const config = TRANSITION_MESSAGES[msgKey];
    const message = config.getMessage(newPhaseName);

    if (msgKey === 'target_reached' && state.completionSound) {
        state.finalCompletionSound();
    }

    overlay.innerHTML = `
        <div class="evolution-modal" style="--glow-color: ${config.color}">
            <div class="evo-icon-wrapper" style="border-color:${config.color}">
                <span style="font-size: 3rem;">${config.icon}</span>
            </div>

            <h2 class="evo-title" style="color:${config.color}">${config.title}</h2>

            <div style="background:rgba(255,255,255,0.1); padding:15px; border-radius:12px; margin-bottom:1.5rem; text-align:left;">
                <p class="evo-desc" style="margin:0; font-size:0.95rem; line-height:1.6;">${message}</p>
            </div>

            <div class="change-box" style="border-color:rgba(255,255,255,0.2); background:transparent; padding:10px;">
                <div style="font-size:0.7rem; text-transform:uppercase; color:#aaa; margin-bottom:2px;">AKTUALNY CEL:</div>
                <div class="ex-name" style="color:#fff; font-size:1.1rem;">${newPhaseName}</div>
            </div>

            <button id="close-phase-modal" class="action-btn" style="background: ${config.color}; color: #000; border: none; font-weight:800; margin-top:10px;">
                ${config.btn}
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    attachBackdropClose(overlay);

    overlay.querySelector('#close-phase-modal').onclick = () => {
        const modalContent = overlay.querySelector('.evolution-modal');
        modalContent.style.transform = 'scale(0.8)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            if (onConfirm) onConfirm();
        }, 200);
    };
}