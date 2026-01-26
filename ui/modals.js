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
    // Ewolucja to ważne powiadomienie, nie zamykamy go tłem, chyba że user bardzo chce
    attachBackdropClose(overlay);

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
    // UWAGA: Tutaj NIE dodajemy attachBackdropClose, ponieważ to jest modal krytyczny.
    // Użytkownik MUSI podjąć decyzję (Porzuć/Przywróć).

    overlay.querySelector('#restore-session').addEventListener('click', () => { overlay.remove(); if (onRestore) onRestore(); });
    overlay.querySelector('#discard-session').addEventListener('click', () => { overlay.remove(); if (onDiscard) onDiscard(); });
}

export function renderTunerModal(exerciseId, onUpdate) {
    console.log(`[ModalDebug] 🟢 START renderTunerModal: ${exerciseId}`);

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

    overlay.querySelector('#save-tuner').addEventListener('click', async () => {
        const newScore = parseInt(slider.value);
        await dataStore.updatePreference(exerciseId, 'set', newScore);
        await dataStore.updatePreference(exerciseId, 'set_difficulty', currentDiff);
        if (onUpdate) onUpdate();
        overlay.remove();
    });
}

// --- AMPS PHASE 2: DETAIL ASSESSMENT MODAL ---
export function renderDetailAssessmentModal(exerciseName, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="amps-detail-modal">
            <div class="amps-modal-header">
                <h3 class="amps-modal-title">${exerciseName}</h3>
                <p class="amps-modal-subtitle">✨ Nowe ćwiczenie - skalibrujmy je!</p>
            </div>

            <div class="amps-section">
                <label class="amps-label">Jakość Techniki (1-10)</label>
                <div class="tech-slider-wrapper">
                    <input type="range" min="1" max="10" value="5" class="tech-slider" id="tech-slider">
                    <div class="tech-value-display"><span id="tech-val">5</span>/10</div>
                    <div class="tech-labels">
                        <span>Słaba</span>
                        <span>Perfekcja</span>
                    </div>
                </div>
            </div>

            <div class="amps-section">
                <label class="amps-label">Rezerwa (RIR)</label>
                <div class="rir-grid">
                    <button class="rir-btn" data-rir="0">
                        RIR 0
                        <span>Max</span>
                    </button>
                    <button class="rir-btn" data-rir="1">
                        RIR 1
                        <span>1 w zapasie</span>
                    </button>
                    <button class="rir-btn" data-rir="2">
                        RIR 2
                        <span>2 w zapasie</span>
                    </button>
                    <button class="rir-btn selected" data-rir="3">
                        RIR 3+
                        <span>Lekko</span>
                    </button>
                </div>
            </div>

            <button id="save-detail" class="action-btn modal-full-btn">Zapisz Ocenę</button>
        </div>
    `;

    document.body.appendChild(overlay);
    
    // Obsługa zamknięcia przez kliknięcie w tło
    attachBackdropClose(overlay);

    const techSlider = overlay.querySelector('#tech-slider');
    const techVal = overlay.querySelector('#tech-val');
    let currentRir = 3;

    techSlider.addEventListener('input', (e) => {
        techVal.textContent = e.target.value;
    });

    const rirBtns = overlay.querySelectorAll('.rir-btn');
    rirBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            rirBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentRir = parseInt(btn.dataset.rir);
        });
    });

    overlay.querySelector('#save-detail').addEventListener('click', () => {
        const tech = parseInt(techSlider.value);
        if (onConfirm) onConfirm(tech, currentRir);
        overlay.remove();
    });
}

const PHASE_LABELS = {
    'control': 'Kontrola & Stabilizacja',
    'mobility': 'Mobilność',
    'capacity': 'Budowa Pojemności',
    'strength': 'Siła Maksymalna',
    'metabolic': 'Kondycja',
    'deload': 'Roztrenowanie',
    'rehab': 'Regeneracja'
};

const PHASE_DESCRIPTIONS = {
    'control': 'Skupimy się na poprawności ruchu i wolnym tempie.',
    'mobility': 'Zwiększymy zakresy ruchu i zdrowie stawów.',
    'capacity': 'Zwiększymy objętość, aby zbudować wytrzymałość mięśniową.',
    'strength': 'Mniej powtórzeń, większy opór. Budujemy siłę.',
    'metabolic': 'Szybsze tempo i krótsze przerwy dla spalania.',
    'deload': 'Krótki okres lżejszych treningów dla regeneracji CUN.',
    'rehab': 'Priorytet to bezpieczeństwo i redukcja bólu.'
};

export function renderPhaseTransitionModal(updateData, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const isSoft = updateData.isSoft; // True = Time Cap, False = Target Reached
    const newPhaseId = updateData.newPhaseId;
    const newPhaseName = PHASE_LABELS[newPhaseId] || newPhaseId.toUpperCase();
    const description = PHASE_DESCRIPTIONS[newPhaseId] || 'Nowy cykl treningowy.';

    const config = isSoft
        ? {
            title: "Zmiana Bodźca",
            icon: "⏱️",
            color: "var(--secondary-color)",
            msg: "Minął czas przewidziany na obecną fazę. Przechodzimy dalej, aby uniknąć stagnacji.",
            btn: "Rozumiem"
        }
        : {
            title: "FAZA UKOŃCZONA!",
            icon: "🏆",
            color: "var(--gold-color)",
            msg: "Gratulacje! Wykonałeś wszystkie założone sesje w tej fazie.",
            btn: "Lecimy Dalej!"
        };

    if (!isSoft && state.completionSound) state.finalCompletionSound();

    overlay.innerHTML = `
        <div class="evolution-modal" style="--glow-color: ${config.color}">
            <div class="evo-icon-wrapper" style="border-color:${config.color}">
                <span style="font-size: 3rem;">${config.icon}</span>
            </div>

            <h2 class="evo-title" style="color:${config.color}">${config.title}</h2>
            <p class="evo-desc" style="margin-bottom: 1.5rem;">${config.msg}</p>

            <div class="change-box" style="border-color:${config.color}">
                <div style="font-size:0.75rem; text-transform:uppercase; color:#aaa; margin-bottom:5px;">NOWY CEL</div>
                <div class="ex-name" style="color:#fff; font-size:1.3rem;">${newPhaseName}</div>
                <div style="font-size:0.9rem; opacity:0.8; margin-top:5px;">${description}</div>
            </div>

            <button id="close-phase-modal" class="action-btn" style="background: ${config.color}; color: #000; border: none; font-weight:800;">
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