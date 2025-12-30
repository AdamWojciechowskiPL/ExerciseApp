// js/ui/templates.js
import { state } from '../state.js';
import { extractYoutubeId } from '../utils.js';

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

export const getAffinityBadge = (exerciseId) => {
    const pref = state.userPreferences[exerciseId] || { score: 0 };
    const score = pref.score || 0;
    let badge = null;
    if (score >= 10) {
        badge = { icon: '⭐', label: 'Często', color: '#047857', bg: '#ecfdf5', border: '#6ee7b7' };
    } else if (score <= -10) {
        badge = { icon: '📉', label: 'Rzadko', color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' };
    }
    if (!badge) return '';
    return `
        <span class="affinity-badge" style="
            display: inline-flex; align-items: center; gap: 4px;
            padding: 3px 8px; border-radius: 99px;
            font-size: 0.65rem; font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.5px;
            color: ${badge.color}; background-color: ${badge.bg}; border: 1px solid ${badge.border};
            white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05); line-height: 1;">
            ${badge.icon} ${badge.label}
        </span>
    `;
};

// Funkcja generująca Hero Dashboard (z usuniętym wykresem tygodniowym dla mobile w CSS)
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
        if (hasWorkout) statusClass = 'filled'; else if (isToday) statusClass = 'current';
        return `<div class="week-day-col"><div class="day-bar ${statusClass}" title="${dateKey}"></div><span class="day-label">${dayName}</span></div>`;
    }).join('');

    let timeLabel = "0m";
    const totalMin = stats.totalMinutes || 0;
    if (totalMin > 60) { const h = Math.floor(totalMin / 60); const m = totalMin % 60; timeLabel = `${h}h ${m}m`; } else { timeLabel = `${totalMin}m`; }

    return `
    <div class="hero-avatar-wrapper"><div class="progress-ring" style="--progress-deg: ${progressDegrees}deg;"></div><img src="${stats.iconPath || '/icons/badge-level-1.svg'}" class="hero-avatar" alt="Ranga"><div class="level-badge">LVL ${stats.level || 1}</div></div>
    <div class="hero-content">
        <h3 class="hero-rank-title ${loadingClass}">${stats.tierName || 'Ładowanie...'}</h3>
        <div class="hero-metrics-grid">
            <div class="metric-item" title="Twoja aktualna seria"><img src="/icons/streak-fire.svg" class="metric-icon" alt="Streak"><div class="metric-text"><span class="metric-label">Seria</span><span class="metric-value ${loadingClass}">${stats.streak !== undefined ? stats.streak : '-'} Dni</span></div></div>
            <div class="metric-item" title="Wskaźnik odporności"><img src="/icons/shield-check.svg" class="metric-icon" alt="Shield"><div class="metric-text"><span class="metric-label">Tarcza</span><span class="metric-value shield-score ${shieldClass} ${loadingClass}">${resilienceScore}${isLoading ? '' : '%'}</span></div></div>
            <div class="metric-item" title="Czas treningów"><img src="/icons/clock.svg" class="metric-icon" alt="Time"><div class="metric-text"><span class="metric-label">Czas</span><span class="metric-value ${loadingClass}">${isLoading ? '--' : timeLabel}</span></div></div>
        </div>
    </div>
    <div class="hero-weekly-rhythm"><div class="weekly-chart-label">TWÓJ TYDZIEŃ</div><div class="weekly-chart-grid">${weeklyBarsHTML}</div></div>`;
}

export function generateSkeletonDashboardHTML() {
    return `
    <div class="skeleton-card" style="height: 400px; opacity: 0.8; margin-top: 20px;">
        <div class="skeleton-header" style="height: 150px; background: #eee;"></div>
        <div style="padding: 20px;">
            <div class="skeleton-text lg"></div>
            <div class="skeleton-text md"></div>
            <div class="skeleton-btn" style="margin-top: 40px;"></div>
        </div>
    </div>
    <div class="section-title" style="margin-top:2rem;">Oś Czasu</div>
    <div style="display:flex; gap:10px;">
        <div class="skeleton-queue-item skeleton-loading" style="width: 85px; height: 100px;"></div>
        <div class="skeleton-queue-item skeleton-loading" style="width: 85px; height: 100px;"></div>
    </div>`;
}

