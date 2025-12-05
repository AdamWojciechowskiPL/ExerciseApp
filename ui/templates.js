// js/ui/templates.js
import { state } from '../state.js';

// ... (Pozostałe funkcje i helpery bez zmian) ...
const formatCategoryName = (catId) => {
    if (!catId) return 'Ogólne';
    return catId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const getLevelLabel = (lvl) => {
    if (!lvl) return 'Baza';
    if (lvl == 1) return 'Lvl 1';
    if (lvl == 2) return 'Lvl 2';
    if (lvl == 3) return 'Lvl 3';
    if (lvl >= 4) return 'Pro';
    return `Lvl ${lvl}`;
};

const formatFeedback = (session) => {
    if (session.feedback) {
        const { type, value } = session.feedback;
        if (type === 'tension') {
            if (value === 1) return { label: '🥱 Za łatwo', class: 'neutral' };
            if (value === 0) return { label: '🎯 Idealnie', class: 'success' };
            if (value === -1) return { label: '🧶 Za ciężko', class: 'warning' };
        } 
        else if (type === 'symptom') {
            if (value === 1) return { label: '🍃 Ulga', class: 'success' };
            if (value === 0) return { label: '⚖️ Stabilnie', class: 'neutral' };
            if (value === -1) return { label: '⚡ Podrażnienie', class: 'danger' };
        }
    }
    if (session.pain_during !== undefined && session.pain_during !== null) {
        return { label: `Ból: ${session.pain_during}/10`, class: 'neutral' };
    }
    return { label: '-', class: '' };
};

function getCurrentWeekDays() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        weekDays.push(d);
    }
    return weekDays;
}

function getIsoDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function generateHeroDashboardHTML(stats) {
    const isLoading = !stats.resilience;
    const resilienceScore = isLoading ? '--' : stats.resilience.score;
    const shieldClass = isLoading ? 'loading' : stats.resilience.status.toLowerCase();
    const progressPercent = stats.progressPercent || 0;
    const progressDegrees = Math.round((progressPercent / 100) * 360);
    const loadingClass = isLoading ? 'skeleton-pulse' : '';

    const weekDays = getCurrentWeekDays();
    const todayKey = getIsoDateKey(new Date());
    
    const weeklyBarsHTML = weekDays.map(date => {
        const dateKey = getIsoDateKey(date);
        const dayName = date.toLocaleDateString('pl-PL', { weekday: 'short' }).charAt(0);
        const isToday = dateKey === todayKey;
        const daySessions = state.userProgress ? state.userProgress[dateKey] : null;
        const hasWorkout = daySessions && daySessions.length > 0;
        let statusClass = 'empty';
        if (hasWorkout) statusClass = 'filled';
        else if (isToday) statusClass = 'current';

        return `
            <div class="week-day-col">
                <div class="day-bar ${statusClass}" title="${dateKey}"></div>
                <span class="day-label">${dayName}</span>
            </div>
        `;
    }).join('');
    let timeLabel = "0m";
    const totalMin = stats.totalMinutes || 0;
    if (totalMin > 60) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        timeLabel = `${h}h ${m}m`;
    } else {
        timeLabel = `${totalMin}m`;
    }

    return `
        <div class="hero-avatar-wrapper">
            <div class="progress-ring" style="--progress-deg: ${progressDegrees}deg;"></div>
            <img src="${stats.iconPath || '/icons/badge-level-1.svg'}" class="hero-avatar" alt="Ranga">
            <div class="level-badge">LVL ${stats.level || 1}</div>
        </div>
        <div class="hero-content">
            <h3 class="hero-rank-title ${loadingClass}">${stats.tierName || 'Ładowanie...'}</h3>
            
            <div class="hero-metrics-grid">
                <!-- 1. SERIA (Dodano title) -->
                <div class="metric-item" title="Twoja aktualna seria dni treningowych">
                    <img src="/icons/streak-fire.svg" class="metric-icon" alt="Streak">
                    <div class="metric-text">
                        <span class="metric-label">Seria</span>
                        <span class="metric-value ${loadingClass}">${stats.streak !== undefined ? stats.streak : '-'} Dni</span>
                    </div>
                </div>

                <!-- 2. TARCZA (Dodano title) -->
                <div class="metric-item" title="Wskaźnik odporności (Resilience)">
                    <img src="/icons/shield-check.svg" class="metric-icon" alt="Shield">
                    <div class="metric-text">
                        <span class="metric-label">Tarcza</span>
                        <span class="metric-value shield-score ${shieldClass} ${loadingClass}">
                            ${resilienceScore}${isLoading ? '' : '%'}
                        </span>
                    </div>
                </div>

                <!-- 3. CZAS (Dodano title) -->
                <div class="metric-item" title="Całkowity czas spędzony na ćwiczeniach">
                    <img src="/icons/clock.svg" class="metric-icon" alt="Time">
                    <div class="metric-text">
                        <span class="metric-label">Czas</span>
                        <span class="metric-value ${loadingClass}">${isLoading ? '--' : timeLabel}</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="hero-weekly-rhythm">
            <div class="weekly-chart-label">TWÓJ TYDZIEŃ</div>
            <div class="weekly-chart-grid">${weeklyBarsHTML}</div>
        </div>
    `;
}

