// ExerciseApp/ui/screens/library.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { getAffinityBadge } from '../templates.js';
import { renderTunerModal, renderPreviewModal } from '../modals.js';
import dataStore from '../../dataStore.js';
import { extractYoutubeId } from '../../utils.js';

// --- SŁOWNIKI ---
const LABELS = {
    positions: { 'supine': 'Leżenie na plecach', 'prone': 'Leżenie na brzuchu', 'side_lying': 'Leżenie bokiem', 'quadruped': 'Klęk podparty', 'kneeling': 'Klęk obunóż', 'half_kneeling': 'Klęk jednonóż', 'sitting': 'Siedząc', 'standing': 'Stojąc' },
    planes: { 'sagittal': 'Strzałkowa', 'frontal': 'Czołowa', 'transverse': 'Poprzeczna', 'multi': 'Wielopłaszcz.', 'flexion': 'Zgięcie', 'extension': 'Wyprost', 'rotation': 'Rotacja' }
};

const REJECTION_CONFIG = {
    'missing_equipment': { label: 'BRAK SPRZĘTU', icon: '🛠️', cssClass: 'reject-equip' },
    'physical_restriction': { label: 'PRZECIWWSKAZANIE', icon: '🦴', cssClass: 'reject-med' },
    'biomechanics_mismatch': { label: 'NIEWSKAZANE (BÓL)', icon: '⚠️', cssClass: 'reject-med' },
    'severity_filter': { label: 'ZA INTENSYWNE', icon: '🩹', cssClass: 'reject-med' },
    'blacklisted': { label: 'TWOJA CZARNA LISTA', icon: '🚫', cssClass: 'reject-user' },
    'too_hard_calculated': { label: 'ZA TRUDNE (LVL)', icon: '🔥', cssClass: 'reject-med' }
};

const CAT_ICONS = {
    'core': '🧱', 'glute': '🍑', 'hip': '⚙️', 'spine': '🐍', 'thoracic': '🔙',
    'nerve': '⚡', 'knee': '🦵', 'calves': '👠', 'breathing': '🌬️', 'conditioning': '❤️'
};
const getCatIcon = (id) => CAT_ICONS[Object.keys(CAT_ICONS).find(k => (id||'').includes(k))] || '🏋️';

// --- DEFINICJE FILTRÓW ---
const SPECIAL_FILTERS = [
    { id: 'all', label: 'Wszystkie', check: () => true },
    { id: 'favorites', label: '⭐ Ulubione', check: (ex) => (state.userPreferences[ex.id]?.score || 0) > 0 },
    { id: 'safe', label: '✅ Bezpieczne', check: (ex) => ex.isAllowed !== false && !(state.blacklist || []).includes(ex.id) },
    { id: 'spine_relief', label: '🦴 Kręgosłup', check: (ex) => ex.painReliefZones?.some(z => ['lumbar_general', 'thoracic', 'cervical'].includes(z)) },
    { id: 'knee_relief', label: '🦵 Kolana', check: (ex) => ex.painReliefZones?.some(z => ['knee', 'patella'].includes(z)) },
    { id: 'mobility', label: '🧘 Mobilność', check: (ex) => (ex.categoryId || '').includes('mobility') || (ex.categoryId || '').includes('stretch') },
    { id: 'strength', label: '💪 Siła', check: (ex) => (ex.categoryId || '').includes('strength') || (ex.categoryId || '').includes('activation') },
    { id: 'home_friendly', label: '🏠 Bez sprzętu', check: (ex) => !ex.equipment || ex.equipment.length === 0 || ex.equipment.some(e => ['brak', 'none', 'mata', 'bodyweight'].includes(e.toLowerCase())) },
    { id: 'standing', label: '🧍 Stojąc', check: (ex) => ex.position === 'standing' },
    { id: 'floor', label: '🧘 Na macie', check: (ex) => ['supine', 'prone', 'side_lying', 'quadruped'].includes(ex.position) }
];

// --- STAN ---
let atlasState = {
    search: '',
    activeFilter: 'all',
    sortBy: 'name_asc',
    expandedRows: new Set()
};