function getSmartAiTags(wizardData) {
    let tags = [];
    if (wizardData.work_type === 'sedentary') tags.push({ icon: '🪑', text: 'Anti-Office' });
    else if (wizardData.work_type === 'standing') tags.push({ icon: '🧍', text: 'Odciążenie' });

    if (wizardData.pain_locations?.includes('knee')) tags.push({ icon: '🦵', text: 'Kolana' });
    if (wizardData.pain_locations?.includes('sciatica') || wizardData.medical_diagnosis?.includes('piriformis')) tags.unshift({ icon: '⚡', text: 'Neuro' });
    else if (wizardData.medical_diagnosis?.includes('disc_herniation')) tags.unshift({ icon: '🛡️', text: 'Bezpieczne' });
    else if (wizardData.pain_locations?.includes('cervical')) tags.push({ icon: '🦒', text: 'Szyja' });

    if (tags.length < 2 && wizardData.primary_goal === 'pain_relief') tags.push({ icon: '💊', text: 'Redukcja bólu' });

    return tags.slice(0, 3);
}

// --- NOWA FUNKCJA GENERUJĄCA KARTKĘ Z KALENDARZA ---
export function generateCalendarPageHTML(dayData, estimatedMinutes, dateObj, wizardData = null) {
    // 1. Data w nagłówku
    const dayName = dateObj.toLocaleDateString('pl-PL', { weekday: 'long' });
    const dayNumber = dateObj.getDate();
    const monthYear = dateObj.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

    // 2. Sprzęt
    const equipmentSet = new Set();
    [...(dayData.warmup || []), ...(dayData.main || []), ...(dayData.cooldown || [])].forEach(ex => {
        if (Array.isArray(ex.equipment)) {
            ex.equipment.forEach(item => equipmentSet.add(item.trim().toLowerCase()));
        } else if (ex.equipment) {
            ex.equipment.split(',').forEach(item => equipmentSet.add(item.trim().toLowerCase()));
        }
    });
    const ignoreList = ['brak', 'none', 'brak sprzętu', 'masa własna', 'bodyweight', ''];
    const filteredEquipment = [...equipmentSet].filter(item => !ignoreList.includes(item));
    const equipmentText = filteredEquipment.length > 0
        ? filteredEquipment.map(item => item.charAt(0).toUpperCase() + item.slice(1)).join(', ')
        : 'Brak sprzętu';

    // 3. Tagi AI
    let tagsHTML = '';
    if (wizardData) {
        const smartTags = getSmartAiTags(wizardData);
        tagsHTML = smartTags.map(t => `<span class="meta-tag tag-category">${t.icon} ${t.text}</span>`).join('');
    }

    return `
    <div class="calendar-sheet">
        <div class="calendar-top-binding"></div>
        <div class="calendar-date-header">
            <span class="calendar-day-name">${dayName}</span>
            <span class="calendar-day-number">${dayNumber}</span>
            <span class="calendar-month-year">${monthYear}</span>
        </div>
        <div class="calendar-body">
            <div class="workout-context-card">
                <div class="wc-header">
                    <h3 class="wc-title">${dayData.title}</h3>
                    <div style="font-weight:700; color:var(--primary-color); font-size:0.9rem;">
                        ⏱ ${estimatedMinutes} min
                    </div>
                </div>
                <div class="wc-tags">
                    ${tagsHTML}
                    <span class="meta-tag tag-equipment">🛠️ ${equipmentText}</span>
                </div>
                
                <div class="sheet-wellness">
                    <div class="sheet-wellness-label">Jak się czujesz dzisiaj?</div>
                    <div class="pain-selector">
                        <div class="pain-option" data-level="0">🚀 <span>Świetnie</span></div>
                        <div class="pain-option selected" data-level="3">🙂 <span>Dobrze</span></div>
                        <div class="pain-option" data-level="5">😐 <span>Średnio</span></div>
                        <div class="pain-option" data-level="7">🤕 <span>Boli</span></div>
                        <div class="pain-option" data-level="9">🛑 <span>Źle</span></div>
                    </div>
                </div>

                <button id="start-mission-btn" class="calendar-action-btn" data-initial-pain="3">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="display:block;"><path d="M8 5v14l11-7z"></path></svg>
                    Rozpocznij Trening
                </button>
            </div>
        </div>
    </div>`;
}

