// js/ui/screens/library.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { navigateTo } from '../core.js';
import { getIsCasting, sendPlayVideo, sendStopVideo } from '../../cast.js';
import dataStore from '../../dataStore.js';
import { getAffinityBadge } from '../templates.js'; // Import helpera

// --- STAN LOKALNY EKRANU ---
let currentTab = 'all'; 
let activeFilters = {
    category: 'all',
    level: 'all',
    equipment: 'all',
    preference: 'all'
};

const formatCategoryName = (catId) => {
    if (!catId) return 'Inne';
    return catId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const getLevelLabel = (lvl) => {
    if (!lvl) return 'Baza';
    if (lvl == 1) return 'Lvl 1 (Rehab/Start)';
    if (lvl == 2) return 'Lvl 2 (Początkujący)';
    if (lvl == 3) return 'Lvl 3 (Średniozaaw.)';
    if (lvl == 4) return 'Lvl 4 (Zaawansowany)';
    if (lvl >= 5) return 'Lvl 5 (Elita)';
    return `Poziom ${lvl}`;
};

export const renderLibraryScreen = (searchTerm = '') => {
    const container = containers.exerciseLibrary;
    container.innerHTML = '';

    // 1. Przygotowanie danych
    const allExercises = Object.values(state.exerciseLibrary);
    
    const uniqueCategories = [...new Set(allExercises.map(ex => ex.categoryId).filter(Boolean))].sort();
    const uniqueLevels = [...new Set(allExercises.map(ex => ex.difficultyLevel || 1))].sort((a,b) => a - b);
    const uniqueEquipment = [...new Set(allExercises.map(ex => ex.equipment || 'Brak sprzętu'))].sort();

    const categoryOptions = uniqueCategories.map(cat => `<option value="${cat}" ${activeFilters.category === cat ? 'selected' : ''}>${formatCategoryName(cat)}</option>`).join('');
    const levelOptions = uniqueLevels.map(lvl => `<option value="${lvl}" ${String(activeFilters.level) === String(lvl) ? 'selected' : ''}>${getLevelLabel(lvl)}</option>`).join('');
    const equipmentOptions = uniqueEquipment.map(eq => `<option value="${eq}" ${activeFilters.equipment === eq ? 'selected' : ''}>${eq}</option>`).join('');

    // 2. Generowanie nagłówka i filtrów
    const headerHTML = `
        <div class="library-tabs" style="display:flex; gap:10px; margin-bottom:1rem;">
            <button id="tab-all" class="toggle-btn ${currentTab === 'all' ? 'active' : ''}" style="flex:1; padding:10px;">Baza Ćwiczeń</button>
            <button id="tab-blacklist" class="toggle-btn ${currentTab === 'blacklist' ? 'active' : ''}" style="flex:1; padding:10px;">Czarna Lista (${state.blacklist.length})</button>
        </div>

        <div class="filters-container">
            <select id="filter-preference" class="filter-select" style="border-color: var(--gold-color);">
                <option value="all" ${activeFilters.preference === 'all' ? 'selected' : ''}>Wszystkie rangi</option>
                <option value="tier_s" ${activeFilters.preference === 'tier_s' ? 'selected' : ''}>💎 Tier S (Ulubione)</option>
                <option value="tier_a" ${activeFilters.preference === 'tier_a' ? 'selected' : ''}>⭐ Tier A (Lubiane)</option>
                <option value="tier_c" ${activeFilters.preference === 'tier_c' ? 'selected' : ''}>⚠️ Tier C (Problemy)</option>
            </select>

            <select id="filter-category" class="filter-select"><option value="all">Wszystkie kategorie</option>${categoryOptions}</select>
            <select id="filter-level" class="filter-select"><option value="all">Wszystkie poziomy</option>${levelOptions}</select>
            <select id="filter-equipment" class="filter-select"><option value="all">Dowolny sprzęt</option>${equipmentOptions}</select>
            <button id="filter-reset" class="filter-reset-btn">Wyczyść</button>
        </div>
    `;
    
    const wrapper = document.createElement('div');
    wrapper.innerHTML = headerHTML;
    container.appendChild(wrapper);

    // 3. Filtrowanie
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    
    let exercisesToShow = Object.entries(state.exerciseLibrary).map(([id, data]) => ({ id: id, ...data }));

    if (currentTab === 'blacklist') {
        exercisesToShow = exercisesToShow.filter(ex => state.blacklist.includes(ex.id));
    } 

    if (lowerCaseSearchTerm) {
        exercisesToShow = exercisesToShow.filter(ex => ex.name.toLowerCase().includes(lowerCaseSearchTerm) || (ex.description && ex.description.toLowerCase().includes(lowerCaseSearchTerm)));
    }

    if (activeFilters.category !== 'all') exercisesToShow = exercisesToShow.filter(ex => ex.categoryId === activeFilters.category);
    if (activeFilters.level !== 'all') exercisesToShow = exercisesToShow.filter(ex => (ex.difficultyLevel || 1) == activeFilters.level);
    if (activeFilters.equipment !== 'all') exercisesToShow = exercisesToShow.filter(ex => (ex.equipment || 'Brak sprzętu') === activeFilters.equipment);

    if (activeFilters.preference !== 'all') {
        exercisesToShow = exercisesToShow.filter(ex => {
            const pref = state.userPreferences[ex.id] || { score: 0, difficulty: 0 };
            if (activeFilters.preference === 'tier_s') return pref.score >= 20;
            if (activeFilters.preference === 'tier_a') return pref.score > 0 && pref.score < 20;
            if (activeFilters.preference === 'tier_c') return pref.score < 0 || pref.difficulty !== 0;
            return true;
        });
    }

    // Sortowanie: Najpierw Ulubione (Tier S), potem alfabetycznie
    exercisesToShow.sort((a, b) => {
        const scoreA = (state.userPreferences[a.id]?.score || 0);
        const scoreB = (state.userPreferences[b.id]?.score || 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.name.localeCompare(b.name, 'pl');
    });

    // 4. Renderowanie kart
    if (exercisesToShow.length === 0) {
        container.appendChild(Object.assign(document.createElement('p'), { textContent: "Brak ćwiczeń spełniających kryteria.", style: "text-align:center; opacity:0.6; margin-top:2rem;" }));
    } else {
        exercisesToShow.forEach(exercise => {
            const card = document.createElement('div');
            card.className = 'library-card';
            
            const isBlocked = state.blacklist.includes(exercise.id);
            if (isBlocked) card.style.borderLeftColor = 'var(--danger-color)';

            const youtubeIdMatch = exercise.youtube_url ? exercise.youtube_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:\?|&|$)/) : null;
            const youtubeId = youtubeIdMatch ? youtubeIdMatch[1] : null;
            const lvl = exercise.difficultyLevel || 1;
            const categoryName = formatCategoryName(exercise.categoryId);
            const equipment = exercise.equipment || 'Brak sprzętu';
            const affinityBadge = getAffinityBadge(exercise.id);

            const tagsHTML = `
                <div class="library-card-meta">
                    <span class="meta-badge badge-lvl-${lvl}">⚡ ${getLevelLabel(lvl)}</span>
                    <span class="meta-badge badge-category">📂 ${categoryName}</span>
                    <span class="meta-badge badge-equipment">🏋️ ${equipment}</span>
                </div>
            `;

             let actionButtons = '';
            if (currentTab === 'blacklist') {
                actionButtons = `<button class="btn-with-icon btn-danger restore-btn" data-id="${exercise.id}" style="border-color: var(--success-color); color: var(--success-color);"><span>♻️ Przywróć</span></button>`;
            } else {
                if (exercise.animationSvg) actionButtons += `<button class="btn-with-icon btn-secondary preview-anim-btn" data-exercise-id="${exercise.id}" title="Podgląd animacji"><img src="/icons/eye.svg" alt=""><span>Podgląd</span></button>`;
                if (getIsCasting()) { const youtubeId = youtubeIdMatch ? youtubeIdMatch[1] : null; actionButtons += `<button class="btn-with-icon btn-primary cast-video-btn" data-youtube-id="${youtubeId || ''}" ${!youtubeId ? 'disabled' : ''} title="Rzutuj wideo na TV"><img src="/icons/cast.svg" alt=""><span>Rzutuj</span></button>`; }
                if (exercise.youtube_url) actionButtons += `<a href="${exercise.youtube_url}" target="_blank" rel="noopener noreferrer" class="btn-with-icon btn-secondary" title="Otwórz w YouTube"><img src="/icons/external-link.svg" alt=""><span>Wideo</span></a>`;
                if (!isBlocked) actionButtons += `<button class="btn-with-icon btn-danger block-btn" data-id="${exercise.id}" title="Dodaj do czarnej listy"><img src="/icons/ban.svg" alt=""><span>Blokuj</span></button>`;
            }

            // POPRAWIONY UKŁAD NAGŁÓWKA (FLEXBOX + GAP)
            card.innerHTML = `
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap: 10px; margin-bottom: 0.8rem;">
                    <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 12px;">
                        <h3 style="margin: 0; line-height: 1.2;">${exercise.name}</h3>
                        ${affinityBadge}
                    </div>
                    ${isBlocked && currentTab === 'all' ? '<span style="font-size:0.8rem; color:red; font-weight:bold; white-space: nowrap;">🚫 Zablokowane</span>' : ''}
                </div>
                ${tagsHTML}
                <p class="library-card-description">${exercise.description || ''}</p>
                <div class="library-card-footer"><div style="display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end; width:100%;">${actionButtons}</div></div>`;
            container.appendChild(card);
        });
    }

    // 5. Obsługa zdarzeń
    const searchInput = document.getElementById('library-search-input');
    wrapper.querySelector('#tab-all').addEventListener('click', () => { currentTab = 'all'; renderLibraryScreen(searchInput.value); });
    wrapper.querySelector('#tab-blacklist').addEventListener('click', () => { currentTab = 'blacklist'; renderLibraryScreen(searchInput.value); });
    wrapper.querySelector('#filter-category').addEventListener('change', (e) => { activeFilters.category = e.target.value; renderLibraryScreen(searchInput.value); });
    wrapper.querySelector('#filter-level').addEventListener('change', (e) => { activeFilters.level = e.target.value; renderLibraryScreen(searchInput.value); });
    wrapper.querySelector('#filter-equipment').addEventListener('change', (e) => { activeFilters.equipment = e.target.value; renderLibraryScreen(searchInput.value); });
    wrapper.querySelector('#filter-preference').addEventListener('change', (e) => { activeFilters.preference = e.target.value; renderLibraryScreen(searchInput.value); });
    wrapper.querySelector('#filter-reset').addEventListener('click', () => {
        activeFilters = { category: 'all', level: 'all', equipment: 'all', preference: 'all' };
        renderLibraryScreen(searchInput.value); 
    });

    // Delegacja zdarzeń dla dynamicznej listy
    if (container._libraryClickHandler) { container.removeEventListener('click', container._libraryClickHandler); }
    
    const handleContainerClick = async (e) => {
        // Modal podglądu
        const previewBtn = e.target.closest('.preview-anim-btn');
        if (previewBtn) { 
            e.stopPropagation();
            const exId = previewBtn.dataset.exerciseId;
            const ex = state.exerciseLibrary[exId];
            if (ex && ex.animationSvg) {
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.innerHTML = `<div class="swap-modal" style="align-items: center; text-align: center;"><h3>${ex.name}</h3><div style="width: 100%; max-width: 300px; margin: 1rem 0;">${ex.animationSvg}</div><button id="close-preview" class="nav-btn" style="width: 100%">Zamknij</button></div>`;
                document.body.appendChild(overlay);
                overlay.querySelector('#close-preview').onclick = () => overlay.remove();
                overlay.onclick = (ev) => { if(ev.target === overlay) overlay.remove(); };
            }
            return; 
        }

        // Przywracanie z czarnej listy
        const restoreBtn = e.target.closest('.restore-btn');
        if (restoreBtn) { 
            const id = restoreBtn.dataset.id; 
            e.stopPropagation(); 
            if (confirm('Przywrócić?')) { 
                await dataStore.removeFromBlacklist(id); 
                renderLibraryScreen(searchInput.value); 
            } 
            return; 
        }

        // Dodawanie do czarnej listy
        const blockBtn = e.target.closest('.block-btn');
        if (blockBtn) { 
            const id = blockBtn.dataset.id; 
            e.stopPropagation(); 
            if (confirm('Blokować?')) { 
                await dataStore.addToBlacklist(id, null); 
                renderLibraryScreen(searchInput.value); 
            } 
            return; 
        }
        
        // Obsługa Google Cast
        const castBtn = e.target.closest('.cast-video-btn');
        if (castBtn) { 
             const youtubeId = castBtn.dataset.youtubeId; 
             if (youtubeId && getIsCasting()) { 
                 sendPlayVideo(youtubeId); 
                 castBtn.querySelector('span').textContent = "Zatrzymaj"; 
                 castBtn.classList.replace('cast-video-btn', 'stop-cast-video-btn'); 
             } else if (!getIsCasting()) {
                 alert("Najpierw połącz się z TV.");
             }
             return;
        }

        const stopCastBtn = e.target.closest('.stop-cast-video-btn');
        if (stopCastBtn) { 
            sendStopVideo(); 
            stopCastBtn.querySelector('span').textContent = "Rzutuj"; 
            stopCastBtn.classList.replace('stop-cast-video-btn', 'cast-video-btn'); 
            return; 
        }
    };

    container.addEventListener('click', handleContainerClick);
    container._libraryClickHandler = handleContainerClick;
    navigateTo('library');
};