export function generateSkeletonDashboardHTML() {
    return `
        <div class="section-title">Ładowanie Asystenta...</div>
        <div class="skeleton-card">
            <div class="skeleton-header">
                <div style="flex:1">
                    <div class="skeleton-text skeleton-loading sm"></div>
                    <div class="skeleton-text skeleton-loading md"></div>
                </div>
                <div class="skeleton-text skeleton-loading" style="width:60px; border-radius:20px;"></div>
            </div>
            <div class="skeleton-text skeleton-loading lg"></div>
            <div class="skeleton-wellness skeleton-loading"></div>
            <div class="skeleton-btn skeleton-loading"></div>
        </div>
        <div class="section-title" style="margin-top:2rem;">Kolejne w cyklu</div>
        <div class="skeleton-queue-item skeleton-loading"></div>
        <div class="skeleton-queue-item skeleton-loading"></div>
        <div class="skeleton-queue-item skeleton-loading"></div>
    `;
}

function getSmartAiTags(wizardData) {
    const tags = [];

    // 1. Analiza Pracy (Kontekst dnia)
    if (wizardData.work_type === 'sedentary') {
        tags.push({ icon: '🪑', text: 'Anti-Office' }); // Kontra do siedzenia
    } else if (wizardData.work_type === 'standing') {
        tags.push({ icon: '🧍', text: 'Odciążenie lędźwi' });
    }

    // 2. Analiza Hobby (Sportowy kontekst)
    if (wizardData.hobby?.includes('running')) {
        tags.push({ icon: '🏃', text: 'Stabilna miednica' });
    } else if (wizardData.hobby?.includes('cycling')) {
        tags.push({ icon: '🚴', text: 'Otwarcie bioder' });
    } else if (wizardData.hobby?.includes('gym')) {
        tags.push({ icon: '🏋️', text: 'Mobility pod ciężary' });
    }

    // 3. Specyfika Medyczna / Bólowa (Najważniejsze)
    if (wizardData.pain_locations?.includes('sciatica') || wizardData.medical_diagnosis?.includes('piriformis')) {
        tags.unshift({ icon: '⚡', text: 'Neuro-mobilizacja' }); // Na początek listy
    } else if (wizardData.medical_diagnosis?.includes('disc_herniation')) {
        tags.unshift({ icon: '🛡️', text: 'Bezpieczne zgięcia' });
    } else if (wizardData.pain_locations?.includes('cervical')) {
        tags.push({ icon: '🦒', text: 'Szyja Tech-Neck' });
    }

    // 4. Ograniczenia (Safety)
    if (wizardData.physical_restrictions?.includes('no_kneeling')) {
        tags.push({ icon: '🚫', text: 'Bez klękania' });
    }

    // 5. Cel (Jeśli mało tagów)
    if (tags.length < 2 && wizardData.primary_goal === 'pain_relief') {
        tags.push({ icon: '💊', text: 'Redukcja bólu' });
    }

    // Zwracamy max 3-4 najciekawsze tagi, żeby nie zapchać ekranu
    return tags.slice(0, 4);
}
// ZMIANA: Dodano parametr wizardData
export function generateMissionCardHTML(dayData, estimatedMinutes, wizardData = null) {
    const equipmentSet = new Set();
    [...(dayData.warmup || []), ...(dayData.main || []), ...(dayData.cooldown || [])].forEach(ex => {
        if (ex.equipment) ex.equipment.split(',').forEach(item => equipmentSet.add(item.trim()));
    });
    const equipmentText = equipmentSet.size > 0 ? [...equipmentSet].join(', ') : 'Brak sprzętu';

    // --- BUDOWANIE ELEMENTÓW AI ---
    let aiHeaderHTML = '';
    let aiTagsHTML = '';
    let aiClass = '';

    if (wizardData) {
        aiClass = 'ai-mode';
        
        // Generujemy sprytne tagi zamiast generycznych
        const smartTags = getSmartAiTags(wizardData);
        
        // Jeśli z jakiegoś powodu tablica jest pusta (fallback), dajemy ogólny
        if (smartTags.length === 0) {
            smartTags.push({ icon: '🧬', text: 'Personalizacja' });
        }

        aiHeaderHTML = `
            <div class="ai-header-strip">
                <div class="ai-header-left">
                    <span class="ai-dna-icon">🧬</span>
                    <span>Virtual Physio</span>
                </div>
                <!-- Dodatkowy tekst budujący zaufanie -->
                <span style="opacity:0.9; font-size:0.6rem; letter-spacing:0.5px;">DOPASOWANO DO CIEBIE</span>
            </div>
        `;

        aiTagsHTML = `
            <div class="ai-mini-tags">
                ${smartTags.map(t => `
                    <div class="ai-mini-tag">
                        <span>${t.icon}</span> ${t.text}
                    </div>
                `).join('')}
            </div>
        `;
    }

    return `
    <div class="mission-card ${aiClass}">
        ${aiHeaderHTML}
        
        <div class="mission-header">
            <div>
                <span class="mission-day-badge">DZIEŃ ${dayData.dayNumber}</span>
                <h3 class="mission-title">${dayData.title}</h3>
            </div>
            <div class="estimated-time-badge">
                <img src="/icons/clock.svg" width="16" height="16" alt="Czas">
                <span id="mission-time-val">${estimatedMinutes} min</span>
            </div>
        </div>

        <!-- Tutaj wchodzą nasze nowe, sprytne tagi -->
        ${aiTagsHTML}

        <p style="font-size:0.8rem; opacity:0.7; margin:0; margin-bottom: 0.8rem; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 8px;">
            <strong>Sprzęt:</strong> ${equipmentText}
        </p>

        <div class="wellness-section">
            <div class="wellness-label">
                <span>Wellness Check-in</span>
                <span style="font-weight:400">Jak się czujesz?</span>
            </div>
            <div class="pain-selector">
                <div class="pain-option selected" data-level="0">🚀 <span>Świetnie</span></div>
                <div class="pain-option" data-level="3">🙂 <span>Dobrze</span></div>
                <div class="pain-option" data-level="5">😐 <span>Średnio</span></div>
                <div class="pain-option" data-level="7">🤕 <span>Boli</span></div>
                <div class="pain-option" data-level="9">🛑 <span>Krytycznie</span></div>
            </div>
        </div>
        <button id="start-mission-btn" class="action-btn" data-initial-pain="0">Start Misji</button>
    </div>`;
}

