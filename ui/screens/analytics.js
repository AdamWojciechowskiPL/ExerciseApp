// js/ui/screens/analytics.js
import { state } from '../../state.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { getAffinityBadge } from '../templates.js';
import { renderTunerModal } from '../modals.js'; // Importujemy Tuner
import dataStore from '../../dataStore.js';

export const renderAnalyticsScreen = async (forceRefresh = false) => {
    const screen = document.getElementById('analytics-screen');
    if (!screen) return;

    navigateTo('analytics');
    
    if (forceRefresh === true) {
        showLoader();
        try {
            await dataStore.fetchUserPreferences();
        } catch (e) { console.error("Błąd odświeżania rankingu:", e); } finally { hideLoader(); }
    }

    // Funkcja do przerysowania ekranu po zmianie w modalu
    const refreshView = () => renderAnalyticsScreen(false);

    // 2. Zbieranie danych i grupowanie
    const allExercises = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id: id, ...data }));
    
    const tiers = { S: [], A: [], B: [], C: [], F: [] };

    allExercises.forEach(ex => {
        const pref = state.userPreferences[ex.id] || { score: 0, difficulty: 0 };
        const score = pref.score || 0;
        const diff = pref.difficulty || 0;
        ex._score = score;
        ex._diff = diff;

        if (state.blacklist.includes(ex.id)) { tiers.F.push(ex); return; }
        if (diff !== 0 || score < 0) { tiers.C.push(ex); } 
        else if (score >= 20) { tiers.S.push(ex); } 
        else if (score > 0) { tiers.A.push(ex); } 
        else { tiers.B.push(ex); }
    });

    const sortByScore = (a, b) => b._score - a._score;
    ['S','A','B','C','F'].forEach(k => tiers[k].sort(sortByScore));

    // 3. Renderowanie HTML
    const renderTierSection = (title, items, icon, description, cssClass) => {
        if (items.length === 0) return '';
        
        const cards = items.map(ex => {
            const badge = getAffinityBadge(ex.id);
            const scoreVal = ex._score !== undefined ? ex._score : 0;
            const scoreDisplay = scoreVal > 0 ? `+${scoreVal}` : `${scoreVal}`;
            
            // Dodajemy klasę 'clickable-rank-card' i data-id
            return `
            <div class="rank-card clickable-rank-card" data-id="${ex.id}">
                <div class="rank-info">
                    <div class="rank-name">${ex.name}</div>
                    ${badge}
                </div>
                <div class="rank-score" title="Punkty affinity">${scoreDisplay}</div>
            </div>`;
        }).join('');

        return `<div class="tier-section ${cssClass}"><div class="tier-header"><span class="tier-icon">${icon}</span><div><h3>${title}</h3><p>${description}</p></div></div><div class="tier-grid">${cards}</div></div>`;
    };

    screen.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
            <h2 class="section-title" style="margin:0;">Ranking Ćwiczeń</h2>
            <button id="refresh-ranking-btn" style="background:none; border:none; cursor:pointer; padding: 8px; opacity: 0.7;" title="Wymuś odświeżenie z serwera"><img src="/icons/refresh-cw.svg" width="20" height="20" alt="Odśwież"></button>
        </div>
        <p style="opacity:0.7; font-size:0.9rem; margin-bottom:1.5rem;">Kliknij ćwiczenie, aby skalibrować jego rangę (Synaptic Tuner).</p>
        
        ${renderTierSection('Tier S (Ulubione)', tiers.S, '💎', 'Najwyższy priorytet w losowaniu.', 'tier-s')}
        ${renderTierSection('Tier A (Lubiane)', tiers.A, '🔥', 'Często pojawiające się w planie.', 'tier-a')}
        ${renderTierSection('Tier C (Problematyczne)', tiers.C, '⚠️', 'Za trudne, za łatwe lub nielubiane.', 'tier-c')}
        ${renderTierSection('Tier B (Neutralne)', tiers.B, '🛡️', 'Standardowa baza ćwiczeń.', 'tier-b')}
        ${renderTierSection('Czarna Lista', tiers.F, '🚫', 'Zablokowane i wykluczone z planów.', 'tier-f')}

        <button id="analytics-back-btn" class="action-btn" style="margin-top:2rem;">Wróć</button>

        <style>
            .tier-section { background: #fff; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; border: 1px solid var(--border-color); }
            .tier-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
            .tier-icon { font-size: 2rem; }
            .tier-header h3 { margin: 0; font-size: 1.1rem; }
            .tier-header p { margin: 0; font-size: 0.8rem; opacity: 0.7; }
            .tier-grid { display: flex; flex-direction: column; gap: 8px; }
            .rank-card { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed #eee; cursor: pointer; transition: background 0.2s; }
            .rank-card:hover { background: #f9f9f9; padding-left:5px; padding-right:5px; margin: 0 -5px; border-radius: 6px; }
            .rank-card:last-child { border-bottom: none; }
            .rank-name { font-size: 0.9rem; font-weight: 600; }
            .rank-score { font-family: monospace; font-weight: bold; opacity: 0.5; font-size: 0.8rem; }
            .tier-s { border-left: 4px solid #f59e0b; background: linear-gradient(to right, #fffbeb, #fff); }
            .tier-a { border-left: 4px solid #0f766e; }
            .tier-c { border-left: 4px solid var(--danger-color); }
            .tier-f { opacity: 0.7; background: #f9f9f9; border-left: 4px solid #999; }
            #refresh-ranking-btn:active { transform: rotate(180deg); transition: transform 0.3s; }
        </style>
    `;

    screen.querySelector('#analytics-back-btn').addEventListener('click', () => { navigateTo('main'); });
    screen.querySelector('#refresh-ranking-btn').addEventListener('click', () => { renderAnalyticsScreen(true); });

    // Obsługa kliknięcia w kartę -> Otwarcie Tunera
    screen.querySelectorAll('.clickable-rank-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            renderTunerModal(id, refreshView);
        });
    });
};