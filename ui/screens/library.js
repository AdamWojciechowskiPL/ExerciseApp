// js/ui/screens/library.js - "The Atlas" (Unified Library & Analytics)
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { getAffinityBadge } from '../templates.js';
import { renderTunerModal } from '../modals.js';
import dataStore from '../../dataStore.js';

// --- STAN LOKALNY ---
let atlasState = {
    search: '',
    activeFilter: 'all', 
    collapsedMap: false
};

// --- DEFINICJE STREF CIAŁA (Konfiguracja) ---
const ZONE_MAPPING = {
    'cervical': { label: 'Szyja', icon: '🧣', cats: ['neck', 'cervical'] },
    'thoracic': { label: 'Górne Plecy', icon: '🔙', cats: ['thoracic', 'posture'] },
    'lumbar_general': { label: 'Lędźwia / Core', icon: '🧱', cats: ['core_anti_extension', 'core_anti_flexion', 'core_anti_rotation', 'lumbar'] },
    'hip_mobility': { label: 'Biodra', icon: '⚙️', cats: ['hip_mobility', 'glute_activation', 'piriformis'] },
    'sciatica': { label: 'Nogi / Nerw', icon: '⚡', cats: ['nerve_flossing', 'sciatica', 'legs'] }
};

// --- RENDEROWANIE GŁÓWNE ---
export const renderLibraryScreen = async (searchTerm = '') => {
    const container = containers.exerciseLibrary;
    if (!container) return;

    navigateTo('library');

    if (!state.userPreferences || Object.keys(state.userPreferences).length === 0) {
        try { await dataStore.fetchUserPreferences(); } catch(e) {}
    }

    if (searchTerm) {
        atlasState.search = searchTerm;
        atlasState.activeFilter = 'all';
    }

    // STYLE CSS (Wstrzyknięte)
    const styles = `
        <style>
            /* --- LAYOUT & HEADER --- */
            .atlas-header {
                position: sticky;
                top: 0;
                background: var(--background-color);
                z-index: 50;
                padding-bottom: 5px;
                padding-top: 10px;
                width: 100%;
            }
            .search-bar-wrapper {
                position: relative;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                width: 100%;
            }
            .atlas-search-input {
                width: 100%;
                padding: 12px 16px;
                border-radius: 12px;
                border: 1px solid var(--border-color);
                background: #fff;
                font-size: 0.95rem;
                box-shadow: 0 2px 8px rgba(0,0,0,0.03);
                outline: none;
                color: var(--text-color);
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .atlas-search-input:focus {
                border-color: var(--primary-color);
                box-shadow: 0 4px 12px rgba(0,95,115,0.15);
            }

            /* --- ZONE SELECTOR (HUD) --- */
            .zone-hud-container {
                display: flex;
                gap: 10px;
                overflow-x: auto;
                padding: 5px 2px 15px 2px;
                scrollbar-width: none;
                -webkit-overflow-scrolling: touch;
            }
            .zone-hud-container::-webkit-scrollbar { display: none; }

            .zone-tile {
                flex: 0 0 auto;
                width: 110px;
                height: 70px;
                background: #fff;
                border-radius: 12px;
                border: 1px solid var(--border-color);
                position: relative;
                overflow: hidden;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
                display: flex;
                flex-direction: column;
                justify-content: center;
                padding: 12px;
            }
            
            .zone-tile:active { transform: scale(0.96); }
            
            /* Aktywna strefa */
            .zone-tile.active {
                border-color: var(--primary-color);
                background: #f0fdfa; /* Bardzo jasny cyjan */
                box-shadow: 0 4px 12px rgba(0,95,115,0.15);
            }

            .zt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 0.8rem;
                font-weight: 700;
                color: var(--text-color);
                margin-bottom: 4px;
            }
            
            .zt-count {
                font-size: 0.7rem;
                font-weight: 500;
                color: var(--muted-text-color);
            }
            
            .zone-tile.active .zt-count {
                color: var(--primary-color);
                font-weight: 700;
            }

            /* --- CHIPS (Secondary Filter) --- */
            .chips-scroller {
                display: flex;
                flex-wrap: nowrap;
                gap: 8px;
                overflow-x: auto;
                padding: 0 2px 10px 2px;
                scrollbar-width: none;
            }
            .chips-scroller::-webkit-scrollbar { display: none; }
            
            .chip {
                flex: 0 0 auto;
                padding: 6px 14px;
                border-radius: 20px;
                background: #f8f9fa;
                border: 1px solid transparent;
                font-size: 0.8rem;
                font-weight: 600;
                color: var(--muted-text-color);
                cursor: pointer;
                transition: all 0.2s;
            }
            .chip.active {
                background: #fff;
                color: var(--primary-color);
                border-color: var(--primary-color);
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }

            /* --- EXERCISE CARDS --- */
            .atlas-grid {
                display: flex; flex-direction: column; gap: 12px; padding-bottom: 80px; 
            }
            .atlas-card {
                background: #fff;
                border-radius: 12px;
                padding: 14px;
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 12px;
                align-items: start;
                border: 1px solid var(--border-color);
                border-left-width: 5px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.03);
            }
            .ac-title { font-weight: 700; font-size: 1rem; color: var(--text-color); line-height: 1.3; }
            .ac-desc { font-size: 0.8rem; color: #666; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 4px; }
            
            .ac-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
            .meta-tag { font-size: 0.65rem; padding: 3px 8px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; text-transform: uppercase; white-space: nowrap; }
            .tag-level { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
            .tag-category { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
            .tag-equipment { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }

            .ac-footer { display: flex; gap: 12px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #eee; }
            .link-btn { font-size: 0.75rem; text-decoration: none; color: var(--secondary-color); font-weight: 600; display: flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer; padding: 0; }
            
            .ac-actions { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 55px; border-left: 1px solid #eee; padding-left: 10px; justify-content: center; height: 100%; }
            .ac-score { font-weight: 800; font-size: 0.85rem; opacity: 0.8; background: #f3f4f6; padding: 4px 8px; border-radius: 6px; min-width: 40px; text-align: center; }
            
            .icon-btn { background: transparent; border: 1px solid transparent; cursor: pointer; padding: 8px; border-radius: 50%; transition: all 0.2s; font-size: 1.2rem; line-height: 1; }
            .icon-btn:hover { background: #f0f0f0; transform: scale(1.1); }
            
            /* Tier Borders */
            .atlas-card[data-tier="S"] { border-left-color: #f59e0b; background: linear-gradient(90deg, #fffbeb 0%, #fff 100%); }
            .atlas-card[data-tier="A"] { border-left-color: #10b981; }
            .atlas-card[data-tier="B"] { border-left-color: #9ca3af; }
            .atlas-card[data-tier="C"] { border-left-color: #ef4444; }
        </style>
    `;

    container.innerHTML = `
        ${styles}
        <div class="atlas-header">
            <div class="search-bar-wrapper">
                <input type="text" class="atlas-search-input" placeholder="Znajdź ćwiczenie..." value="${atlasState.search}">
            </div>
            
            <div class="chips-scroller" id="atlas-chips">
                <!-- Generowane dynamicznie -->
            </div>
        </div>

        <div class="zone-hud-container" id="zone-hud">
            <!-- Tutaj wstawimy nowe kafelki stref -->
        </div>

        <div style="height: 15px;"></div> <!-- Spacer -->

        <div class="atlas-grid" id="atlas-grid">
            <!-- Karty ćwiczeń -->
        </div>
    `;

    renderChips();
    renderZoneSelector(); // NOWY RENDERER
    renderExerciseList();

    // Event Listeners
    const searchInput = container.querySelector('.atlas-search-input');
    searchInput.addEventListener('input', (e) => {
        atlasState.search = e.target.value;
        renderExerciseList();
    });
};

