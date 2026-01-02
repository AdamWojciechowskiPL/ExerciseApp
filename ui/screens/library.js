// js/ui/screens/library.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { navigateTo, showLoader, hideLoader } from '../core.js';
import { getAffinityBadge } from '../templates.js';
import { renderTunerModal, renderPreviewModal } from '../modals.js';
import dataStore from '../../dataStore.js';
import { extractYoutubeId } from '../../utils.js';

let atlasState = {
    search: '',
    activeFilter: 'all',
    collapsedMap: false
};

const ZONE_MAPPING = {
    'cervical': { label: 'Szyja', icon: '🧣', cats: ['neck', 'cervical'] },
    'thoracic': { label: 'Górne Plecy', icon: '🔙', cats: ['thoracic', 'posture'] },
    'lumbar_general': { label: 'Lędźwia / Core', icon: '🧱', cats: ['core_anti_extension', 'core_anti_flexion', 'core_anti_rotation', 'lumbar'] },
    'hip_mobility': { label: 'Biodra', icon: '⚙️', cats: ['hip_mobility', 'glute_activation', 'piriformis'] },
    'knee': { label: 'Kolana', icon: '🦵', cats: ['knee_stability', 'vmo_activation', 'terminal_knee_extension', 'eccentric_control'] },
    'sciatica': { label: 'Nogi / Nerw', icon: '⚡', cats: ['nerve_flossing', 'sciatica', 'legs'] },
    'metabolic': { label: 'Spalanie', icon: '🔥', cats: [] }
};

const REJECTION_CONFIG = {
    'missing_equipment': { label: 'Brak sprzętu', icon: '🛠️', color: '#64748b', bg: '#f1f5f9' },
    'physical_restriction': { label: 'Przeciwwskazanie', icon: '🦴', color: '#b91c1c', bg: '#fef2f2' },
    'biomechanics_mismatch': { label: 'Niezalecane (Wzorzec)', icon: '📐', color: '#c2410c', bg: '#fff7ed' },
    'severity_filter': { label: 'Za intensywne', icon: '🩹', color: '#b45309', bg: '#fffbeb' },
    'blacklisted': { label: 'Twoja Czarna Lista', icon: '🚫', color: '#374151', bg: '#e5e7eb' },
    'too_hard_calculated': { label: 'Za trudne (Lvl)', icon: '🔥', color: '#be123c', bg: '#fff1f2' }
};

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
        <div class="chips-scroller" id="atlas-chips"></div>
    </div>
    <div class="zone-hud-container" id="zone-hud"></div>
    <div style="height: 15px;"></div>
    <div class="atlas-grid" id="atlas-grid"></div>
