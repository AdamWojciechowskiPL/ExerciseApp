import { state } from '../state.js';
import { extractYoutubeId, calculateSystemLoad, calculateClinicalProfile, getSessionFocus, getISODate } from '../utils.js';
import { BADGES_CONFIG } from '../gamification.js';

// --- HELPERY (WEWNĘTRZNE) ---

const PHASE_NAMES = {
    'control': 'Kontrola',
    'mobility': 'Mobilność',
    'capacity': 'Pojemność',
    'strength': 'Siła',
    'metabolic': 'Metabolizm',
    'deload': 'Deload',
    'rehab': 'Rehab'
};

const GOAL_NAMES = {
    'pain_relief': 'Redukcja Bólu',
    'fat_loss': 'Redukcja Tłuszczu',
    'strength': 'Siła & Hipertrofia',
    'prevention': 'Zdrowie & Prewencja',
    'mobility': 'Sprawność',
    'sport_return': 'Powrót do Sportu',
    'default': 'Ogólnorozwojowy'
};

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
            if (value === 1) return { label: 'Nuda', icon: '🥱', class: 'neutral', bg: '#f3f4f6' };
            if (value === 0) return { label: 'Idealnie', icon: '🎯', class: 'success', bg: '#ecfdf5' };
            if (value === -1) return { label: 'Ciężko', icon: '🥵', class: 'warning', bg: '#fffbeb' };
        }
        else if (type === 'symptom') {
            if (value === 1) return { label: 'Ulga', icon: '🍃', class: 'success', bg: '#ecfdf5' };
            if (value === 0) return { label: 'Stabilnie', icon: '⚖️', class: 'neutral', bg: '#f3f4f6' };
            if (value === -1) return { label: 'Gorzej', icon: '⚡', class: 'danger', bg: '#fef2f2' };
        }
        else if (type === 'pain_monitoring') {
            const during = Number(session.feedback?.during?.max_nprs || 0);
            if (during >= 7) return { label: `Ból wysoki: ${during}/10`, icon: '🚨', class: 'danger', bg: '#fef2f2' };
            if (during >= 4) return { label: `Ból umiarkowany: ${during}/10`, icon: '⚠️', class: 'warning', bg: '#fffbeb' };
            return { label: `Ból niski: ${during}/10`, icon: '✅', class: 'success', bg: '#ecfdf5' };
        }
    }
    if (session.pain_during !== undefined && session.pain_during !== null) {
        return { label: `Ból: ${session.pain_during}`, icon: '🤕', class: 'neutral', bg: '#f3f4f6' };
    }
    return { label: '-', icon: '❓', class: '', bg: '#fff' };
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