// Karta regeneracyjna w stylu kalendarza
export function generateRestCalendarPageHTML(dateObj) {
    const dayName = dateObj.toLocaleDateString('pl-PL', { weekday: 'long' });
    const dayNumber = dateObj.getDate();
    const monthYear = dateObj.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

    return `
    <div class="calendar-sheet rest-mode">
        <div class="calendar-top-binding"></div>
        <div class="calendar-date-header">
            <span class="calendar-day-name">${dayName}</span>
            <span class="calendar-day-number">${dayNumber}</span>
            <span class="calendar-month-year">${monthYear}</span>
        </div>
        <div class="calendar-body">
            <div class="workout-context-card" style="background-color: #f8f9fa; border: none;">
                <div style="text-align: center; padding: 1rem 0;">
                    <span style="font-size: 3rem; display: block; margin-bottom: 10px;">🔋</span>
                    <h3 class="wc-title" style="color: #64748b; margin-bottom: 5px;">Dzień Regeneracji</h3>
                    <p style="font-size: 0.9rem; color: #94a3b8; margin: 0;">Odpocznij i zregeneruj siły.</p>
                </div>
                <button id="force-workout-btn" class="calendar-action-btn" style="margin-top: 1rem;">
                    🔥 Zrób dodatkowy trening
                </button>
            </div>
        </div>
    </div>`;
}

export function generateCompletedMissionCardHTML(session) { const durationSeconds = session.netDurationSeconds || 0; const minutes = Math.floor(durationSeconds / 60); const feedbackInfo = formatFeedback(session); return `<div class="mission-card completed"><div class="completed-header"><div class="completed-icon"><img src="/icons/check-circle.svg" width="32" height="32" alt="Check" style="filter: invert(34%) sepia(95%) saturate(464%) hue-rotate(96deg) brightness(94%) contrast(90%);"></div><h3 class="completed-title">Misja Wykonana!</h3><p class="completed-subtitle">Dobra robota. Odpocznij przed jutrem.</p></div><div class="completed-stats"><div class="c-stat"><div class="c-stat-val">${minutes} min</div><div class="c-stat-label">Czas</div></div><div class="c-stat"><div class="c-stat-val" style="font-size:0.9rem;">${feedbackInfo.label}</div><div class="c-stat-label">Feedback</div></div></div><button class="view-details-btn" data-date="${session.completedAt}">Zobacz Szczegóły ➝</button></div>`; }

export function generatePlanFinishedCardHTML(sessionsCount) {
    return `
    <div class="mission-card ai-mode" style="background: linear-gradient(135deg, #0f1c2e 0%, var(--primary-color) 100%); color: #fff; border: none; box-shadow: 0 10px 30px rgba(0,95,115,0.4);">
        <div class="completed-header" style="color: #fff;">
            <div class="completed-icon" style="background: var(--gold-color); box-shadow: 0 0 20px rgba(233,196,106,0.6);">
                <span style="font-size: 1.8rem;">🏆</span>
            </div>
            <h3 class="completed-title" style="color: #fff;">Plan Ukończony!</h3>
            <p class="completed-subtitle" style="color: rgba(255,255,255,0.8);">Zrealizowałeś wszystkie ${sessionsCount} sesji.</p>
        </div>
        <div style="margin-top: 1.5rem; text-align: center;">
            <p style="font-size: 0.9rem; opacity: 0.9; margin-bottom: 1.5rem;">Twój cykl dobiegł końca. Czas na nowe wyzwania!</p>
            <div style="display:flex; flex-direction: column; gap: 10px;">
                <button id="quick-regen-btn" class="action-btn" style="background: var(--gold-color); color: #000; font-weight: 800; border: none;">⚡ Wygeneruj kolejny cykl</button>
                <button id="edit-settings-btn" class="nav-btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: #fff;">📝 Zmień cele (Kreator)</button>
            </div>
        </div>
    </div>`;
}