export function generatePreTrainingCardHTML(ex, index) {
    // ... (Bez zmian) ...
    const uniqueId = `ex-${index}`;
    const exerciseId = ex.id || ex.exerciseId; 
    const lvl = ex.difficultyLevel || 1;
    const categoryName = formatCategoryName(ex.categoryId);
    const equipment = ex.equipment || 'Brak sprzętu';
    const hasAnimation = !!ex.animationSvg;

    const previewBtnHTML = hasAnimation 
        ? `<button class="preview-anim-btn nav-btn" 
                   data-exercise-id="${exerciseId}" 
                   title="Podgląd animacji"
                   style="padding: 4px 8px; display: flex; align-items: center; gap: 5px; border-color: var(--secondary-color);">
             <img src="/icons/eye.svg" width="20" height="20" alt="Podgląd" style="display: block;">
             <span style="font-size: 0.75rem; font-weight: 600; color: var(--secondary-color);">Podgląd</span>
           </button>`
        : '';

    let badgeHTML = '';
    if (ex.isPersonalized) {
        badgeHTML = `<span class="meta-badge" style="background:var(--gold-color); color:#000; border:none;">✨ Personalizacja</span>`;
    } else if (ex.isDynamicSwap) {
        badgeHTML = `<span class="meta-badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">🎲 Mix</span>`;
    } else if (ex.isSwapped) {
        badgeHTML = `<span class="meta-badge" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;">🔄 Wybór</span>`;
    }

    const showOriginalInfo = ex.originalName && ex.originalName !== ex.name;
    const originalInfo = showOriginalInfo 
        ? `<div style="font-size:0.75rem; color:#999; margin-top:-5px; margin-bottom:5px;">Zamiast: ${ex.originalName}</div>` 
        : '';

    return `
        <div class="training-card" data-exercise-id="${exerciseId || ''}" data-category-id="${ex.categoryId || ''}">
            <div class="training-card-header">
                <div style="flex-grow: 1; padding-right: 10px;">
                    <h4>${ex.name}</h4>
                    ${originalInfo}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    ${previewBtnHTML}
                    <button class="swap-btn" title="Wymień ćwiczenie" data-exercise-index="${index}">
                        <img src="/icons/swap.svg" width="20" height="20" alt="Wymień">
                    </button>
                </div>
            </div>
            <div class="training-meta">
                ${badgeHTML}
                <span class="meta-badge badge-lvl-${lvl}">⚡ ${getLevelLabel(lvl)}</span>
                <span class="meta-badge badge-category">📂 ${categoryName}</span>
                <span class="meta-badge badge-equipment">🏋️ ${equipment}</span>
            </div>
            <p class="pre-training-description" style="padding-left:10px; opacity:0.8;">${ex.description || 'Brak opisu.'}</p>
            <div class="training-inputs-grid">
                <div class="input-wrapper">
                    <label for="sets-${uniqueId}" class="input-label">Serie</label>
                    <input type="number" id="sets-${uniqueId}" class="modern-input" value="${ex.sets}" data-exercise-index="${index}">
                </div>
                <div class="input-wrapper">
                    <label for="reps-${uniqueId}" class="input-label">Powtórzenia / Czas</label>
                    <input type="text" id="reps-${uniqueId}" class="modern-input" value="${ex.reps_or_time}" data-exercise-index="${index}">
                </div>
            </div>
            <div class="training-footer">
                <div>${ex.youtube_url ? `<a href="${ex.youtube_url}" target="_blank" class="video-link">▶ Zobacz wideo</a>` : ''}</div>
                ${ex.tempo_or_iso ? `<span class="tempo-badge">Tempo: ${ex.tempo_or_iso}</span>` : ''}
            </div>
        </div>
    `;
}