export const renderLibraryScreen = async (searchTerm = '') => {
    navigateTo('library');
    const container = containers.exerciseLibrary;
    if (!container) return;

    // Upewniamy się, że preferencje są pobrane
    if (!state.userPreferences || Object.keys(state.userPreferences).length === 0) {
        try { await dataStore.fetchUserPreferences(); } catch (e) { }
    }

    if (searchTerm) atlasState.search = searchTerm;

    // 1. Oblicz liczniki (POPRAWKA: Mapujemy entries, aby obiekty miały ID, naprawia to licznik ulubionych)
    const allExercises = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    
    const filterCounts = {};
    SPECIAL_FILTERS.forEach(f => {
        filterCounts[f.id] = allExercises.filter(ex => f.check(ex)).length;
    });

    const filtersHTML = SPECIAL_FILTERS.map(f =>
        `<button class="filter-chip ${atlasState.activeFilter === f.id ? 'active' : ''}" data-filter="${f.id}">
            ${f.label} <span class="filter-count">(${filterCounts[f.id]})</span>
        </button>`
    ).join('');

    container.innerHTML = `
        <div class="atlas-wrapper">
            <div class="atlas-sticky-header">
                <div class="search-sort-row">
                    <div class="search-wrapper">
                        <input type="text" id="atlas-search" class="atlas-search-input" placeholder="Szukaj ćwiczenia..." value="${atlasState.search}">
                        ${atlasState.search ? '<button id="clear-search-btn">✕</button>' : ''}
                    </div>
                    <div class="sort-wrapper">
                        <select id="atlas-sort-select" class="atlas-sort-select">
                            <option value="name_asc" ${atlasState.sortBy === 'name_asc' ? 'selected' : ''}>A-Z</option>
                            <option value="name_desc" ${atlasState.sortBy === 'name_desc' ? 'selected' : ''}>Z-A</option>
                            <option value="favorites" ${atlasState.sortBy === 'favorites' ? 'selected' : ''}>Ulubione</option>
                            <option value="difficulty_asc" ${atlasState.sortBy === 'difficulty_asc' ? 'selected' : ''}>Najłatwiejsze</option>
                            <option value="difficulty_desc" ${atlasState.sortBy === 'difficulty_desc' ? 'selected' : ''}>Najtrudniejsze</option>
                        </select>
                    </div>
                </div>

                <div class="filters-row">${filtersHTML}</div>

                <div id="results-count-bar" class="results-bar"></div>
            </div>

            <div id="atlas-list" class="atlas-list-container"></div>
        </div>
    `;

    renderList();
    attachEvents(container);
};

function getFilteredExercises() {
    let items = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));

    if (atlasState.search) {
        const term = atlasState.search.toLowerCase();
        items = items.filter(ex => {
            const matchesName = ex.name.toLowerCase().includes(term);
            const matchesCat = (ex.categoryId || '').toLowerCase().includes(term);
            const matchesPos = (LABELS.positions[ex.position] || '').toLowerCase().includes(term);
            const matchesEquip = (ex.equipment || []).join(' ').toLowerCase().includes(term);
            return matchesName || matchesCat || matchesPos || matchesEquip;
        });
    }

    const activeFilterDef = SPECIAL_FILTERS.find(f => f.id === atlasState.activeFilter);
    if (activeFilterDef && activeFilterDef.check) {
        items = items.filter(activeFilterDef.check);
    }

    const blacklist = state.blacklist || [];

    items.sort((a, b) => {
        const isBlockedA = blacklist.includes(a.id) || a.isAllowed === false;
        const isBlockedB = blacklist.includes(b.id) || b.isAllowed === false;

        if (isBlockedA && !isBlockedB) return 1;
        if (!isBlockedA && isBlockedB) return -1;

        if (atlasState.sortBy === 'favorites') {
            const sA = state.userPreferences[a.id]?.score || 0;
            const sB = state.userPreferences[b.id]?.score || 0;
            if (sB !== sA) return sB - sA;
        }
        else if (atlasState.sortBy === 'difficulty_asc') {
            const diffA = a.difficultyLevel || 1;
            const diffB = b.difficultyLevel || 1;
            if (diffA !== diffB) return diffA - diffB;
        }
        else if (atlasState.sortBy === 'difficulty_desc') {
            const diffA = a.difficultyLevel || 1;
            const diffB = b.difficultyLevel || 1;
            if (diffA !== diffB) return diffB - diffA;
        }
        else if (atlasState.sortBy === 'name_desc') {
            return b.name.localeCompare(a.name);
        }

        return a.name.localeCompare(b.name);
    });

    return items;
}

function renderList() {
    const listContainer = document.getElementById('atlas-list');
    const countBar = document.getElementById('results-count-bar');
    if (!listContainer) return;

    const exercises = getFilteredExercises();

    if (countBar) {
        countBar.innerHTML = `<span>Znaleziono: <strong>${exercises.length}</strong></span>`;
    }

    if (exercises.length === 0) {
        listContainer.innerHTML = `<div class="empty-list-msg">Brak wyników.</div>`;
        return;
    }

    listContainer.innerHTML = exercises.map(ex => createRowHTML(ex)).join('');
}

