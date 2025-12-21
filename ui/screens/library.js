// js/ui/screens/library.js - "The Atlas" (Unified Library & Analytics)
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { getAffinityBadge } from '../templates.js';
import { renderTunerModal, renderPreviewModal } from '../modals.js';
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

// --- MAPOWANIE POWODÓW ODRZUCENIA (Clinical Rule Engine) ---
const REJECTION_CONFIG = {
    'missing_equipment': { label: 'Brak sprzętu', icon: '🛠️', color: '#64748b', bg: '#f1f5f9' },
    'physical_restriction': { label: 'Przeciwwskazanie', icon: '🦴', color: '#b91c1c', bg: '#fef2f2' },
    'biomechanics_mismatch': { label: 'Niezalecane (Wzorzec)', icon: '📐', color: '#c2410c', bg: '#fff7ed' },
    'severity_filter': { label: 'Za intensywne', icon: '🩹', color: '#b45309', bg: '#fffbeb' },
    'blacklisted': { label: 'Twoja Czarna Lista', icon: '🚫', color: '#374151', bg: '#e5e7eb' },
    'too_hard_calculated': { label: 'Za trudne (Lvl)', icon: '🔥', color: '#be123c', bg: '#fff1f2' }
};

// --- RENDEROWANIE GŁÓWNE ---
export const renderLibraryScreen = async (searchTerm = '') => {
    const container = containers.exerciseLibrary;
    if (!container) return;

    navigateTo('library');

    if (!state.userPreferences || Object.keys(state.userPreferences).length === 0) {
        try { await dataStore.fetchUserPreferences(); } catch (e) { }
    }

    if (searchTerm) {
        atlasState.search = searchTerm;
        atlasState.activeFilter = 'all';
    }

    container.innerHTML = `
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

    <!-- STYLE LOKALNE DLA MODUŁU BEZPIECZEŃSTWA -->
    <style>
        /* Styl dla kart zablokowanych (Safety UI) */
        .atlas-card.clinically-blocked {
            opacity: 0.75;
            background-color: #fafafa;
            border-left: 4px solid #cbd5e1 !important; /* Nadpisuje tier color */
            filter: grayscale(30%);
            position: relative;
        }

        .atlas-card.clinically-blocked:hover {
            opacity: 1;
            filter: grayscale(0%);
        }

        .restriction-banner {
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 4px 8px;
            border-radius: 4px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            margin-bottom: 6px;
            width: 100%;
        }
    </style>
`;

    renderChips();
    renderZoneSelector();
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

    // 1. Obliczanie liczników (POPRAWKA: Pobieramy ID z entries)
    const counts = { all: 0, safe: 0, blacklist: 0 };

    // Mapujemy entries na obiekty z ID, tak samo jak w renderExerciseList
    const allExercises = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    const blacklist = state.blacklist || [];

    allExercises.forEach(ex => {
        if (blacklist.includes(ex.id)) {
            counts.blacklist++;
        } else {
            // "Wszystkie" w kontekście UI oznacza "Wszystkie nie zablokowane"
            counts.all++;

            // "Bezpieczne" to podzbiór "Wszystkich", które mają flagę isAllowed
            // (zakładamy, że isAllowed może być undefined dla starych danych = true)
            if (ex.isAllowed !== false) {
                counts.safe++;
            }
        }
    });

    // 2. Definicje filtrów z licznikami
    const filters = [
        { id: 'all', label: `Wszystkie (${counts.all})` },
        { id: 'safe', label: `✅ Tylko Bezpieczne (${counts.safe})` },
        { id: 'blacklist', label: `🚫 Blokowane (${counts.blacklist})` }
    ];

    // 3. Renderowanie
    container.innerHTML = filters.map(f => `
    <button class="chip ${atlasState.activeFilter === f.id ? 'active' : ''}"
            data-id="${f.id}"
            data-tier="${f.id === 'blacklist' ? 'C' : ''}">
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
    }
    else if (atlasState.activeFilter === 'safe') {
        // Tylko bezpieczne (zgodnie z silnikiem klinicznym)
        items = items.filter(ex => ex.isAllowed !== false && !blacklist.includes(ex.id));
    }
    else {
        if (!atlasState.search) {
            // Domyślnie ukrywamy blacklisted w widoku ogólnym, ale POKAZUJEMY klinicznie zablokowane (jako wyszarzone)
            items = items.filter(ex => !blacklist.includes(ex.id));
        }

        // Filtrowanie po strefie (z kafelków HUD)
        if (ZONE_MAPPING[atlasState.activeFilter]) {
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

    // 2. Sortowanie (Safety Aware Sort)
    // Bezpieczne na górze, potem wg Punktów (Affinity), potem alfabetycznie
    items.sort((a, b) => {
        // A. Safety (Allowed first)
        const allowedA = a.isAllowed !== false;
        const allowedB = b.isAllowed !== false;

        if (allowedA && !allowedB) return -1;
        if (!allowedA && allowedB) return 1;

        // B. User Score (Sortowanie "Ulubione" jest tutaj domyślne)
        const sA = state.userPreferences[a.id]?.score || 0;
        const sB = state.userPreferences[b.id]?.score || 0;
        if (sB !== sA) return sB - sA;

        // C. Alphabetical
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

        // Sprawdzanie stanu klinicznego
        const isAllowed = ex.isAllowed !== false;
        const rejectionReason = ex.rejectionReason;

        // Budowanie nagłówka restrykcji
        let restrictionBanner = '';
        let cardClass = '';

        if (!isAllowed) {
            cardClass = 'clinically-blocked';
            const reasonConfig = REJECTION_CONFIG[rejectionReason] || { label: 'Niedostępne', icon: '🔒', color: '#666', bg: '#eee' };
            restrictionBanner = `
                <div class="restriction-banner" style="color: ${reasonConfig.color}; background: ${reasonConfig.bg}; border: 1px solid ${reasonConfig.color}20;">
                    <span>${reasonConfig.icon}</span> ${reasonConfig.label}
                </div>
            `;
        }

        const lvlLabel = getLevelLabel(ex.difficultyLevel);
        const catLabel = formatCategory(ex.categoryId).toUpperCase();
        
        // --- LOGIKA WYŚWIETLANIA SPRZĘTU (UKRYWANIE NONE) ---
        let equipLabel = '';
        if (ex.equipment) {
            if (Array.isArray(ex.equipment)) equipLabel = ex.equipment.join(', ').toUpperCase();
            else equipLabel = ex.equipment.toUpperCase();
        }
        
        // Lista wartości, które mają NIE wyświetlać badge'a
        const hiddenEquipValues = ['BRAK', 'NONE', 'BRAK SPRZĘTU', 'MASA WŁASNA', 'BODYWEIGHT', ''];
        const showEquipBadge = !hiddenEquipValues.includes(equipLabel.trim());

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

        // Jeśli zablokowane klinicznie, ukrywamy tuner, chyba że to sprzęt
        let tunerButtonHtml = '';
        if (isAllowed || rejectionReason === 'missing_equipment') {
             tunerButtonHtml = `<button class="tuner-btn" data-id="${ex.id}" title="Kalibracja Synaptyczna" style="background: #fff; border-radius: 50%; width: 34px; height: 34px; border: 1px solid #e2e8f0; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,95,115,0.15); margin-top: 6px; transition: transform 0.2s;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#005f73" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg></button>`;
        } else {
             tunerButtonHtml = `<div style="width:34px; height:34px; opacity:0.2; display:flex; align-items:center; justify-content:center;">🔒</div>`;
        }

        return `
    <div class="atlas-card ${cardClass}" data-id="${ex.id}" data-tier="${tier}">
        <div class="ac-main">
            ${restrictionBanner}

            <div class="ac-title">${ex.name} ${affinityBadge ? '<span style="margin-left:5px">' + affinityBadge + '</span>' : ''}</div>

            <div class="ac-tags">
                <span class="meta-tag tag-level">⚡ ${lvlLabel}</span>
                <span class="meta-tag tag-category">📂 ${catLabel}</span>
                ${showEquipBadge ? `<span class="meta-tag tag-equipment">🏋️ ${equipLabel}</span>` : ''}
            </div>

            <!-- OPIS ROZWIJANY -->
            <div class="ac-desc" title="Kliknij, aby rozwinąć/zwinąć">${descriptionShort}</div>

            ${footerHtml ? `<div class="ac-footer">${footerHtml}</div>` : ''}
        </div>

        <div class="ac-actions">
            <div class="ac-score">${pref.score > 0 ? '+' + pref.score : pref.score}</div>
            ${tunerButtonHtml}
            ${actionBtn}
        </div>
    </div>
    `;
    }).join('');

    // 4. Obsługa Zdarzeń
    grid.querySelectorAll('.atlas-card').forEach(card => {
        const exId = card.dataset.id;

        // A. Rozwijanie opisu
        const descEl = card.querySelector('.ac-desc');
        if (descEl) {
            descEl.addEventListener('click', (e) => {
                e.stopPropagation();
                descEl.classList.toggle('expanded');
            });
        }

        // B. Przycisk Tunera (Otwiera Modal)
        const tunerBtn = card.querySelector('.tuner-btn');
        if (tunerBtn) {
            tunerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                renderTunerModal(exId, () => {
                    renderExerciseList();
                    renderZoneSelector();
                });
            });
        }

        // C. Pozostałe przyciski
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
        // Count ONLY allowed exercises for zone stats to avoid misleading numbers
        if (ex.isAllowed === false) return;

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
    switch (parseInt(lvl)) {
        case 1: return 'Lvl 1 (Rehab/Start)';
        case 2: return 'Lvl 2 (Beginner)';
        case 3: return 'Lvl 3 (Intermediate)';
        case 4: return 'Lvl 4 (Advanced)';
        case 5: return 'Lvl 5 (Elite)';
        default: return `Lvl ${lvl}`;
    }
}