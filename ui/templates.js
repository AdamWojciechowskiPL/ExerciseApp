// ExerciseApp/ui/templates.js
import { state } from '../state.js';
import { extractYoutubeId, calculateSystemLoad, calculateClinicalProfile, getSessionFocus } from '../utils.js';

// --- HELPERY (WEWNĘTRZNE) ---

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
    }
    // Fallback dla starych danych
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

function getIsoDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
            <div class="metric-item" title="Twoja aktualna seria"><svg class="metric-icon" width="16" height="16"><use href="#icon-streak-fire"/></svg><div class="metric-text"><span class="metric-label">Seria</span><span class="metric-value ${loadingClass}">${stats.streak !== undefined ? stats.streak : '-'} Dni</span></div></div>
            <div class="metric-item" title="Wskaźnik odporności"><svg class="metric-icon" width="16" height="16"><use href="#icon-shield-check"/></svg><div class="metric-text"><span class="metric-label">Tarcza</span><span class="metric-value shield-score ${shieldClass} ${loadingClass}">${resilienceScore}${isLoading ? '' : '%'}</span></div></div>
            <div class="metric-item" title="Czas treningów"><svg class="metric-icon" width="16" height="16"><use href="#icon-clock"/></svg><div class="metric-text"><span class="metric-label">Czas</span><span class="metric-value ${loadingClass}">${isLoading ? '--' : timeLabel}</span></div></div>
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

    const systemLoad = calculateSystemLoad(dayData, false); // false = Plan Mode
    const clinicalTags = calculateClinicalProfile(dayData);
    const focusArea = getSessionFocus(dayData);

    let loadColor = '#4ade80';
    let loadLabel = 'Lekki';
    if (systemLoad > 30) { loadColor = '#facc15'; loadLabel = 'Umiarkowany'; }
    if (systemLoad > 60) { loadColor = '#fb923c'; loadLabel = 'Wymagający'; }
    if (systemLoad > 85) { loadColor = '#ef4444'; loadLabel = 'Maksymalny'; }

    const loadBarHTML = `
        <div class="load-metric-container">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:#475569; margin-bottom:5px;">
                <span style="font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Obciążenie: <span style="color:${loadColor === '#4ade80' ? '#16a34a' : loadColor}">${loadLabel}</span></span>
                <span style="font-weight:600; opacity:0.8;">${systemLoad}%</span>
            </div>
            <div style="width:100%; height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
                <div style="width:${systemLoad}%; height:100%; background:${loadColor}; border-radius:3px; transition: width 0.5s ease;"></div>
            </div>
        </div>
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
                    <div class="time-badge-pill">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <span id="today-duration-display">${estimatedMinutes} min</span>
                    </div>
                </div>

                <div style="font-size:0.85rem; color:#64748b; margin-bottom:12px; font-weight:500;">
                    Cel: <strong style="color:var(--primary-color);">${focusArea}</strong>
                </div>

                ${loadBarHTML}

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

// ============================================================================
// NOWA WERSJA KARTY SESJI W HISTORII (TROPHY ROOM)
// ============================================================================
export function generateSessionCardHTML(session) {
    const planId = session.planId || 'l5s1-foundation';
    const isDynamic = planId.startsWith('dynamic-') || planId.startsWith('rolling-');
    const isProtocol = (session.trainingTitle || '').includes('Bio-Protokół') || (session.trainingTitle || '').includes('Szyja');
    const title = session.trainingTitle || 'Trening';

    // Badge statusu (Prawy Górny Róg)
    let statusBadge = '';
    if (isProtocol) statusBadge = `<span class="meta-badge" style="background:#e0f2fe; color:#0369a1; border-color:#bae6fd;">🧬 BIO-PROTOKÓŁ</span>`;
    else if (isDynamic) statusBadge = `<span class="meta-badge" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;">🧬 VIRTUAL PHYSIO</span>`;

    // Data
    const completedDate = new Date(session.completedAt || new Date());
    const dateStr = completedDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    // Obliczanie czasu
    let durationNetto = 0;
    if (session.netDurationSeconds !== undefined) durationNetto = session.netDurationSeconds;
    else if (session.startedAt && session.completedAt) {
        durationNetto = Math.round((new Date(session.completedAt) - new Date(session.startedAt)) / 1000);
    }
    const mins = Math.floor(durationNetto / 60);

    // Feedback Info
    const fb = formatFeedback(session);

    // Odtwarzanie System Load (Teraz używamy uniwersalnej funkcji)
    let sessionLoad = 0;
    if (session.sessionLog) {
        sessionLoad = calculateSystemLoad(session.sessionLog, true); // true = fromHistory
    }
    if (sessionLoad === 0) sessionLoad = 50; // Fallback wizualny

    let loadColor = '#facc15'; // Umiarkowany
    if (sessionLoad > 75) loadColor = '#ef4444'; // Wysoki
    else if (sessionLoad < 35) loadColor = '#4ade80'; // Niski

    // --- MAPOWANIE OCEN SESJI (HISTORYCZNE) ---
    // Służy do zaznaczenia, co user kliknął W TRAKCIE sesji
    const sessionRatings = {};
    if (session.exerciseRatings && Array.isArray(session.exerciseRatings)) {
        session.exerciseRatings.forEach(r => sessionRatings[r.exerciseId] = r.action);
    }

    // LISTA ĆWICZEŃ (Nowy Styl)
    const exercisesHtml = (session.sessionLog || []).filter(l => l.status === 'completed' && !l.isRest).map(item => {
        const id = item.exerciseId || item.id;
        const displayName = item.name.replace(/\s*\((Lewa|Prawa)\)/gi, '').trim();

        // 1. GLOBALNE AFFINITY (AKTUALNY WYNIK)
        // To jest "live" wynik z bazy, który może się zmienić
        const pref = state.userPreferences[id] || { score: 0, difficulty: 0 };
        const score = pref.score || 0;
        const affinityBadge = getAffinityBadge(id);

        // Wyświetlanie surowego wyniku
        let scoreText = score > 0 ? `+${score}` : `${score}`;
        let scoreColor = '#6b7280'; // gray
        if (score > 0) scoreColor = '#10b981'; // green
        if (score < 0) scoreColor = '#ef4444'; // red
        const rawScoreDisplay = `<span style="font-size:0.75rem; font-weight:800; color:${scoreColor}; margin-left:4px;">[${scoreText}]</span>`;

        // Wyświetlanie rzeczywistego czasu
        let actualTimeBadge = '';
        if (item.duration && item.duration > 0) {
            const dm = Math.floor(item.duration / 60);
            const ds = item.duration % 60;
            const dStr = dm > 0 ? `${dm}m ${ds}s` : `${ds}s`;
            actualTimeBadge = `<span class="time-badge" style="background:#fefce8; color:#b45309; border:1px solid #fde047; font-size:0.7rem;">⏱ ${dStr}</span>`;
        }

        // --- 2. USTAWIENIE STANU PRZYCISKÓW ---
        // Affinity: Bierzemy z zapisu sesji (sessionRatings), bo to jest "Historyczne Głosowanie"
        const sessionAction = sessionRatings[id]; // 'like', 'dislike'

        // Difficulty: Bierzemy z GLOBALNEGO STANU (pref.difficulty), bo to jest "Trwała Flaga"
        // Jeśli ustawiłem "Za trudne" miesiąc temu, to nadal jest "Za trudne", dopóki nie zmienię.
        const currentDiff = pref.difficulty || 0; // -1, 0, 1

        const isLikeActive = sessionAction === 'like' ? 'active' : '';
        const isDislikeActive = sessionAction === 'dislike' ? 'active' : '';

        const isEasySelected = currentDiff === -1 ? 'selected' : '';
        const isHardSelected = currentDiff === 1 ? 'selected' : '';

        return `
        <div class="rating-card history-mode" data-id="${id}" style="padding: 10px; border-bottom: 1px solid #f0f0f0;">
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                    <span style="font-weight:700; font-size:0.95rem; color:#333;">${displayName}</span>
                    ${affinityBadge}
                    ${rawScoreDisplay}
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="time-badge" style="background:#f3f4f6; color:#666; border:1px solid #e5e7eb; font-size:0.7rem;">
                        Cel: ${item.reps_or_time}
                    </span>
                    ${actualTimeBadge}
                    <span style="font-size:0.7rem; color:#999;">Seria ${item.currentSet}/${item.totalSets}</span>
                </div>
            </div>

            <div class="rating-actions-group">
                <!-- Grupa LIKE / DISLIKE (Source: Session History) -->
                <div class="btn-group-affinity" style="background:transparent; border:1px solid #e5e7eb;">
                    <button class="rate-btn-hist affinity-btn ${isLikeActive}"
                            data-id="${id}" data-action="like" title="Super">👍</button>
                    <button class="rate-btn-hist affinity-btn ${isDislikeActive}"
                            data-id="${id}" data-action="dislike" title="Słabo">👎</button>
                </div>

                <!-- Grupa TRUDNOŚĆ (Source: Global Preference) -->
                <div class="btn-group-difficulty" style="background:transparent; border:1px solid #e5e7eb;">
                    <button class="rate-btn-hist diff-btn ${isEasySelected}"
                            data-id="${id}" data-action="easy" title="Za łatwe">💤</button>
                    <button class="rate-btn-hist diff-btn ${isHardSelected}"
                            data-id="${id}" data-action="hard" title="Za trudne">🔥</button>
                </div>
            </div>
        </div>`;
    }).join('');

    const notesHtml = session.notes ? `
        <div class="session-notes" style="background:#fefce8; border:1px solid #fde047; padding:10px; border-radius:8px; margin-top:1rem; font-size:0.9rem; color:#854d0e;">
            <strong>📝 Notatka:</strong> ${session.notes}
        </div>
    ` : '';

    return `
    <div class="calendar-sheet completed-mode" style="border:none; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin-bottom: 2rem;">
        <!-- Header Karty -->
        <div class="workout-context-card" style="background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%); border: 1px solid var(--success-color); border-radius: 12px; padding: 0; overflow:hidden;">

            <!-- Górny pasek -->
            <div style="padding: 1.2rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 5px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="font-size:1.8rem;">🏆</div>
                        <div>
                            <h3 style="margin:0; font-size:1.1rem; color:#166534; line-height:1.2;">${title}</h3>
                            <div style="font-size:0.75rem; color:#666; margin-top:2px;">${dateStr}</div>
                        </div>
                    </div>
                    ${statusBadge}
                </div>

                <!-- Grid Statystyk -->
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; margin-top:15px;">
                    <!-- Czas -->
                    <div style="background:rgba(255,255,255,0.6); padding:8px 4px; border-radius:8px; text-align:center; border:1px solid rgba(0,0,0,0.05);">
                        <div style="font-size:1.2rem;">⏱️</div>
                        <div style="font-weight:800; font-size:0.9rem; color:#333;">${mins} min</div>
                        <div style="font-size:0.6rem; text-transform:uppercase; color:#888;">Czas Netto</div>
                    </div>
                    <!-- Feedback -->
                    <div style="background:${fb.bg}; padding:8px 4px; border-radius:8px; text-align:center; border:1px solid rgba(0,0,0,0.05);">
                        <div style="font-size:1.2rem;">${fb.icon}</div>
                        <div style="font-weight:800; font-size:0.9rem; color:#333;">${fb.label}</div>
                        <div style="font-size:0.6rem; text-transform:uppercase; color:#888;">Odbiór</div>
                    </div>
                    <!-- Load -->
                    <div style="background:rgba(255,255,255,0.6); padding:8px 4px; border-radius:8px; text-align:center; border:1px solid rgba(0,0,0,0.05);">
                        <div style="width:100%; height:6px; background:#e5e7eb; border-radius:3px; margin: 8px 0;">
                            <div style="width:${sessionLoad}%; height:100%; background:${loadColor}; border-radius:3px;"></div>
                        </div>
                        <div style="font-weight:800; font-size:0.9rem; color:#333;">${sessionLoad}%</div>
                        <div style="font-size:0.6rem; text-transform:uppercase; color:#888;">Obciążenie</div>
                    </div>
                </div>

                ${notesHtml}
            </div>

            <!-- Lista Ćwiczeń -->
            <div class="history-exercise-list" style="background:#fff;">
                ${exercisesHtml}
            </div>

            <!-- Stopka z Opcjami -->
            <div style="padding: 10px; background:#f9fafb; border-top:1px solid #f3f4f6; display:flex; justify-content:flex-end;">
                <button class="delete-session-btn" data-session-id="${session.sessionId}" style="background:transparent; border:none; color:#ef4444; font-size:0.8rem; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px; opacity:0.7; transition:opacity 0.2s;">
                    <svg width="16" height="16"><use href="#icon-trash"/></svg> Usuń Sesję
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
        if (ex.modification.type === 'boost') {
            bg = '#fdf4ff'; color = '#86198f'; border = '#f0abfc';
        }
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

    // MODYFIKACJA: Ikona wideo wewnątrz dedykowanego kontenera (60px)
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
                <button class="swap-btn" title="Wymień ćwiczenie" data-exercise-index="${index}"><svg width="20" height="20"><use href="#icon-swap"/></svg></button>
            </div>
        </div>
        <div class="training-meta">
            ${badgeHTML}
            ${modBadge}
            ${kneeBadge}
            <span class="meta-badge badge-lvl-${lvl}">⚡ ${getLevelLabel(lvl)}</span>
            <span class="meta-badge badge-category">📂 ${categoryName}</span>
            ${showEquipBadge ? `<span class="meta-badge badge-equipment">🛠️ ${formattedEquipLabel}</span>` : ''}
        </div>
        <p class="pre-training-description" style="padding-left:10px; opacity:0.8;">${ex.description || 'Brak opisu.'}</p>
        ${targetsHTML}

        <!-- ZMODYFIKOWANA STOPKA: Align Items Center -->
        <div class="training-footer" style="display:flex; align-items:center;">
            <!-- Dedykowana kolumna dla ikony wideo (60px) -->
            <div style="flex: 0 0 60px; display:flex; align-items:center; justify-content:center; margin-right:10px;">
                ${videoLink}
            </div>
            <!-- Tekst (Tempo) -->
            <div style="flex:1;">
                ${ex.tempo_or_iso ? `<span class="tempo-badge" style="display:block; width:100%;">Tempo: ${ex.tempo_or_iso}</span>` : ''}
            </div>
        </div>
    </div>`;
}

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

