// js/ui/templates.js
import { state } from '../state.js';

// ============================================================
// HELPERY (Formatowanie tekstu dla Badge'y)
// ============================================================

const formatCategoryName = (catId) => {
    if (!catId) return 'Ogólne';
    // Zamienia "core_anti_extension" na "Core Anti Extension"
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

// ============================================================
// GENERATORY HTML
// ============================================================

// 1. HERO DASHBOARD (Okrągły pasek + Tarcza)
export function generateHeroDashboardHTML(stats) {
    const progressDegrees = Math.round((stats.progressPercent / 100) * 360);
    let shieldClass = stats.resilience.status.toLowerCase(); 
    
    return `
        <div class="hero-avatar-wrapper">
            <div class="progress-ring" style="--progress-deg: ${progressDegrees}deg;"></div>
            <img src="${stats.iconPath}" class="hero-avatar" alt="Ranga">
            <div class="level-badge">LVL ${stats.level}</div>
        </div>

        <div class="hero-content">
            <h3 class="hero-rank-title">${stats.tierName}</h3>
            
            <div class="hero-metrics-grid">
                <div class="metric-item">
                    <img src="/icons/streak-fire.svg" class="metric-icon" alt="Ogień">
                    <div class="metric-text">
                        <span class="metric-label">Seria</span>
                        <span class="metric-value">${stats.streak} Dni</span>
                    </div>
                </div>

                <div class="metric-item">
                    <img src="/icons/shield-check.svg" class="metric-icon" alt="Tarcza">
                    <div class="metric-text">
                        <span class="metric-label">Tarcza</span>
                        <span class="metric-value shield-score ${shieldClass}">
                            ${stats.resilience.score}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 2. KARTA MISJI (Dziś + Wellness Check-in)
export function generateMissionCardHTML(dayData, estimatedMinutes) {
    const equipmentSet = new Set();
    [...(dayData.warmup || []), ...(dayData.main || []), ...(dayData.cooldown || [])].forEach(ex => {
        if (ex.equipment) ex.equipment.split(',').forEach(item => equipmentSet.add(item.trim()));
    });
    const equipmentText = equipmentSet.size > 0 ? [...equipmentSet].join(', ') : 'Brak sprzętu';

    return `
    <div class="mission-card">
        <div class="mission-header">
            <div>
                <span class="mission-day-badge">DZIEŃ ${dayData.dayNumber}</span>
                <h3 class="mission-title">${dayData.title}</h3>
                <p style="font-size:0.85rem; opacity:0.7; margin:0">Sprzęt: ${equipmentText}</p>
            </div>
            <div class="estimated-time-badge">
                <img src="/icons/clock.svg" width="16" height="16" alt="Czas">
                <span id="mission-time-val">${estimatedMinutes} min</span>
            </div>
        </div>

        <div class="wellness-section">
            <div class="wellness-label">
                <span>Wellness Check-in</span>
                <span style="font-weight:400">Jak się czujesz?</span>
            </div>
            
            <div class="pain-selector">
                <div class="pain-option selected" data-level="0">
                    🚀 <span>Świetnie</span>
                </div>
                <div class="pain-option" data-level="3">
                    🙂 <span>Dobrze</span>
                </div>
                <div class="pain-option" data-level="5">
                    😐 <span>Średnio</span>
                </div>
                <div class="pain-option" data-level="7">
                    🤕 <span>Boli</span>
                </div>
                <div class="pain-option" data-level="9">
                    🛑 <span>Krytycznie</span>
                </div>
            </div>
        </div>

        <button id="start-mission-btn" class="action-btn" data-initial-pain="0">Start Misji</button>
    </div>
    `;
}

// 3. KARTA PODGLĄDU TRENINGU (Pre-Training) - NOWY WYGLĄD
export function generatePreTrainingCardHTML(ex, index) {
    const uniqueId = `ex-${index}`;
    
    // Dane do tagów
    const lvl = ex.difficultyLevel || 1;
    const categoryName = formatCategoryName(ex.categoryId);
    const equipment = ex.equipment || 'Brak sprzętu';

    return `
        <div class="training-card" data-exercise-id="${ex.id || ''}" data-category-id="${ex.categoryId || ''}">
            
            <!-- 1. NAGŁÓWEK -->
            <div class="training-card-header">
                <h4>${ex.name}</h4>
                <button class="swap-btn" title="Wymień ćwiczenie" data-exercise-index="${index}">
                    <img src="/icons/swap.svg" width="20" height="20" alt="Wymień">
                </button>
            </div>
            
            <!-- 2. TAGI (METADANE) -->
            <div class="training-meta">
                <span class="meta-badge badge-lvl-${lvl}">⚡ ${getLevelLabel(lvl)}</span>
                <span class="meta-badge badge-category">📂 ${categoryName}</span>
                <span class="meta-badge badge-equipment">🏋️ ${equipment}</span>
            </div>

            <!-- 3. OPIS -->
            <p class="pre-training-description" style="padding-left:10px; opacity:0.8;">
                ${ex.description || 'Brak opisu.'}
            </p>
            
            <!-- 4. INPUTY (GRID) - Nowoczesny styl -->
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

            <!-- 5. STOPKA (Wideo i Tempo) -->
            <div class="training-footer">
                <div>
                    ${ex.youtube_url ? `<a href="${ex.youtube_url}" target="_blank" class="video-link">▶ Zobacz wideo</a>` : ''}
                </div>
                ${ex.tempo_or_iso ? `<span class="tempo-badge">Tempo: ${ex.tempo_or_iso}</span>` : ''}
            </div>
        </div>
    `;
}

// 4. KARTA SESJI (HISTORIA)
export function generateSessionCardHTML(session) {
    const planId = session.planId || 'l5s1-foundation';
    const planForHistory = state.trainingPlans[planId];
    const trainingDay = planForHistory ? planForHistory.Days.find(d => d.dayNumber === session.trainingDayId) : null;
    const title = trainingDay ? trainingDay.title : (session.trainingTitle || 'Trening');
    const optionsTime = { hour: '2-digit', minute: '2-digit' };
    
    let statsHtml = '';
    let completedTimeStr = '';
    
    if (session.completedAt) {
        completedTimeStr = new Date(session.completedAt).toLocaleTimeString('pl-PL', optionsTime);
    }

    if (session.startedAt && session.completedAt) {
        const startTime = new Date(session.startedAt);
        const endTime = new Date(session.completedAt);
        const durationMs = endTime - startTime;
        const totalMinutes = Math.floor(durationMs / 60000);
        const totalSeconds = Math.floor((durationMs % 60000) / 1000);
        const formattedDuration = `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;
        
        statsHtml = `
            <div class="session-stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Start</span>
                    <span class="stat-value">${startTime.toLocaleTimeString('pl-PL', optionsTime)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Koniec</span>
                    <span class="stat-value">${endTime.toLocaleTimeString('pl-PL', optionsTime)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Czas</span>
                    <span class="stat-value">${formattedDuration}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Ból</span>
                    <span class="stat-value">${session.pain_during || '-'}/10</span>
                </div>
            </div>
        `;
    } else {
        statsHtml = `
            <div class="session-stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Zakończono</span>
                    <span class="stat-value">${completedTimeStr}</span>
                </div>
            </div>`;
    }

    const exercisesHtml = session.sessionLog && session.sessionLog.length > 0 
        ? session.sessionLog.map(item => {
            const isSkipped = item.status === 'skipped';
            const statusLabel = isSkipped ? 'Pominięto' : 'OK';
            const statusClass = isSkipped ? 'skipped' : 'completed';
            return `
            <div class="history-exercise-row ${statusClass}">
                <div class="hex-main">
                    <span class="hex-name">${item.name}</span>
                    <span class="hex-details">Seria ${item.currentSet}/${item.totalSets} • ${item.reps_or_time}</span>
                </div>
                <div class="hex-status">
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                </div>
            </div>`;
        }).join('') 
        : '<p class="no-data-msg">Brak szczegółowego logu.</p>';

    return `
        <details class="details-session-card" open>
            <summary>
                <div class="summary-content">
                    <span class="summary-title">${title}</span>
                    <button class="delete-session-btn icon-btn" data-session-id="${session.sessionId}" title="Usuń wpis">
                        <img src="/icons/trash.svg" width="18" height="18" alt="Usuń">
                    </button>
                </div>
            </summary>
            <div class="details-session-card-content">
                ${statsHtml}
                ${session.notes ? `<div class="session-notes"><strong>Notatki:</strong> ${session.notes}</div>` : ''}
                <div class="history-exercise-list">
                    ${exercisesHtml}
                </div>
            </div>
        </details>
    `;
}

export function generateCompletedMissionCardHTML(session) {
    // Formatowanie czasu trwania (sekundy -> mm:ss)
    const durationSeconds = session.netDurationSeconds || 0;
    const minutes = Math.floor(durationSeconds / 60);
    
    // Ból (jeśli był podany)
    const painLevel = session.pain_during ? `${session.pain_during}/10` : '-';

    return `
    <div class="mission-card completed">
        <div class="completed-header">
            <div class="completed-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <h3 class="completed-title">Misja Wykonana!</h3>
            <p class="completed-subtitle">Dobra robota. Odpocznij przed jutrem.</p>
        </div>

        <div class="completed-stats">
            <div class="c-stat">
                <div class="c-stat-val">${minutes} min</div>
                <div class="c-stat-label">Czas</div>
            </div>
            <div class="c-stat">
                <div class="c-stat-val">${painLevel}</div>
                <div class="c-stat-label">Ból</div>
            </div>
        </div>

        <button class="view-details-btn" data-date="${session.completedAt}">
            Zobacz Szczegóły ➝
        </button>
    </div>
    `;
}