`;
    renderChips();
    renderZoneSelector();
    renderExerciseList();
    const searchInput = container.querySelector('.atlas-search-input');
    searchInput.addEventListener('input', (e) => {
        atlasState.search = e.target.value;
        renderExerciseList();
    });
};

function renderChips() {
    const container = document.getElementById('atlas-chips');
    if (!container) return;
    const counts = { all: 0, safe: 0, blacklist: 0 };
    const allExercises = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    const blacklist = state.blacklist || [];
    allExercises.forEach(ex => {
        if (blacklist.includes(ex.id)) counts.blacklist++;
        else {
            counts.all++;
            if (ex.isAllowed !== false) counts.safe++;
        }
    });
    const filters = [
        { id: 'all', label: `Wszystkie (${counts.all})` },
        { id: 'safe', label: `✅ Tylko Bezpieczne (${counts.safe})` },
        { id: 'blacklist', label: `🚫 Blokowane (${counts.blacklist})` }
    ];
    container.innerHTML = filters.map(f => `
    <button class="chip ${atlasState.activeFilter === f.id ? 'active' : ''}" data-id="${f.id}" data-tier="${f.id === 'blacklist' ? 'C' : ''}">
        ${f.label}
    </button>`).join('');
    container.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => {
            atlasState.activeFilter = btn.dataset.id;
            if (atlasState.search && btn.dataset.id !== 'all') {
                atlasState.search = '';
                document.querySelector('.atlas-search-input').value = '';
            }
            renderChips();
            renderZoneSelector();
            renderExerciseList();
        });
    });
}

function renderZoneSelector() {
    const container = document.getElementById('zone-hud');
    if (!container) return;
    const stats = calculateZoneStats();
    const tilesHTML = Object.entries(ZONE_MAPPING).map(([zoneId, config]) => {
        const data = stats[zoneId] || { count: 0 };
        const isActive = atlasState.activeFilter === zoneId;
        return `
        <div class="zone-tile ${isActive ? 'active' : ''}" data-zone="${zoneId}">
            <div class="zt-header"><span>${config.label}</span><span>${config.icon}</span></div>
            <div class="zt-count">${data.count} ćwiczeń</div>
        </div>`;
    }).join('');
    container.innerHTML = tilesHTML;
    container.querySelectorAll('.zone-tile').forEach(tile => {
        tile.addEventListener('click', () => {
            const zoneId = tile.dataset.zone;
            if (atlasState.activeFilter === zoneId) atlasState.activeFilter = 'all';
            else atlasState.activeFilter = zoneId;
            renderChips();
            renderZoneSelector();
            renderExerciseList();
        });
    });
}

function renderExerciseList() {
    const grid = document.getElementById('atlas-grid');
    if (!grid) return;
    let items = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id, ...data }));
    const blacklist = state.blacklist || [];
    if (atlasState.activeFilter === 'blacklist') items = items.filter(ex => blacklist.includes(ex.id));
    else if (atlasState.activeFilter === 'safe') items = items.filter(ex => ex.isAllowed !== false && !blacklist.includes(ex.id));
    else {
        if (!atlasState.search) items = items.filter(ex => !blacklist.includes(ex.id));
        if (ZONE_MAPPING[atlasState.activeFilter]) {
            const zData = ZONE_MAPPING[atlasState.activeFilter];
            if (atlasState.activeFilter === 'metabolic') {
                items = items.filter(ex => ex.goalTags && (ex.goalTags.includes('fat_loss') || ex.goalTags.includes('conditioning')));
            } else {
                items = items.filter(ex => zData.cats.includes(ex.categoryId) || (ex.painReliefZones && ex.painReliefZones.includes(atlasState.activeFilter)));
            }
        }
    }
    if (atlasState.search) {
        const term = atlasState.search.toLowerCase();
        items = items.filter(ex => ex.name.toLowerCase().includes(term));
    }
    items.sort((a, b) => {
        const allowedA = a.isAllowed !== false;
        const allowedB = b.isAllowed !== false;
        if (allowedA && !allowedB) return -1;
        if (!allowedA && allowedB) return 1;
        const sA = state.userPreferences[a.id]?.score || 0;
        const sB = state.userPreferences[b.id]?.score || 0;
        if (sB !== sA) return sB - sA;
        return a.name.localeCompare(b.name, 'pl');
    });
    if (items.length === 0) {
        grid.innerHTML = `<div style="text-align:center; padding:3rem 1rem; opacity:0.6; width:100%;"><p>Brak ćwiczeń spełniających kryteria.</p>${atlasState.activeFilter === 'blacklist' ? '<p style="font-size:0.8rem">Twoja czarna lista jest pusta.</p>' : ''}</div>`;
        return;
    }
    grid.innerHTML = items.map(ex => {
        const pref = state.userPreferences[ex.id] || { score: 0, difficulty: 0 };
        const tier = getTier(pref);
        const affinityBadge = getAffinityBadge(ex.id);
        const isBlacklisted = blacklist.includes(ex.id);
        const descriptionShort = ex.description ? ex.description : 'Brak opisu.';
        const isAllowed = ex.isAllowed !== false;
        const rejectionReason = ex.rejectionReason;
        let restrictionBanner = '';
        let cardClass = '';
        if (!isAllowed) {
            cardClass = 'clinically-blocked';
            const reasonConfig = REJECTION_CONFIG[rejectionReason] || { label: 'Niedostępne', icon: '🔒', color: '#666', bg: '#eee' };
            restrictionBanner = `<div class="restriction-banner" style="color: ${reasonConfig.color}; background: ${reasonConfig.bg}; border: 1px solid ${reasonConfig.color}20;"><span>${reasonConfig.icon}</span> ${reasonConfig.label}</div>`;
        }
        const lvlLabel = getLevelLabel(ex.difficultyLevel);
        const catLabel = formatCategory(ex.categoryId).toUpperCase();
        let equipLabel = Array.isArray(ex.equipment) ? ex.equipment.join(', ').toUpperCase() : (ex.equipment || 'BRAK SPRZĘTU').toUpperCase();
        const hiddenEquipValues = ['BRAK', 'NONE', 'BRAK SPRZĘTU', 'MASA WŁASNA', 'BODYWEIGHT', ''];
        const showEquipBadge = !hiddenEquipValues.includes(equipLabel.trim());

        let burnBadge = '';
        if (ex.metabolicIntensity && ex.metabolicIntensity >= 3) {
            burnBadge = `<span class="meta-tag" style="background:#fff1f2; color:#be123c; border:1px solid #fda4af;">🔥 MET: ${ex.metabolicIntensity}/5</span>`;
        }

        let kneeBadge = '';
        if (ex.kneeLoadLevel && ex.kneeLoadLevel !== 'low') {
            const kColor = ex.kneeLoadLevel === 'high' ? '#b91c1c' : '#b45309';
            const kBg = ex.kneeLoadLevel === 'high' ? '#fef2f2' : '#fffbeb';
            const kBorder = ex.kneeLoadLevel === 'high' ? '#fca5a5' : '#fcd34d';
            kneeBadge = `<span class="meta-tag" style="background:${kBg}; color:${kColor}; border:1px solid ${kBorder};">🦵 ${ex.kneeLoadLevel === 'high' ? 'HIGH' : 'MED'} LOAD</span>`;
        }

        const userPace = state.exercisePace && state.exercisePace[ex.id];
        let paceBadge = '';
        if (userPace) {
            paceBadge = `<span class="meta-tag" style="background:#fefce8; color:#854d0e; border:1px solid #fde047;" title="Twój średni czas na powtórzenie">⏱ ${userPace}s</span>`;
        }

        let footerHtml = '';
        const videoId = extractYoutubeId(ex.youtube_url);
        if (videoId) {
            footerHtml += `<a href="https://youtu.be/${videoId}" target="_blank" class="link-btn link-youtube">📺 Wideo</a>`;
        }

        if (ex.hasAnimation) footerHtml += `<button class="link-btn preview-btn" data-id="${ex.id}">👁️ Podgląd</button>`;
        const actionBtn = isBlacklisted ? `<button class="icon-btn restore-btn" title="Przywróć" style="color:var(--success-color)">♻️</button>` : `<button class="icon-btn block-btn" title="Zablokuj (Dodaj do czarnej listy)">🚫</button>`;
        let tunerButtonHtml = '';
        if (isAllowed || rejectionReason === 'missing_equipment') {
            tunerButtonHtml = `<button class="tuner-btn" data-id="${ex.id}" title="Kalibracja Synaptyczna" style="background: #fff; border-radius: 50%; width: 34px; height: 34px; border: 1px solid #e2e8f0; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,95,115,0.15); margin-top: 6px; transition: transform 0.2s;"><svg width="16" height="16" style="stroke:#005f73"><use href="#icon-sliders"/></svg></button>`;
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
                ${paceBadge}
                ${burnBadge}
                ${kneeBadge}
                <span class="meta-tag tag-category">📂 ${catLabel}</span>
                ${showEquipBadge ? `<span class="meta-tag tag-equipment">🛠️ ${equipLabel}</span>` : ''}
            </div>
            <div class="ac-desc" title="Kliknij, aby rozwinąć/zwinąć">${descriptionShort}</div>
            ${footerHtml ? `<div class="ac-footer">${footerHtml}</div>` : ''}
        </div>
        <div class="ac-actions">
            <div class="ac-score">${pref.score > 0 ? '+' + pref.score : pref.score}</div>
            ${tunerButtonHtml}
            ${actionBtn}
        </div>
    </div>`;
    }).join('');

    grid.querySelectorAll('.atlas-card').forEach(card => {
        const exId = card.dataset.id;
        const descEl = card.querySelector('.ac-desc');
        if (descEl) { descEl.addEventListener('click', (e) => { e.stopPropagation(); descEl.classList.toggle('expanded'); }); }
        const tunerBtn = card.querySelector('.tuner-btn');
        if (tunerBtn) { tunerBtn.addEventListener('click', (e) => { e.stopPropagation(); renderTunerModal(exId, () => { renderExerciseList(); renderZoneSelector(); }); }); }

        const previewBtn = card.querySelector('.preview-btn');
        if (previewBtn) {
            previewBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                previewBtn.classList.add('loading');
                previewBtn.textContent = '⏳ Ładowanie...';

                try {
                    const svg = await dataStore.fetchExerciseAnimation(exId);
                    if (svg) {
                        renderPreviewModal(svg, state.exerciseLibrary[exId].name);
                    } else {
                        alert('Brak podglądu');
                    }
                } catch (err) {
                    console.error(err);
                    alert('Błąd pobierania animacji');
                } finally {
                    previewBtn.classList.remove('loading');
                    previewBtn.textContent = '👁️ Podgląd';
                }
            });
        }

        const ytLink = card.querySelector('.link-youtube');
        if (ytLink) { ytLink.addEventListener('click', (e) => e.stopPropagation()); }
        const blockBtn = card.querySelector('.block-btn');
        if (blockBtn) { blockBtn.addEventListener('click', async (e) => { e.stopPropagation(); if (confirm(`Czy na pewno chcesz dodać "${state.exerciseLibrary[exId].name}" do czarnej listy?`)) { showLoader(); await dataStore.addToBlacklist(exId, null); hideLoader(); renderExerciseList(); } }); }
        const restoreBtn = card.querySelector('.restore-btn');
        if (restoreBtn) { restoreBtn.addEventListener('click', async (e) => { e.stopPropagation(); if (confirm(`Przywrócić "${state.exerciseLibrary[exId].name}" do aktywnych ćwiczeń?`)) { showLoader(); await dataStore.removeFromBlacklist(exId); hideLoader(); renderExerciseList(); } }); }
    });
}