function formatZoneLabel(key) {
    if (!key) return '';
    return key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function createRowHTML(ex) {
    const isExpanded = atlasState.expandedRows.has(ex.id);
    const pref = state.userPreferences[ex.id] || { score: 0, difficulty: 0 };
    const isBlacklisted = (state.blacklist || []).includes(ex.id);
    const notAllowed = ex.isAllowed === false;

    const spineLoad = (ex.spineLoadLevel || 'low').toLowerCase();
    const kneeLoad = (ex.kneeLoadLevel || 'low').toLowerCase();
    const impact = (ex.impactLevel || 'low').toLowerCase();
    const position = ex.position ? (LABELS.positions[ex.position] || ex.position) : '-';
    const plane = ex.primaryPlane ? (LABELS.planes[ex.primaryPlane] || ex.primaryPlane) : '-';
    const lvlBars = Array(Math.min(5, ex.difficultyLevel || 1)).fill('<span class="lvl-dot"></span>').join('');

    // Tagi Tolerancji
    const toleranceTags = (ex.toleranceTags || []).map(t => {
        if(t.includes('flexion')) return `<span class="tag tag-tolerance">✅ Zgięcie OK</span>`;
        if(t.includes('extension')) return `<span class="tag tag-tolerance">✅ Wyprost OK</span>`;
        return '';
    }).join('');

    // Tagi Pomocowe
    const painReliefBadges = (ex.painReliefZones || []).map(z =>
        `<span class="tag tag-relief">${formatZoneLabel(z)}</span>`
    ).join('');

    // Tagi Sprzętu
    const ignoreEquip = ['brak', 'none', 'brak sprzętu', 'masa własna', 'bodyweight', ''];
    const equipTags = (ex.equipment || [])
        .filter(e => !ignoreEquip.includes(e.toLowerCase()))
        .map(e => `<span class="tag tag-equip">🛠️ ${e}</span>`)
        .join('');

    const videoId = extractYoutubeId(ex.youtube_url);
    const videoBtn = videoId ? `<button data-action="video" data-url="https://youtu.be/${videoId}" class="mini-action-btn btn-video">🎬 Wideo</button>` : '';
    const previewBtn = ex.hasAnimation ? `<button data-action="preview" data-id="${ex.id}" class="mini-action-btn btn-preview">👁️ Podgląd</button>` : '';

    const getLoadClass = (val) => val === 'high' ? 'load-high' : (val === 'medium' || val === 'moderate' ? 'load-med' : 'load-low');

    let rowClass = 'ex-row';
    let rejectionHtml = '';

    if (isBlacklisted) {
        rowClass += ' blocked';
        const reason = REJECTION_CONFIG['blacklisted'];
        rejectionHtml = `<div class="rejection-badge ${reason.cssClass}">${reason.icon} ${reason.label}</div>`;
    }
    else if (notAllowed) {
        rowClass += ' restricted';
        const reasonKey = ex.rejectionReason || 'physical_restriction';
        const reason = REJECTION_CONFIG[reasonKey] || REJECTION_CONFIG['physical_restriction'];
        rejectionHtml = `<div class="rejection-badge ${reason.cssClass}">${reason.icon} ${reason.label}</div>`;
    }

    return `
    <div class="${rowClass}" data-id="${ex.id}">
        <!-- HEADER -->
        <div class="ex-row-header">
            <div class="ex-col-icon">${getCatIcon(ex.categoryId || '')}</div>

            <div class="ex-col-main">
                ${rejectionHtml}
                <div class="ex-name-row">
                    <span class="ex-name">${ex.name}</span>
                    ${pref.score !== 0 ? `<span class="score-badge ${pref.score > 0 ? 'pos' : 'neg'}">${pref.score > 0 ? '+' : ''}${pref.score}</span>` : ''}
                </div>
                <div class="ex-sub-row">
                    <span class="ex-cat">${formatZoneLabel(ex.categoryId)}</span>
                    <div class="ex-lvl">${lvlBars}</div>
                </div>
            </div>

            <div class="ex-col-clinical">
                <div class="load-indicator ${getLoadClass(spineLoad)}" title="Obciążenie Kręgosłupa">
                    <span class="li-label">Spine</span>
                    <div class="li-dots"><span></span><span></span><span></span></div>
                </div>
                <div class="load-indicator ${getLoadClass(kneeLoad)}" title="Obciążenie Kolan">
                    <span class="li-label">Knee</span>
                    <div class="li-dots"><span></span><span></span><span></span></div>
                </div>
                <div class="load-indicator ${getLoadClass(impact)}" title="Impact">
                    <span class="li-label">Impact</span>
                    <div class="li-dots"><span></span><span></span><span></span></div>
                </div>
            </div>

            <div class="ex-col-toggle"><span class="arrow ${isExpanded ? 'open' : ''}">▼</span></div>
        </div>

        <!-- DETAILS -->
        ${isExpanded ? `
        <div class="ex-row-details">
            <div class="details-grid">
                <div class="detail-block">
                    <span class="detail-label">Pozycja</span>
                    <div class="detail-val">${position}</div>
                </div>
                <div class="detail-block">
                    <span class="detail-label">Płaszczyzna</span>
                    <div class="detail-val">${plane}</div>
                </div>
                <div class="detail-block">
                    <span class="detail-label">Tempo</span>
                    <div class="detail-val tempo-text">${ex.defaultTempo || 'Standard'}</div>
                </div>
            </div>

            <!-- TAGI: WYDZIELONE LINIE -->
            ${equipTags ? `<div class="meta-line"><span class="meta-label">Wymagany Sprzęt:</span> <div style="display:flex; flex-wrap:wrap; gap:4px;">${equipTags}</div></div>` : ''}
            ${painReliefBadges ? `<div class="meta-line"><span class="meta-label">Pomaga na:</span> <div style="display:flex; flex-wrap:wrap; gap:4px;">${painReliefBadges}</div></div>` : ''}

            <div class="tags-row">
                ${toleranceTags}
                ${ex.metabolicIntensity >= 4 ? '<span class="tag tag-burn">🔥 High Burn</span>' : ''}
                ${ex.isUnilateral ? '<span class="tag tag-uni">🔄 Jednostronne</span>' : ''}
            </div>

            <p class="ex-desc">${ex.description || 'Brak opisu.'}</p>

            <div class="ex-actions-footer">
                <div class="left-actions">
                    ${previewBtn}
                    ${videoBtn}
                </div>
                <div class="right-actions">
                    <button data-action="tune" data-id="${ex.id}" class="mini-action-btn btn-tune">🎛️ Kalibruj</button>
                </div>
            </div>
        </div>` : ''}
    </div>`;
}

function attachEvents(container) {
    const searchInput = container.querySelector('#atlas-search');
    const clearBtn = container.querySelector('#clear-search-btn');
    const filters = container.querySelectorAll('.filter-chip');
    const sortSelect = container.querySelector('#atlas-sort-select');
    const listContainer = container.querySelector('#atlas-list');

    // --- EVENT DELEGATION (Nowy, stabilny system obsługi zdarzeń) ---
    if (listContainer) {
        listContainer.addEventListener('click', async (e) => {
            // 1. Obsługa Header (Rozwijanie)
            const header = e.target.closest('.ex-row-header');
            if (header) {
                const row = header.closest('.ex-row');
                const id = row.dataset.id;
                if (atlasState.expandedRows.has(id)) atlasState.expandedRows.delete(id);
                else atlasState.expandedRows.add(id);
                renderList();
                return;
            }

            // 2. Obsługa Przycisków Akcji
            const btn = e.target.closest('button, a');
            if (!btn) return;

            e.stopPropagation(); // Zatrzymujemy, żeby nie zwinęło wiersza (gdyby kliknięto w coś innego)

            const action = btn.dataset.action;
            const id = btn.dataset.id || btn.closest('.ex-row')?.dataset.id;

            if (action === 'tune') {
                // FIX: Używamy delegacji + poprawionego modals.js, więc to jest bezpieczne
                renderTunerModal(id, () => renderList());
            } 
            else if (action === 'preview') {
                showLoader();
                try {
                    const svg = await dataStore.fetchExerciseAnimation(id);
                    if (svg) renderPreviewModal(svg, state.exerciseLibrary[id].name);
                } finally { hideLoader(); }
            }
            else if (action === 'video') {
                window.open(btn.dataset.url, '_blank');
            }
        });
    }

    searchInput.addEventListener('input', (e) => {
        atlasState.search = e.target.value;
        if(clearBtn) clearBtn.style.display = atlasState.search ? 'block' : 'none';
        renderList();
    });

    if(clearBtn) clearBtn.addEventListener('click', () => {
        atlasState.search = '';
        searchInput.value = '';
        clearBtn.style.display = 'none';
        renderList();
    });

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            atlasState.sortBy = e.target.value;
            renderList();
        });
    }

    filters.forEach(btn => {
        btn.addEventListener('click', () => {
            atlasState.activeFilter = btn.dataset.filter;
            filters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderList();
        });
    });
}