// --- RENDEROWANIE FILTRÓW (CHIPS - TYLKO STATUS) ---
function renderChips() {
    const container = document.getElementById('atlas-chips');
    if (!container) return;

    const filters = [
        { id: 'all', label: 'Wszystkie' },
        { id: 'tier_s', label: '💎 Ulubione' },
        { id: 'tier_a', label: '🔥 Dobre' },
        { id: 'blacklist', label: '🚫 Blokowane' }
    ];

    container.innerHTML = filters.map(f => `
        <button class="chip ${atlasState.activeFilter === f.id ? 'active' : ''}" 
                data-id="${f.id}" 
                data-tier="${f.id === 'tier_s' ? 'S' : (f.id === 'blacklist' ? 'C' : '')}">
            ${f.label}
        </button>
    `).join('');

    container.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => {
            atlasState.activeFilter = btn.dataset.id;
            if (atlasState.search && btn.dataset.id !== 'all') {
                atlasState.search = '';
                document.querySelector('.atlas-search-input').value = '';
            }
            renderChips();
            renderZoneSelector(); // Update HUD active state
            renderExerciseList();
        });
    });
}

// --- NOWY RENDERER: ZONE HUD SELECTOR (CLEAN) ---
function renderZoneSelector() {
    const container = document.getElementById('zone-hud');
    if (!container) return;

    const stats = calculateZoneStats();

    const tilesHTML = Object.entries(ZONE_MAPPING).map(([zoneId, config]) => {
        const data = stats[zoneId] || { count: 0 };
        const isActive = atlasState.activeFilter === zoneId;
        
        return `
            <div class="zone-tile ${isActive ? 'active' : ''}" data-zone="${zoneId}">
                <div class="zt-header">
                    <span>${config.label}</span>
                    <span>${config.icon}</span>
                </div>
                <div class="zt-count">
                    ${data.count} ćwiczeń
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = tilesHTML;

    container.querySelectorAll('.zone-tile').forEach(tile => {
        tile.addEventListener('click', () => {
            const zoneId = tile.dataset.zone;
            // Toggle
            if (atlasState.activeFilter === zoneId) {
                atlasState.activeFilter = 'all';
            } else {
                atlasState.activeFilter = zoneId;
            }
            renderChips(); 
            renderZoneSelector(); 
            renderExerciseList();
        });
    });
}

// --- RENDEROWANIE LISTY ---
function renderExerciseList() {
    const grid = document.getElementById('atlas-grid');
    if (!grid) return;

    let items = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    const blacklist = state.blacklist || [];

    // 1. Filtrowanie
    if (atlasState.activeFilter === 'blacklist') {
        items = items.filter(ex => blacklist.includes(ex.id));
    } else {
        if (!atlasState.search) {
            items = items.filter(ex => !blacklist.includes(ex.id));
        }

        if (atlasState.activeFilter === 'tier_s') {
            items = items.filter(ex => (state.userPreferences[ex.id]?.score || 0) >= 20);
        } else if (atlasState.activeFilter === 'tier_a') {
            items = items.filter(ex => {
                const s = state.userPreferences[ex.id]?.score || 0;
                return s >= 10 && s < 20;
            });
        } else if (ZONE_MAPPING[atlasState.activeFilter]) {
            const zData = ZONE_MAPPING[atlasState.activeFilter];
            items = items.filter(ex => 
                zData.cats.includes(ex.categoryId) || 
                (ex.painReliefZones && ex.painReliefZones.includes(atlasState.activeFilter))
            );
        }
    }

    if (atlasState.search) {
        const term = atlasState.search.toLowerCase();
        items = items.filter(ex => ex.name.toLowerCase().includes(term));
    }

    // 2. Sortowanie
    items.sort((a, b) => {
        const sA = state.userPreferences[a.id]?.score || 0;
        const sB = state.userPreferences[b.id]?.score || 0;
        if (sB !== sA) return sB - sA;
        return a.name.localeCompare(b.name, 'pl');
    });

    // 3. Generowanie HTML
    if (items.length === 0) {
        grid.innerHTML = `<div style="text-align:center; padding:3rem 1rem; opacity:0.6; width:100%;">
            <p>Brak ćwiczeń spełniających kryteria.</p>
            ${atlasState.activeFilter === 'blacklist' ? '<p style="font-size:0.8rem">Twoja czarna lista jest pusta.</p>' : ''}
        </div>`;
        return;
    }

    grid.innerHTML = items.map(ex => {
        const pref = state.userPreferences[ex.id] || { score: 0, difficulty: 0 };
        const tier = getTier(pref);
        const affinityBadge = getAffinityBadge(ex.id);
        const isBlacklisted = blacklist.includes(ex.id);
        const descriptionShort = ex.description ? ex.description : 'Brak opisu.';

        const lvlLabel = getLevelLabel(ex.difficultyLevel);
        const catLabel = formatCategory(ex.categoryId).toUpperCase();
        let equipLabel = 'BRAK SPRZĘTU';
        if (ex.equipment) {
            if (Array.isArray(ex.equipment)) equipLabel = ex.equipment.join(', ').toUpperCase();
            else equipLabel = ex.equipment.toUpperCase();
        }
        if (equipLabel === '') equipLabel = 'BRAK SPRZĘTU';

        let footerHtml = '';
        if (ex.youtube_url) {
            footerHtml += `<a href="${ex.youtube_url}" target="_blank" class="link-btn link-youtube">📺 Wideo</a>`;
        }
        if (ex.animationSvg) {
            footerHtml += `<button class="link-btn preview-btn" data-id="${ex.id}">👁️ Podgląd</button>`;
        }

        const actionBtn = isBlacklisted 
            ? `<button class="icon-btn restore-btn" title="Przywróć" style="color:var(--success-color)">♻️</button>` 
            : `<button class="icon-btn block-btn" title="Zablokuj (Dodaj do czarnej listy)">🚫</button>`;

        return `
        <div class="atlas-card" data-id="${ex.id}" data-tier="${tier}">
            <div class="ac-main">
                <div class="ac-title">${ex.name} ${affinityBadge ? '<span style="margin-left:5px">' + affinityBadge + '</span>' : ''}</div>
                
                <div class="ac-tags">
                    <span class="meta-tag tag-level">⚡ ${lvlLabel}</span>
                    <span class="meta-tag tag-category">📂 ${catLabel}</span>
                    <span class="meta-tag tag-equipment">🏋️ ${equipLabel}</span>
                </div>

                <div class="ac-desc">${descriptionShort}</div>
                
                ${footerHtml ? `<div class="ac-footer">${footerHtml}</div>` : ''}
            </div>
            
            <div class="ac-actions">
                <div class="ac-score">${pref.score > 0 ? '+' + pref.score : pref.score}</div>
                ${actionBtn}
            </div>
        </div>
        `;
    }).join('');

    // 4. Obsługa Zdarzeń
    grid.querySelectorAll('.atlas-card').forEach(card => {
        const exId = card.dataset.id;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.icon-btn') || e.target.closest('a') || e.target.closest('.preview-btn')) return;
            renderTunerModal(exId, () => {
                renderExerciseList();
                renderZoneSelector(); 
            });
        });

        const previewBtn = card.querySelector('.preview-btn');
        if (previewBtn) {
            previewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const ex = state.exerciseLibrary[exId];
                if (ex && ex.animationSvg) {
                    renderPreviewModal(ex.animationSvg, ex.name);
                }
            });
        }

        const ytLink = card.querySelector('.link-youtube');
        if (ytLink) {
            ytLink.addEventListener('click', (e) => e.stopPropagation());
        }

        const blockBtn = card.querySelector('.block-btn');
        if (blockBtn) {
            blockBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Czy na pewno chcesz dodać "${state.exerciseLibrary[exId].name}" do czarnej listy?`)) {
                    showLoader();
                    await dataStore.addToBlacklist(exId, null);
                    hideLoader();
                    renderExerciseList();
                }
            });
        }

        const restoreBtn = card.querySelector('.restore-btn');
        if (restoreBtn) {
            restoreBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Przywrócić "${state.exerciseLibrary[exId].name}" do aktywnych ćwiczeń?`)) {
                    showLoader();
                    await dataStore.removeFromBlacklist(exId);
                    hideLoader();
                    renderExerciseList();
                }
            });
        }
    });
}

function calculateZoneStats() {
    const stats = {};
    const exercises = Object.values(state.exerciseLibrary);
    
    exercises.forEach(ex => {
        let zone = 'other';
        for (const [zId, zData] of Object.entries(ZONE_MAPPING)) {
            if (zData.cats.includes(ex.categoryId) || (ex.painReliefZones && ex.painReliefZones.includes(zId))) {
                zone = zId;
                break;
            }
        }
        if (!stats[zone]) stats[zone] = { count: 0 };
        stats[zone].count++;
    });
    return stats;
}

// Helpers
function getTier(pref) {
    if (pref.difficulty === 1) return 'C';
    if (pref.score >= 20) return 'S';
    if (pref.score >= 10) return 'A';
    if (pref.score <= -10) return 'C';
    return 'B';
}

function formatCategory(cat) {
    return cat ? cat.replace(/_/g, ' ') : 'Inne';
}

function getLevelLabel(lvl) {
    if (!lvl) return 'Baza';
    switch(parseInt(lvl)) {
        case 1: return 'Lvl 1 (Rehab/Start)';
        case 2: return 'Lvl 2 (Beginner)';
        case 3: return 'Lvl 3 (Intermediate)';
        case 4: return 'Lvl 4 (Advanced)';
        case 5: return 'Lvl 5 (Elite)';
        default: return `Lvl ${lvl}`;
    }
}