function calculateZoneStats() {
    const stats = {};
    const exercises = Object.values(state.exerciseLibrary);
    exercises.forEach(ex => {
        if (ex.isAllowed === false) return;
        let zone = 'other';
        for (const [zId, zData] of Object.entries(ZONE_MAPPING)) {
            if (zId === 'metabolic') {
                if (ex.goalTags && (ex.goalTags.includes('fat_loss') || ex.goalTags.includes('conditioning'))) {
                    zone = zId;
                    break;
                }
            } else {
                if (zData.cats.includes(ex.categoryId) || (ex.painReliefZones && ex.painReliefZones.includes(zId))) {
                    zone = zId;
                    break;
                }
            }
        }
        if (!stats[zone]) stats[zone] = { count: 0 };
        stats[zone].count++;
    });
    return stats;
}

function getTier(pref) { if (pref.difficulty === 1) return 'C'; if (pref.score >= 20) return 'S'; if (pref.score >= 10) return 'A'; if (pref.score <= -10) return 'C'; return 'B'; }
function formatCategory(cat) { return cat ? cat.replace(/_/g, ' ') : 'Inne'; }
function getLevelLabel(lvl) { if (!lvl) return 'Baza'; switch (parseInt(lvl)) { case 1: return 'Lvl 1 (Rehab/Start)'; case 2: return 'Lvl 2 (Beginner)'; case 3: return 'Lvl 3 (Intermediate)'; case 4: return 'Lvl 4 (Advanced)'; case 5: return 'Lvl 5 (Elite)'; default: return `Lvl ${lvl}`; } }