export const getAffinityBadge = (exerciseId) => {
    const pref = state.userPreferences[exerciseId] || { score: 0 };
    const score = pref.score || 0;
    let badge = null;

    if (score >= 75) {
        badge = { icon: '👑', label: 'Hit', color: '#b45309', bg: '#fffbeb', border: '#fcd34d' };
    } else if (score >= 20) {
        badge = { icon: '⭐', label: 'Ulubione', color: '#047857', bg: '#ecfdf5', border: '#6ee7b7' };
    } else if (score <= -50) {
        badge = { icon: '📉', label: 'Unikam', color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' };
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

// --- PHASE WIDGET GENERATOR ---
function generatePhaseWidget(phaseData) {
    if (!phaseData) return '';

    let activePhaseId = phaseData.current_phase_stats?.phase_id;
    let sessionsDone = phaseData.current_phase_stats?.sessions_completed || 0;
    let target = phaseData.current_phase_stats?.target_sessions || 12;
    let isOverride = false;
    let overrideLabel = '';
    let educationalMessage = '';

    const goalId = phaseData.template_id || 'default';
    const goalName = GOAL_NAMES[goalId] || 'Plan Treningowy';

    if (phaseData.override && phaseData.override.mode) {
        isOverride = true;
        activePhaseId = phaseData.override.mode;
        sessionsDone = phaseData.override.stats.sessions_completed;
        target = 0;

        if (activePhaseId === 'rehab') {
            overrideLabel = '🚑 REHAB';
            educationalMessage = "Priorytet: Bezpieczeństwo. Zmniejszyliśmy obciążenia, by wyciszyć objawy.";
        }
        else if (activePhaseId === 'deload') {
            overrideLabel = '🔋 DELOAD';
            educationalMessage = "Priorytet: Regeneracja. Lżejszy tydzień pozwoli na superkompensację.";
        }
    }

    const phaseName = PHASE_NAMES[activePhaseId] || activePhaseId.toUpperCase();

    let percent = 0;
    if (!isOverride && target > 0) {
        percent = Math.min(100, Math.round((sessionsDone / target) * 100));
    }

    const widgetClass = isOverride ? 'hero-phase-widget override' : 'hero-phase-widget';
    const barClass = isOverride ? 'phase-progress-fill override' : 'phase-progress-fill';

    let progressText = `${sessionsDone}/${target}`;
    if (isOverride) progressText = `${sessionsDone} wykonanych`;

    return `
        <div class="${widgetClass}">
            <div class="phase-compact-row">
                <div class="phase-meta-col">
                    <span class="phase-label-tiny">CEL GŁÓWNY</span>
                    <span class="phase-value-main">${goalName}</span>
                </div>
                <div class="phase-sep"></div>
                <div class="phase-meta-col">
                    <span class="phase-label-tiny">FAZA ${isOverride ? overrideLabel : ''}</span>
                    <span class="phase-value-main highlight">${phaseName}</span>
                </div>
            </div>

            ${!isOverride ? `
                <div class="phase-progress-wrapper">
                    <div class="phase-progress-track">
                        <div class="${barClass}" style="width: ${percent}%;"></div>
                    </div>
                    <div class="phase-mini-stats">
                        <span>${percent}%</span>
                        <span>${progressText} sesji</span>
                    </div>
                </div>
            ` : `
                <div class="phase-override-info compact">
                    ${educationalMessage}
                </div>
            `}
        </div>
    `;
}

export function generateHeroDashboardHTML(stats) {
    const isLoading = !stats.resilience;
    const resilienceScore = isLoading ? '--' : stats.resilience.score;
    const shieldClass = isLoading ? 'loading' : stats.resilience.status.toLowerCase();
    const progressPercent = stats.progressPercent || 0;
    const progressDegrees = Math.round((progressPercent / 100) * 360);
    const loadingClass = isLoading ? 'skeleton-pulse' : '';
    const weekDays = getCurrentWeekDays();
    const todayKey = getISODate(new Date());

    const weeklyBarsHTML = weekDays.map(date => {
        const dateKey = getISODate(date);
        const dayName = date.toLocaleDateString('pl-PL', { weekday: 'short' }).charAt(0);
        const isToday = dateKey === todayKey;
        const daySessions = state.userProgress ? state.userProgress[dateKey] : null;
        const hasWorkout = daySessions && daySessions.length > 0;
        let statusClass = 'empty';
        if (hasWorkout) statusClass = 'filled'; else if (isToday) statusClass = 'current';
        return `<div class="week-day-col"><div class="day-bar ${statusClass}" title="${dateKey}"></div><span class="day-label">${dayName}</span></div>`;
    }).join('');

    const fatigueScore = stats.fatigueScore || 0;
    let fatigueLabel = 'Świeży';
    let fatigueClass = 'fresh';
    if (fatigueScore >= 80) { fatigueLabel = 'Wysokie'; fatigueClass = 'critical'; }
    else if (fatigueScore >= 40) { fatigueLabel = 'Średnie'; fatigueClass = 'moderate'; }

    const phaseWidgetHTML = generatePhaseWidget(stats.phaseData);

    return `
    <div class="hero-top-row">
        <div class="hero-avatar-wrapper"><div class="progress-ring" style="--progress-deg: ${progressDegrees}deg;"></div><img src="${stats.iconPath || '/icons/badge-level-1.svg'}" class="hero-avatar" alt="Ranga"><div class="level-badge">LVL ${stats.level || 1}</div></div>
        <div class="hero-content">
            <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                <h3 class="hero-rank-title ${loadingClass}">${stats.tierName || 'Ładowanie...'}</h3>
            </div>
            <div class="hero-metrics-grid">
                <div class="metric-item" title="Twoja aktualna seria"><svg class="metric-icon" width="16" height="16"><use href="#icon-streak-fire"/></svg><div class="metric-text"><span class="metric-label">Seria</span><span class="metric-value ${loadingClass}">${stats.streak !== undefined ? stats.streak : '-'} Dni</span></div></div>
                <div class="metric-item" title="Wskaźnik odporności"><svg class="metric-icon" width="16" height="16"><use href="#icon-shield-check"/></svg><div class="metric-text"><span class="metric-label">Tarcza</span><span class="metric-value shield-score ${shieldClass} ${loadingClass}">${resilienceScore}${isLoading ? '' : '%'}</span></div></div>
                <div class="metric-item" title="Poziom zmęczenia"><svg class="metric-icon" width="16" height="16"><use href="#icon-battery"/></svg><div class="metric-text"><span class="metric-label">Zmęczenie</span><span class="metric-value fatigue-score ${fatigueClass} ${loadingClass}">${fatigueLabel}</span></div></div>
            </div>
        </div>
        <div class="hero-weekly-rhythm"><div class="weekly-chart-label">TWÓJ TYDZIEŃ</div><div class="weekly-chart-grid">${weeklyBarsHTML}</div></div>
    </div>

    ${phaseWidgetHTML}
    `;
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
    </div>`;
}

export function generateCalendarPageHTML(dayData, estimatedMinutes, dateObj, wizardData = null) {
    const dayName = dateObj.toLocaleDateString('pl-PL', { weekday: 'long' });
    const dayNumber = dateObj.getDate();
    const monthYear = dateObj.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

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
        : 'Bodyweight';

    const systemLoad = calculateSystemLoad(dayData, false);
    const clinicalTags = calculateClinicalProfile(dayData);
    const focusArea = getSessionFocus(dayData);

    let loadColor = '#4ade80';
    let loadLabel = 'Lekki';
    if (systemLoad > 30) { loadColor = '#facc15'; loadLabel = 'Umiarkowany'; }
    if (systemLoad > 60) { loadColor = '#fb923c'; loadLabel = 'Wymagający'; }
    if (systemLoad > 85) { loadColor = '#ef4444'; loadLabel = 'Maksymalny'; }

    const gridItemStyle = `
        background: rgba(255,255,255,0.6);
        padding: 8px 4px;
        border-radius: 8px;
        text-align: center;
        border: 1px solid rgba(0,0,0,0.05);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        min-height: 80px;
    `;

    const topSlotStyle = `
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
    `;

    const middleSlotStyle = `
        flex-grow: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 2px;
    `;

    const bottomSlotStyle = `
        font-size: 0.6rem;
        text-transform: uppercase;
        color: #888;
        margin-top: auto;
    `;

    const clinicalTagsHTML = clinicalTags.map(tag =>
        `<span class="meta-badge" style="
            background:${tag.color === 'red' ? '#fee2e2' : (tag.color === 'green' ? '#dcfce7' : '#ffedd5')};
            color:${tag.color === 'red' ? '#991b1b' : (tag.color === 'green' ? '#166534' : '#9a3412')};
            border: 1px solid ${tag.color === 'red' ? '#fecaca' : (tag.color === 'green' ? '#bbf7d0' : '#fed7aa')};
        ">${tag.label}</span>`
    ).join(' ');

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
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; margin-top:15px; margin-bottom:15px;">
                    <!-- KAFEL 1: CZAS -->
                    <div style="${gridItemStyle}">
                        <div style="${topSlotStyle}">
                            <div style="font-size:1.4rem;">⏱️</div>
                        </div>
                        <div style="${middleSlotStyle}">
                            <div style="font-weight:800; font-size:0.9rem; color:#333;" id="today-time-val">${estimatedMinutes} min</div>
                        </div>
                        <div style="${bottomSlotStyle}">Przewidywany</div>
                    </div>

                    <!-- KAFEL 2: CEL -->
                    <div style="${gridItemStyle}">
                        <div style="${topSlotStyle}">
                            <div style="font-size:1.4rem;">🎯</div>
                        </div>
                        <div style="${middleSlotStyle}">
                            <div style="font-weight:800; font-size:0.85rem; color:#333; line-height:1.1; padding:0 2px; word-break: break-word;">${focusArea}</div>
                        </div>
                        <div style="${bottomSlotStyle}">Cel Sesji</div>
                    </div>

                    <!-- KAFEL 3: OBCIĄŻENIE -->
                    <div style="${gridItemStyle}">
                        <div style="${topSlotStyle}">
                             <div style="width:100%; height:6px; background:#e5e7eb; border-radius:3px; overflow:hidden;">
                                <div style="width:${systemLoad}%; height:100%; background:${loadColor}; border-radius:3px;"></div>
                            </div>
                        </div>
                        <div style="${middleSlotStyle}">
                            <div style="font-weight:800; font-size:0.9rem; color:#333; line-height: 1.2;">
                                <span style="font-weight:600;">${systemLoad}%</span>
                            </div>
                        </div>
                        <div style="${bottomSlotStyle}">
                            <span>${loadLabel}</span>
                        </div>
                    </div>
                </div>

                <div class="wc-tags">
                    ${clinicalTagsHTML}
                    <span class="meta-badge tag-equipment">🛠️ ${equipmentText}</span>
                </div>

                <div class="sheet-wellness">
                    <div class="sheet-wellness-label">Jak się czujesz?</div>
                    <div class="pain-selector">
                        <div class="pain-option" data-level="0">🚀 <span>Świetnie</span></div>
                        <div class="pain-option selected" data-level="3">🙂 <span>Dobrze</span></div>
                        <div class="pain-option" data-level="5">😐 <span>Średnio</span></div>
                        <div class="pain-option" data-level="7">🤕 <span>Boli</span></div>
                        <div class="pain-option" data-level="9">🛑 <span>Źle</span></div>
                    </div>
                </div>

                <button id="start-mission-btn" class="calendar-action-btn" data-initial-pain="3">
                    <div class="btn-content-wrapper">
                        <span class="btn-icon-bg"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg></span>
                        <span>Rozpocznij Trening</span>
                    </div>
                </button>
            </div>
        </div>
    </div>`;
}

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
            <div class="workout-context-card" style="background-color: #f8f9fa; border: none; padding: 1rem;">
                <div style="text-align: center; padding: 0.5rem 0;">
                    <span style="font-size: 2.5rem; display: block; margin-bottom: 5px;">🔋</span>
                    <h3 class="wc-title" style="color: #64748b; margin-bottom: 2px;">Regeneracja</h3>
                    <p style="font-size: 0.8rem; color: #94a3b8; margin: 0;">Odpocznij i zregeneruj siły.</p>
                </div>
                <button id="force-workout-btn" class="calendar-action-btn" style="margin-top: 0.8rem; font-size: 0.9rem; padding: 0.6rem;">
                    🔥 Zrób dodatkowy trening
                </button>
            </div>
        </div>
    </div>`;
}

// --- NOWA WERSJA FUNKCJI RENDERUJĄCEJ POJEDYNCZY WIERSZ ĆWICZENIA (GRUPOWANIE) ---
function renderGroupedExerciseRow(exerciseGroup, sessionRatings, sessionId = null) {
    const { id, exerciseId, name, sets } = exerciseGroup;
    const realId = exerciseId || id;
    const pref = state.userPreferences[realId] || { score: 0, difficulty: 0 };
    const score = pref.score || 0;
    const displayName = name.replace(/\s*\((Lewa|Prawa)\)/gi, '').trim();

    let scoreText = score > 0 ? `+${score}` : `${score}`;
    let scoreColor = '#6b7280';
    if (score > 0) scoreColor = '#10b981';
    if (score < 0) scoreColor = '#ef4444';

    const scoreContent = score !== 0 ? `[${scoreText}]` : '';

    // Pobieramy status z pierwszej serii (zakładamy, że user ocenia ćwiczenie globalnie)
    const representativeSet = sets[0];
    const difficultyDeviation = representativeSet.difficultyDeviation;
    const rir = representativeSet.rir;
    const rating = representativeSet.rating;

    let difficultyIndicator = '';
    let difficultyClass = '';

    if (difficultyDeviation === 'easy' || (rir !== undefined && rir >= 4)) {
        difficultyIndicator = '⬆️ Łatwe';
        difficultyClass = 'easy';
    } else if (difficultyDeviation === 'hard' || rating === 'hard' || (rir !== undefined && rir <= 0)) {
        difficultyIndicator = '⬇️ Trudne';
        difficultyClass = 'hard';
    }

    const difficultyBadgeStyle = difficultyClass === 'easy'
        ? 'background:#ecfdf5; color:#166534; border:1px solid #10b981;'
        : difficultyClass === 'hard'
            ? 'background:#fef2f2; color:#991b1b; border:1px solid #ef4444;'
            : 'background:#f8fafc; color:#64748b; border:1px solid #e2e8f0;';

    const difficultyBadge = difficultyIndicator
        ? `<span class="difficulty-indicator" style="${difficultyBadgeStyle} padding:2px 8px; border-radius:4px; font-size:0.7rem; font-weight:600; cursor:pointer;" data-id="${realId}" data-current="${difficultyClass}" title="Kliknij aby zmienić">${difficultyIndicator}</span>`
        : '';

    const sessionAction = sessionRatings[realId];
    const isLikeActive = sessionAction === 'like' ? 'active' : '';
    const isDislikeActive = sessionAction === 'dislike' ? 'active' : '';

    const isEasyActive = difficultyClass === 'easy' ? 'active' : '';
    const isHardActive = difficultyClass === 'hard' ? 'active' : '';

    let romInfo = '';
    if (representativeSet.romConstraint) {
        const label = representativeSet.romConstraint.instruction || `${representativeSet.romConstraint.limitDegrees}°`;
        romInfo = `<span class="history-rom-badge">📏 ${label}</span>`;
    }

    // --- TABELA SERII ---
    const setsHtml = sets.map((set, idx) => {
        const duration = set.duration || 0;
        let timeStr = '-';
        if (duration > 0) {
            const m = Math.floor(duration / 60);
            const s = duration % 60;
            timeStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
        }
        const isUnilateral = set.name.includes('(Lewa)') || set.name.includes('(Prawa)');
        const setLabel = isUnilateral
            ? (set.name.includes('Lewa') ? 'L' : 'P')
            : (idx + 1);

        return `
            <div class="set-chip">
                <span class="set-chip-label">${setLabel}</span>
                <span class="set-chip-target">${set.reps_or_time}</span>
                <span class="set-chip-time">${timeStr}</span>
            </div>
        `;
    }).join('');

    return `
    <div class="rating-card history-mode" data-id="${realId}" data-session-id="${sessionId || ''}">
        <div class="rating-card-main">
            <div class="rating-info">
                <div class="rating-heading">
                    <span class="rating-name" title="${displayName}">${displayName}</span>
                    ${romInfo}
                    ${difficultyBadge}
                </div>
                <div class="history-meta-row">
                    <span class="history-set-count">
                        ${sets.length} ${sets.length === 1 ? 'seria' : (sets.length < 5 ? 'serie' : 'serii')}
                    </span>
                    <span class="dynamic-score-val" style="color:${scoreColor};">${scoreContent}</span>
                </div>
            </div>
            <div class="rating-actions-group">
                <div class="difficulty-deviation-group history-mode" aria-label="Ocena trudności">
                    <button class="deviation-btn-hist easy ${isEasyActive}" data-id="${realId}" data-type="easy" title="Oznacz jako łatwe">⬆️</button>
                    <button class="deviation-btn-hist hard ${isHardActive}" data-id="${realId}" data-type="hard" title="Oznacz jako trudne">⬇️</button>
                </div>
                <div class="btn-group-affinity" aria-label="Ocena ćwiczenia">
                    <button class="rate-btn-hist affinity-btn ${isLikeActive}" data-id="${realId}" data-action="like">👍</button>
                    <button class="rate-btn-hist affinity-btn ${isDislikeActive}" data-id="${realId}" data-action="dislike">👎</button>
                </div>
            </div>
        </div>
        <div class="set-breakdown-container">
            ${setsHtml}
        </div>
    </div>`;
}

export function generateSessionCardHTML(session) {
    const planId = session.planId || 'l5s1-foundation';
    const isDynamic = planId.startsWith('dynamic-') || planId.startsWith('rolling-');
    const isProtocol = (session.trainingTitle || '').includes('Bio-Protokół') || (session.trainingTitle || '').includes('Szyja');
    const title = session.trainingTitle || 'Trening';

    let statusBadge = '';
    if (isProtocol) statusBadge = `<span class="meta-badge" style="background:#e0f2fe; color:#0369a1; border-color:#bae6fd;">🧬 BIO</span>`;
    else if (isDynamic) statusBadge = `<span class="meta-badge" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;">🧬 VIRTUAL</span>`;

    const completedDate = new Date(session.completedAt || new Date());
    const dateStr = completedDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    let durationNetto = 0;
    if (session.netDurationSeconds !== undefined) durationNetto = session.netDurationSeconds;
    else if (session.startedAt && session.completedAt) {
        durationNetto = Math.round((new Date(session.completedAt) - new Date(session.startedAt)) / 1000);
    }
    const mins = Math.floor(durationNetto / 60);

    let sessionLoad = 0;
    if (session.sessionLog) sessionLoad = calculateSystemLoad(session.sessionLog, true);
    if (sessionLoad === 0) sessionLoad = 50;

    let loadColor = '#facc15';
    if (sessionLoad > 75) loadColor = '#ef4444';
    else if (sessionLoad < 35) loadColor = '#4ade80';

    const sessionRatings = {};
    if (session.exerciseRatings && Array.isArray(session.exerciseRatings)) {
        session.exerciseRatings.forEach(r => sessionRatings[r.exerciseId] = r.action);
    }

    // --- LOGIKA GRUPOWANIA ---
    const completedLogs = (session.sessionLog || []).filter(l => l.status === 'completed' && !l.isRest);
    const groupedExercises = completedLogs.reduce((acc, log) => {
        const id = log.exerciseId || log.id;
        if (!acc[id]) {
            acc[id] = { ...log, sets: [] };
        }
        acc[id].sets.push(log);
        return acc;
    }, {});
    const groupedArray = Object.values(groupedExercises);

    const exercisesHtml = groupedArray
        .map(item => renderGroupedExerciseRow(item, sessionRatings, session.sessionId))
        .join('');

    const notesHtml = session.notes ? `
        <div class="session-notes" style="background:#fefce8; border:1px solid #fde047; padding:8px; border-radius:6px; margin-top:0.8rem; font-size:0.85rem; color:#854d0e; line-height:1.3;">
            📝 ${session.notes}
        </div>
    ` : '';

    return `
    <div class="calendar-sheet completed-mode history-session-sheet">
        <div class="workout-context-card history-session-card">
            <div class="history-session-header">
                <div class="history-session-topline">
                    <div class="history-session-title-wrap">
                        <div class="history-session-icon">🏆</div>
                        <div>
                            <h3 class="history-session-title">${title}</h3>
                            <div class="history-session-date">${dateStr}</div>
                        </div>
                    </div>
                    ${statusBadge}
                </div>

                <div class="history-session-kpis">
                    <div class="history-kpi-card">
                        <div class="history-kpi-icon">⏱️</div>
                        <div class="history-kpi-value">${mins}m</div>
                        <div class="history-kpi-label">Czas Netto</div>
                    </div>
                    <div class="history-kpi-card">
                        <div class="history-kpi-icon">📊</div>
                        <div class="history-load-track">
                            <div class="history-load-fill" style="width:${sessionLoad}%; background:${loadColor};"></div>
                        </div>
                        <div class="history-kpi-value">${sessionLoad}%</div>
                        <div class="history-kpi-label">Obciążenie</div>
                    </div>
                </div>
                ${notesHtml}
            </div>
            <div class="history-exercise-list">
                ${exercisesHtml}
            </div>
            <div class="history-session-footer">
                <button class="delete-session-btn" data-session-id="${session.sessionId}">
                    <svg width="14" height="14"><use href="#icon-trash"/></svg> Usuń
                </button>
            </div>
        </div>
    </div>`;
}

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
    const formattedEquipLabel = equipLabel.split(',').map(item => item.trim().charAt(0).toUpperCase() + item.trim().slice(1)).join(', ');

    const hasAnimation = !!ex.hasAnimation;
    const affinityBadge = getAffinityBadge(exerciseId);
    const previewBtnHTML = hasAnimation ? `<button class="preview-anim-btn nav-btn" data-exercise-id="${exerciseId}" title="Podgląd animacji" style="padding: 4px 8px; display: flex; align-items: center; gap: 5px; border-color: var(--secondary-color);"><svg width="20" height="20" style="color:var(--secondary-color)"><use href="#icon-eye"/></svg><span style="font-size: 0.75rem; font-weight: 600; color: var(--secondary-color);">Podgląd</span></button>` : '';

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
        let tip = '';

        if (ex.modification.type === 'boost') {
            bg = '#fdf4ff'; color = '#86198f'; border = '#f0abfc';
            tip = "Zwiększamy liczbę serii dla lepszego efektu.";
        }
        else if (ex.modification.type === 'eco') {
            bg = '#eff6ff'; color = '#1d4ed8'; border = '#93c5fd';
            tip = "Oszczędzamy energię.";
        }
        else if (ex.modification.type === 'care' || ex.modification.type === 'sos') {
            bg = '#fff7ed'; color = '#c2410c'; border = '#fdba74';
            tip = "Zmniejszona objętość dla bezpieczeństwa.";
        }
        modBadge = `<span class="meta-badge" style="background:${bg}; color:${color}; border:1px solid ${border}; white-space:nowrap;" title="${tip}">${ex.modification.label}</span>`;
    }

    let romBadge = '';
    if (ex.romConstraint) {
        const label = ex.romConstraint.instruction || `${ex.romConstraint.limitDegrees}°`;
        romBadge = `<span class="meta-badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:800;" title="Ograniczony zakres ruchu dla bezpieczeństwa stawu">📏 ${label}</span>`;
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
        ? `<a href="https://youtu.be/${videoId}" target="_blank" class="link-youtube"
             style="text-decoration:none; font-size:2.2rem; display:flex; align-items:center; justify-content:center; line-height:1; width:100%; height:100%;"
             aria-label="Wideo"
             title="Obejrzyj instrukcję wideo na YouTube">📺</a>`
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
                <button class="swap-btn" aria-label="Wymień ćwiczenie" data-exercise-index="${index}"><svg width="20" height="20" aria-hidden="true"><use href="#icon-swap"/></svg></button>
            </div>
        </div>
        <div class="training-meta">
            ${badgeHTML}
            ${modBadge}
            ${romBadge}
            ${kneeBadge}
            <span class="meta-badge badge-lvl-${lvl}">⚡ ${getLevelLabel(lvl)}</span>
            <span class="meta-badge badge-category">📂 ${categoryName}</span>
            ${showEquipBadge ? `<span class="meta-badge badge-equipment">🛠️ ${formattedEquipLabel}</span>` : ''}
        </div>
        <p class="pre-training-description" style="padding-left:10px; opacity:0.8;">${ex.description || 'Brak opisu.'}</p>
        ${targetsHTML}

        <div class="training-footer" style="display:flex; align-items:center;">
            <div style="flex: 0 0 60px; display:flex; align-items:center; justify-content:center; margin-right:10px;">
                ${videoLink}
            </div>
            <div style="flex:1;">
                ${ex.tempo_or_iso ? `<span class="tempo-badge" style="display:block; width:100%;">Tempo: ${ex.tempo_or_iso}</span>` : ''}
            </div>
        </div>
    </div>`;
}

// --- ALIAS FOR DASHBOARD ---
export const generateCompletedMissionCardHTML = generateSessionCardHTML;