// Reszta funkcji (PreTrainingCard, SessionCard, etc.) pozostaje bez zmian
export function generatePreTrainingCardHTML(ex, index) {
    const uniqueId = `ex-${index}`;
    const exerciseId = ex.id || ex.exerciseId;
    const lvl = ex.difficultyLevel || 1;
    const categoryName = formatCategoryName(ex.categoryId);

    let equipLabel = '';
    if (Array.isArray(ex.equipment)) {
        equipLabel = ex.equipment.join(', ');
    } else {
        equipLabel = ex.equipment || '';
    }

    const ignoreList = ['brak', 'none', 'brak sprzętu', 'masa własna', 'bodyweight', ''];
    const showEquipBadge = equipLabel.length > 0 && !ignoreList.includes(equipLabel.toLowerCase().trim());

    const hasAnimation = !!ex.hasAnimation;
    const affinityBadge = getAffinityBadge(exerciseId);
    const previewBtnHTML = hasAnimation ? `<button class="preview-anim-btn nav-btn" data-exercise-id="${exerciseId}" title="Podgląd animacji" style="padding: 4px 8px; display: flex; align-items: center; gap: 5px; border-color: var(--secondary-color);"><img src="/icons/eye.svg" width="20" height="20" alt="Podgląd" style="display: block;"><span style="font-size: 0.75rem; font-weight: 600; color: var(--secondary-color);">Podgląd</span></button>` : '';

    let badgeHTML = '';
    if (ex.isPersonalized) badgeHTML = `<span class="meta-badge" style="background:var(--gold-color); color:#000; border:none;">✨ Personalizacja</span>`;
    else if (ex.isDynamicSwap) badgeHTML = `<span class="meta-badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">🎲 Mix</span>`;
    else if (ex.isSwapped) badgeHTML = `<span class="meta-badge" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;">🔄 Wybór</span>`;

    let kneeBadge = '';
    if (ex.kneeLoadLevel && ex.kneeLoadLevel !== 'low') {
        const kColor = ex.kneeLoadLevel === 'high' ? '#b91c1c' : '#b45309';
        const kBg = ex.kneeLoadLevel === 'high' ? '#fef2f2' : '#fffbeb';
        const kBorder = ex.kneeLoadLevel === 'high' ? '#fca5a5' : '#fcd34d';
        kneeBadge = `<span class="meta-badge" style="background:${kBg}; color:${kColor}; border:1px solid ${kBorder};">🦵 ${ex.kneeLoadLevel === 'high' ? 'HIGH' : 'MED'} LOAD</span>`;
    }

    const showOriginalInfo = ex.originalName && ex.originalName !== ex.name;
    const originalInfo = showOriginalInfo ? `<div style="font-size:0.75rem; color:#999; margin-top:-5px; margin-bottom:5px;">Zamiast: ${ex.originalName}</div>` : '';

    let modBadge = '';
    if (ex.modification) {
        let bg = '#eee';
        let color = '#333';
        let border = '#ccc';
        if (ex.modification.type === 'boost') { bg = '#ecfdf5'; color = '#047857'; border = '#6ee7b7'; }
        else if (ex.modification.type === 'eco') { bg = '#eff6ff'; color = '#1d4ed8'; border = '#93c5fd'; }
        else if (ex.modification.type === 'care' || ex.modification.type === 'sos') { bg = '#fff7ed'; color = '#c2410c'; border = '#fdba74'; }
        modBadge = `<span class="meta-badge" style="background:${bg}; color:${color}; border:1px solid ${border}; white-space:nowrap;">${ex.modification.label}</span>`;
    }

    const targetsHTML = `
        <div class="target-stats-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border-color);">
            <div style="background: var(--background-color); padding: 8px; border-radius: 8px; text-align: center; border: 1px solid rgba(0,0,0,0.05);">
                <span style="display: block; font-size: 0.7rem; color: var(--muted-text-color); text-transform: uppercase; font-weight: 700;">Serie</span>
                <span class="set-val" style="display: block; font-size: 1.1rem; font-weight: 700; color: var(--primary-color);">${ex.sets}</span>
            </div>
            <div style="background: var(--background-color); padding: 8px; border-radius: 8px; text-align: center; border: 1px solid rgba(0,0,0,0.05);">
                <span style="display: block; font-size: 0.7rem; color: var(--muted-text-color); text-transform: uppercase; font-weight: 700;">Cel</span>
                <span class="rep-val" style="display: block; font-size: 1.1rem; font-weight: 700; color: var(--primary-color);">${ex.reps_or_time}</span>
            </div>
        </div>
    `;

    const videoId = extractYoutubeId(ex.youtube_url);
    const videoLink = videoId
        ? `<a href="https://youtu.be/${videoId}" target="_blank" class="video-link">▶ Zobacz wideo</a>`
        : '';

    return `
    <div class="training-card" data-exercise-id="${exerciseId || ''}" data-category-id="${ex.categoryId || ''}">
        <div class="training-card-header">
            <div style="flex-grow: 1; padding-right: 10px;">
                <h4 style="display:inline;">${ex.name}</h4>
                ${affinityBadge}
                ${originalInfo}
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                ${previewBtnHTML}
                <button class="swap-btn" title="Wymień ćwiczenie" data-exercise-index="${index}"><img src="/icons/swap.svg" width="20" height="20" alt="Wymień"></button>
            </div>
        </div>
        <div class="training-meta">
            ${badgeHTML}
            ${modBadge}
            ${kneeBadge}
            <span class="meta-badge badge-lvl-${lvl}">⚡ ${getLevelLabel(lvl)}</span>
            <span class="meta-badge badge-category">📂 ${categoryName}</span>
            ${showEquipBadge ? `<span class="meta-badge badge-equipment">🏋️ ${equipLabel}</span>` : ''}
        </div>
        <p class="pre-training-description" style="padding-left:10px; opacity:0.8;">${ex.description || 'Brak opisu.'}</p>
        ${targetsHTML}
        <div class="training-footer">
            <div>${videoLink}</div>
            ${ex.tempo_or_iso ? `<span class="tempo-badge">Tempo: ${ex.tempo_or_iso}</span>` : ''}
        </div>
    </div>`;
}