export function generateSessionCardHTML(session) {
    const planId = session.planId || 'l5s1-foundation';
    const isDynamic = planId.startsWith('dynamic-');
    
    let title = session.trainingTitle || 'Trening';
    if (!session.trainingTitle && !isDynamic) {
         const planForHistory = state.trainingPlans[planId];
         const trainingDay = planForHistory ? planForHistory.Days.find(d => d.dayNumber === session.trainingDayId) : null;
         title = trainingDay ? trainingDay.title : 'Trening';
    }

    const optionsTime = { hour: '2-digit', minute: '2-digit' };
    const feedbackInfo = formatFeedback(session);
    let feedbackStyle = '';
    if (feedbackInfo.class === 'success') feedbackStyle = 'color: var(--success-color);';
    if (feedbackInfo.class === 'warning') feedbackStyle = 'color: #e67e22;'; 
    if (feedbackInfo.class === 'danger') feedbackStyle = 'color: var(--danger-color);';

    let statsHtml = '';
    let completedTimeStr = '';
    if (session.completedAt) completedTimeStr = new Date(session.completedAt).toLocaleTimeString('pl-PL', optionsTime);

    if (session.startedAt && session.completedAt) {
        const startTime = new Date(session.startedAt);
        const endTime = new Date(session.completedAt);
        const durationMs = endTime - startTime;
        const totalMinutes = Math.floor(durationMs / 60000);
        const totalSeconds = Math.floor((durationMs % 60000) / 1000);
        const formattedDuration = `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;
        statsHtml = `
            <div class="session-stats-grid">
                <div class="stat-item"><span class="stat-label">Start</span><span class="stat-value">${startTime.toLocaleTimeString('pl-PL', optionsTime)}</span></div>
                <div class="stat-item"><span class="stat-label">Czas</span><span class="stat-value">${formattedDuration}</span></div>
                <div class="stat-item"><span class="stat-label">Feedback</span><span class="stat-value" style="${feedbackStyle} font-size:0.9rem;">${feedbackInfo.label}</span></div>
            </div>`;
    } else {
        statsHtml = `<div class="session-stats-grid"><div class="stat-item"><span class="stat-label">Zakończono</span><span class="stat-value">${completedTimeStr}</span></div></div>`;
    }

    const exercisesHtml = session.sessionLog && session.sessionLog.length > 0 
        ? session.sessionLog.map(item => {
            const isSkipped = item.status === 'skipped';
            const statusLabel = isSkipped ? 'Pominięto' : 'OK';
            const statusClass = isSkipped ? 'skipped' : 'completed';
            return `
            <div class="history-exercise-row ${statusClass}">
                <div class="hex-main"><span class="hex-name">${item.name}</span><span class="hex-details">Seria ${item.currentSet}/${item.totalSets} • ${item.reps_or_time}</span></div>
                <div class="hex-status"><span class="status-badge ${statusClass}">${statusLabel}</span></div>
            </div>`;
        }).join('') : '<p class="no-data-msg">Brak szczegółowego logu.</p>';
    
    const dynamicBadge = isDynamic ? `<div class="ai-session-badge">🧬 Virtual Physio</div>` : '';

    return `
        <details class="details-session-card" open>
            <summary>
                <div class="summary-content">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="summary-title">${title}</span>
                            ${dynamicBadge}
                        </div>
                    </div>
                    <button class="delete-session-btn icon-btn" data-session-id="${session.sessionId}" title="Usuń wpis"><img src="/icons/trash.svg" width="18" height="18" alt="Usuń"></button>
                </div>
            </summary>
            <div class="details-session-card-content">${statsHtml}${session.notes ? `<div class="session-notes"><strong>Notatki:</strong> ${session.notes}</div>` : ''}<div class="history-exercise-list">${exercisesHtml}</div></div>
        </details>`;
}

export function generateCompletedMissionCardHTML(session) {
    const durationSeconds = session.netDurationSeconds || 0;
    const minutes = Math.floor(durationSeconds / 60);
    const feedbackInfo = formatFeedback(session);

    return `
    <div class="mission-card completed">
        <div class="completed-header">
            <div class="completed-icon"><img src="/icons/check-circle.svg" width="32" height="32" alt="Check" style="filter: invert(34%) sepia(95%) saturate(464%) hue-rotate(96deg) brightness(94%) contrast(90%);"></div>
            <h3 class="completed-title">Misja Wykonana!</h3>
            <p class="completed-subtitle">Dobra robota. Odpocznij przed jutrem.</p>
        </div>
        <div class="completed-stats">
            <div class="c-stat"><div class="c-stat-val">${minutes} min</div><div class="c-stat-label">Czas</div></div>
            <div class="c-stat"><div class="c-stat-val" style="font-size:0.9rem;">${feedbackInfo.label}</div><div class="c-stat-label">Feedback</div></div>
        </div>
        <button class="view-details-btn" data-date="${session.completedAt}">Zobacz Szczegóły ➝</button>
    </div>`;
}