export function generateCompletedMissionCardHTML(session) {
    // To jest skrócona wersja dla Dashboardu (mała karta)
    const durationSeconds = session.netDurationSeconds || 0;
    const minutes = Math.floor(durationSeconds / 60);
    const feedbackInfo = formatFeedback(session);

    const completionDate = new Date(session.completedAt || new Date());
    const dayName = completionDate.toLocaleDateString('pl-PL', { weekday: 'long' });
    const dayNumber = completionDate.getDate();
    const monthYear = completionDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

    const title = session.trainingTitle || "Trening";

    return `
    <div class="calendar-sheet completed-mode shine-effect">
        <div class="calendar-top-binding success-binding"></div>

        <div class="calendar-date-header">
            <span class="calendar-day-name success-text">${dayName}</span>
            <span class="calendar-day-number success-text">${dayNumber}</span>
            <span class="calendar-month-year">${monthYear}</span>
        </div>

        <div class="calendar-body" style="position: relative;">
            <div class="completion-stamp">WYKONANE</div>

            <div class="workout-context-card" style="background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%); border-color: var(--success-color);">
                <div class="wc-header" style="justify-content: center; flex-direction: column; text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 5px;">🏆</div>
                    <h3 class="wc-title" style="color: var(--text-color); font-size: 1.2rem;">${title}</h3>
                    <p style="font-size: 0.8rem; color: #666; margin: 2px 0 10px 0;">Misja zakończona sukcesem</p>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 1rem;">
                    <div style="text-align: center; background: rgba(255,255,255,0.6); padding: 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);">
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #888; font-weight: 700;">Czas</div>
                        <div style="font-weight: 800; color: var(--success-color); font-size: 1.1rem;">${minutes} min</div>
                    </div>
                    <div style="text-align: center; background: rgba(255,255,255,0.6); padding: 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);">
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #888; font-weight: 700;">Ocena</div>
                        <div style="font-weight: 800; color: var(--text-color); font-size: 0.9rem; line-height: 1.6;">${feedbackInfo.label}</div>
                    </div>
                </div>

                <button class="view-details-btn" data-date="${getIsoDateKey(completionDate)}" style="width: 100%; border-color: var(--success-color); color: var(--success-color); background: transparent;">
                    Zobacz Szczegóły ➝
                </button>
            </div>
        </div>
    </div>`;
}