export function generateSessionCardHTML(session) {
    const planId = session.planId || 'l5s1-foundation';
    const isDynamic = planId.startsWith('dynamic-');
    const title = session.trainingTitle || 'Trening';
    let statsHtml = '';
    const optionsTime = { hour: '2-digit', minute: '2-digit' };
    const feedbackInfo = formatFeedback(session);
    let feedbackStyle = '';
    if (feedbackInfo.class === 'success') feedbackStyle = 'color: var(--success-color);';
    if (feedbackInfo.class === 'warning') feedbackStyle = 'color: #e67e22;';
    if (feedbackInfo.class === 'danger') feedbackStyle = 'color: var(--danger-color);';

    let completedTimeStr = '';
    if (session.completedAt) completedTimeStr = new Date(session.completedAt).toLocaleTimeString('pl-PL', optionsTime);

    if (session.startedAt && session.completedAt) {
        const startTime = new Date(session.startedAt);
        const endTime = new Date(session.completedAt);

        const durationMs = endTime - startTime;
        const totalMinutes = Math.floor(durationMs / 60000);
        const totalSeconds = Math.floor((durationMs % 60000) / 1000);
        const formattedDurationGross = `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;

        const netSeconds = session.netDurationSeconds !== undefined
            ? session.netDurationSeconds
            : Math.round(durationMs / 1000);

        const netMinutes = Math.floor(netSeconds / 60);
        const netSecRem = netSeconds % 60;
        const formattedDurationNet = `${netMinutes}:${netSecRem.toString().padStart(2, '0')}`;

        statsHtml = `
            <div class="session-stats-grid" style="grid-template-columns: repeat(4, 1fr); gap: 5px;">
                <div class="stat-item">
                    <span class="stat-label">Start</span>
                    <span class="stat-value">${startTime.toLocaleTimeString('pl-PL', optionsTime)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Netto</span>
                    <span class="stat-value" style="color:var(--primary-color)">${formattedDurationNet}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Brutto</span>
                    <span class="stat-value" style="color:#999">${formattedDurationGross}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Feedback</span>
                    <span class="stat-value" style="${feedbackStyle} font-size:0.9rem;">${feedbackInfo.label}</span>
                </div>
            </div>`;
    } else {
        statsHtml = `<div class="session-stats-grid"><div class="stat-item"><span class="stat-label">Zakończono</span><span class="stat-value">${completedTimeStr}</span></div></div>`;
    }

    const exercisesHtml = session.sessionLog && session.sessionLog.length > 0
        ? session.sessionLog.map(item => {
            const isSkipped = item.status === 'skipped';
            const rowStyle = isSkipped ? 'opacity: 0.6; background-color: rgba(0,0,0,0.02);' : '';
            const id = item.exerciseId || item.id;
            const pref = state.userPreferences[id] || { score: 0, difficulty: 0 };
            const isLike = pref.score >= 10;
            const isDislike = pref.score <= -10;
            const diff = pref.difficulty || 0;

            let diffBadge = '';
            if (diff == 1) {
                diffBadge = `
                <button class="reset-diff-btn" data-id="${id}" title="Kliknij, aby cofnąć oznaczenie 'Za trudne'">
                    <span class="diff-badge hard">
                        🔥 Za trudne <span style="opacity:0.5; margin-left:3px;">✕</span>
                    </span>
                </button>`;
            }
            if (diff == -1) {
                diffBadge = `
                <button class="reset-diff-btn" data-id="${id}" title="Kliknij, aby cofnąć oznaczenie 'Za łatwe'">
                    <span class="diff-badge easy">
                        💤 Za łatwe <span style="opacity:0.5; margin-left:3px;">✕</span>
                    </span>
                </button>`;
            }

            let ratingButtons = '';
            if (id && !isSkipped) {
                ratingButtons = `
                    <div class="hist-rating-actions">
                        <button class="rate-btn-hist ${isLike ? 'active' : ''}" data-id="${id}" data-action="like" title="Częściej">👍</button>
                        <button class="rate-btn-hist ${isDislike ? 'active' : ''}" data-id="${id}" data-action="dislike" title="Rzadziej">👎</button>
                    </div>
                `;
            }

            let actualTimeBadge = '';
            if (item.duration && item.duration > 0) {
                const dm = Math.floor(item.duration / 60);
                const ds = item.duration % 60;
                const dStr = dm > 0 ? `${dm}m ${ds}s` : `${ds}s`;
                actualTimeBadge = `<span class="time-badge">⏱ ${dStr}</span>`;
            }

            return `
            <div class="history-exercise-row ${isSkipped ? 'skipped' : 'completed'}" style="${rowStyle}">
                <div class="hex-main">
                    <span class="hex-name">${item.name}</span>
                    <div class="hex-details-row">
                        <span class="target-val">${item.reps_or_time}</span>
                        ${actualTimeBadge}
                        ${diffBadge}
                    </div>
                </div>
                ${ratingButtons}
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
        </details>

        <style>
            .history-exercise-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.8rem 1.5rem;
                border-bottom: 1px solid var(--border-color);
                gap: 10px;
            }

            .hex-main {
                display: flex;
                flex-direction: column;
                gap: 4px;
                flex-grow: 1;
                min-width: 0;
            }

            .hex-name {
                font-weight: 600;
                font-size: 0.95rem;
                color: var(--text-color);
                line-height: 1.2;
            }

            .hex-details-row {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                font-size: 0.8rem;
                color: var(--muted-text-color);
            }

            .time-badge {
                color: var(--secondary-color);
                font-weight: 600;
                background: rgba(10, 147, 150, 0.1);
                padding: 1px 5px;
                border-radius: 4px;
                font-size: 0.75rem;
                white-space: nowrap;
            }

            .reset-diff-btn { background: none; border: none; cursor: pointer; padding: 0; display: inline-flex; }
            .diff-badge {
                font-size: 0.7rem;
                padding: 2px 6px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                white-space: nowrap;
            }
            .diff-badge.easy { color: #0369a1; background: #f0f9ff; border: 1px solid #7dd3fc; }
            .diff-badge.hard { color: #ea580c; background: #fff7ed; border: 1px solid #fdba74; }

            .hist-rating-actions {
                display: flex;
                gap: 6px;
                margin-left: auto;
                flex-shrink: 0;
            }

            .rate-btn-hist {
                background: transparent;
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                padding: 4px 8px;
                cursor: pointer;
                opacity: 0.5;
                filter: grayscale(100%);
                transition: all 0.2s;
                font-size: 1.1rem;
                display: flex;
                align-items: center;
                justify-content: center;
                min-width: 32px;
            }
            .rate-btn-hist:hover { opacity: 0.8; filter: grayscale(50%); transform: scale(1.1); background: #f9f9f9; }
            .rate-btn-hist.active { opacity: 1; filter: grayscale(0%); border-color: var(--primary-color); background: #e0f2fe; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        </style>
        `;
}

function getCurrentWeekDays() { const now = new Date(); const day = now.getDay(); const diff = now.getDate() - day + (day === 0 ? -6 : 1); const monday = new Date(now.setDate(diff)); const weekDays = []; for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); weekDays.push(d); } return weekDays; }
function getIsoDateKey(date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; }