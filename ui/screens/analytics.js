import { state } from '../../state.js';
import dataStore from '../../dataStore.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';

// Konfiguracja progów poziomów (XP)
// 1 rep = 1 XP, 1 sekunda = 1 XP
const LEVEL_THRESHOLDS = [
    { level: 1, xp: 0, label: 'Nowicjusz', class: 'lvl-1' },
    { level: 5, xp: 500, label: 'Adept', class: 'lvl-5' },     // Brąz
    { level: 10, xp: 2000, label: 'Ekspert', class: 'lvl-10' }, // Srebro
    { level: 25, xp: 10000, label: 'Mistrz', class: 'lvl-25' }, // Złoto
    { level: 50, xp: 50000, label: 'Legenda', class: 'lvl-50' } // Platyna/Neon
];

// Helper do obliczania poziomu
const calculateLevelData = (totalVolume) => {
    let currentLvl = LEVEL_THRESHOLDS[0];
    let nextLvl = LEVEL_THRESHOLDS[1];

    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (totalVolume >= LEVEL_THRESHOLDS[i].xp) {
            currentLvl = LEVEL_THRESHOLDS[i];
            nextLvl = LEVEL_THRESHOLDS[i + 1] || null;
        } else {
            break;
        }
    }

    let progress = 100;
    if (nextLvl) {
        const range = nextLvl.xp - currentLvl.xp;
        const gained = totalVolume - currentLvl.xp;
        progress = Math.min(100, Math.max(0, (gained / range) * 100));
    }

    return { current: currentLvl, next: nextLvl, progress };
};

export const renderAnalyticsScreen = async () => {
    const screen = document.getElementById('analytics-screen');
    if (!screen) return;

    screen.innerHTML = `
        <h2 class="section-title">Twoja Kolekcja (Mastery)</h2>
        <p style="opacity:0.7; font-size:0.9rem; margin-bottom:1.5rem;">Zbieraj doświadczenie (XP) za każde powtórzenie i sekundę ćwiczenia.</p>
        <div id="mastery-grid" class="mastery-grid">
            <!-- Skeleton Loading -->
            <div class="skeleton-loading" style="height: 180px; border-radius: 16px;"></div>
            <div class="skeleton-loading" style="height: 180px; border-radius: 16px;"></div>
            <div class="skeleton-loading" style="height: 180px; border-radius: 16px;"></div>
            <div class="skeleton-loading" style="height: 180px; border-radius: 16px;"></div>
        </div>
        <button id="analytics-back-btn" class="action-btn" style="margin-top:2rem;">Wróć</button>
    `;

    screen.querySelector('#analytics-back-btn').addEventListener('click', () => {
        navigateTo('main');
    });

    navigateTo('analytics');

    // --- Pobieranie danych z serwera (zamiast z lokalnej historii) ---
    // Nie używamy showLoader() tutaj, bo mamy Skeleton wewnątrz widoku
    const data = await dataStore.fetchMasteryStats();
    
    const grid = screen.querySelector('#mastery-grid');
    grid.innerHTML = ''; // Usuń skeletony

    if (!data || data.length === 0) {
        grid.innerHTML = `<p style="opacity:0.6; text-align:center; width:100%;">Brak danych. Wykonaj pierwszy trening, aby odblokować karty!</p>`;
    } else {
        data.forEach(item => {
            const { current, next, progress } = calculateLevelData(item.volume);
            
            // Formatowanie jednostek
            let totalStr = '';
            let recordStr = '';
            
            if (item.type === 'time') {
                const totalMin = Math.round(item.volume / 60);
                totalStr = totalMin < 60 ? `${totalMin} min` : `${(totalMin/60).toFixed(1)} h`;
                recordStr = item.maxVolume < 60 ? `${item.maxVolume}s` : `${Math.floor(item.maxVolume/60)}m ${item.maxVolume%60}s`;
            } else {
                totalStr = `${item.volume} rep`;
                recordStr = `${item.maxVolume} rep`;
            }

            // Pobranie ikony/obrazka (jeśli dostępne w library)
            const libItem = state.exerciseLibrary[item.id];
            let icon = '🏋️'; 
            if (libItem) {
                if (libItem.categoryId === 'breathing') icon = '🌬️';
                if (libItem.categoryId.includes('mobility')) icon = '🧘';
                if (libItem.categoryId.includes('core')) icon = '🧱';
                if (libItem.categoryId.includes('nerve')) icon = '⚡';
            }

            const card = document.createElement('div');
            card.className = `mastery-card ${current.class}`;
            card.innerHTML = `
                <div class="card-glow"></div>
                <div class="card-inner">
                    <div class="card-header-row">
                        <div class="card-icon">${icon}</div>
                        <div class="card-lvl-badge">${current.label}</div>
                    </div>
                    <h3 class="card-title">${item.name}</h3>
                    
                    <div class="card-stats">
                        <div class="stat-box">
                            <span class="stat-label">Suma</span>
                            <span class="stat-val">${totalStr}</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-label">Rekord</span>
                            <span class="stat-val">${recordStr}</span>
                        </div>
                    </div>

                    <div class="xp-bar-container">
                        <div class="xp-info">
                            <span>Lvl ${current.level}</span>
                            <span>${next ? 'Lvl ' + next.level : 'MAX'}</span>
                        </div>
                        <div class="xp-track">
                            <div class="xp-fill" style="width: ${progress}%"></div>
                        </div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }
};