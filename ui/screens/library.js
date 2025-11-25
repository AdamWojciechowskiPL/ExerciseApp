// js/ui/screens/library.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { navigateTo } from '../core.js';
import { getIsCasting, sendPlayVideo, sendStopVideo } from '../../cast.js';
import dataStore from '../../dataStore.js';

// --- STAN LOKALNY EKRANU ---
let currentTab = 'all'; 
let activeFilters = {
    category: 'all',
    level: 'all',
    equipment: 'all'
};

// Helpery formatowania
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

    // ============================================================
    // 1. PRZYGOTOWANIE DANYCH
    // ============================================================
    const allExercises = Object.values(state.exerciseLibrary);
    
    const uniqueCategories = [...new Set(allExercises.map(ex => ex.categoryId).filter(Boolean))].sort();
    const uniqueLevels = [...new Set(allExercises.map(ex => ex.difficultyLevel || 1))].sort((a,b) => a - b);
    const uniqueEquipment = [...new Set(allExercises.map(ex => ex.equipment || 'Brak sprzętu'))].sort();

    // ============================================================
    // 2. GENEROWANIE HTML NAGŁÓWKA
    // ============================================================
    
    const categoryOptions = uniqueCategories.map(cat => 
        `<option value="${cat}" ${activeFilters.category === cat ? 'selected' : ''}>${formatCategoryName(cat)}</option>`
    ).join('');

    const levelOptions = uniqueLevels.map(lvl => 
        `<option value="${lvl}" ${String(activeFilters.level) === String(lvl) ? 'selected' : ''}>${getLevelLabel(lvl)}</option>`
    ).join('');

    const equipmentOptions = uniqueEquipment.map(eq => 
        `<option value="${eq}" ${activeFilters.equipment === eq ? 'selected' : ''}>${eq}</option>`
    ).join('');

    const headerHTML = `
        <div class="library-tabs" style="display:flex; gap:10px; margin-bottom:1rem;">
            <button id="tab-all" class="toggle-btn ${currentTab === 'all' ? 'active' : ''}" style="flex:1; padding:10px;">Baza Ćwiczeń</button>
            <button id="tab-blacklist" class="toggle-btn ${currentTab === 'blacklist' ? 'active' : ''}" style="flex:1; padding:10px;">
                Czarna Lista (${state.blacklist.length})
            </button>
        </div>

        <div class="filters-container">
            <select id="filter-category" class="filter-select">
                <option value="all">Wszystkie kategorie</option>
                ${categoryOptions}
            </select>

            <select id="filter-level" class="filter-select">
                <option value="all">Wszystkie poziomy</option>
                ${levelOptions}
            </select>

            <select id="filter-equipment" class="filter-select">
                <option value="all">Dowolny sprzęt</option>
                ${equipmentOptions}
            </select>

            <button id="filter-reset" class="filter-reset-btn">Wyczyść</button>
        </div>
    `;
    
    const wrapper = document.createElement('div');
    wrapper.innerHTML = headerHTML;
    container.appendChild(wrapper);

    // ============================================================
    // 3. FILTROWANIE LISTY
    // ============================================================
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    
    let exercisesToShow = Object.entries(state.exerciseLibrary).map(([id, data]) => ({
        id: id,
        ...data
    }));

    if (currentTab === 'blacklist') {
        exercisesToShow = exercisesToShow.filter(ex => state.blacklist.includes(ex.id));
    } 

    if (lowerCaseSearchTerm) {
        exercisesToShow = exercisesToShow.filter(ex => 
            ex.name.toLowerCase().includes(lowerCaseSearchTerm) || 
            (ex.description && ex.description.toLowerCase().includes(lowerCaseSearchTerm))
        );
    }

    if (activeFilters.category !== 'all') {
        exercisesToShow = exercisesToShow.filter(ex => ex.categoryId === activeFilters.category);
    }
    if (activeFilters.level !== 'all') {
        exercisesToShow = exercisesToShow.filter(ex => (ex.difficultyLevel || 1) == activeFilters.level);
    }
    if (activeFilters.equipment !== 'all') {
        exercisesToShow = exercisesToShow.filter(ex => (ex.equipment || 'Brak sprzętu') === activeFilters.equipment);
    }

    // ============================================================
    // 4. RENDEROWANIE KART
    // ============================================================
    if (exercisesToShow.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.opacity = '0.6';
        emptyMsg.style.marginTop = '2rem';
        emptyMsg.textContent = "Brak ćwiczeń spełniających kryteria.";
        container.appendChild(emptyMsg);
    } else {
        exercisesToShow.forEach(exercise => {
            const card = document.createElement('div');
            card.className = 'library-card';
            
            const isBlocked = state.blacklist.includes(exercise.id);
            if (isBlocked) {
                card.style.borderLeftColor = 'var(--danger-color)';
            }

            const youtubeIdMatch = exercise.youtube_url ? exercise.youtube_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:\?|&|$)/) : null;
            const youtubeId = youtubeIdMatch ? youtubeIdMatch[1] : null;

            const lvl = exercise.difficultyLevel || 1;
            const categoryName = formatCategoryName(exercise.categoryId);
            const equipment = exercise.equipment || 'Brak sprzętu';

            const tagsHTML = `
                <div class="library-card-meta">
                    <span class="meta-badge badge-lvl-${lvl}">⚡ ${getLevelLabel(lvl)}</span>
                    <span class="meta-badge badge-category">📂 ${categoryName}</span>
                    <span class="meta-badge badge-equipment">🏋️ ${equipment}</span>
                </div>
            `;

             let actionButtons = '';
            
            if (currentTab === 'blacklist') {
                // Przycisk przywracania (Czarna lista)
                actionButtons = `
                    <button class="btn-with-icon btn-danger restore-btn" data-id="${exercise.id}" style="border-color: var(--success-color); color: var(--success-color);">
                        <span>♻️ Przywróć</span>
                    </button>`;
            } else {
                // 1. PODGLĄD ANIMACJI
                if (exercise.animationSvg) {
                    actionButtons += `
                    <button class="btn-with-icon btn-secondary preview-anim-btn" 
                            data-exercise-id="${exercise.id}" 
                            title="Podgląd animacji">
                        <img src="/icons/eye.svg" alt="">
                        <span>Podgląd</span>
                    </button>`;
                }

                // 2. RZUTOWANIE (Tylko gdy połączono)
                if (getIsCasting()) {
                    // Używamy cast-video-btn do logiki, ale btn-with-icon do wyglądu
                    const youtubeId = youtubeIdMatch ? youtubeIdMatch[1] : null;
                    actionButtons += `
                    <button class="btn-with-icon btn-primary cast-video-btn" 
                            data-youtube-id="${youtubeId || ''}" 
                            ${!youtubeId ? 'disabled' : ''}
                            title="Rzutuj wideo na TV">
                        <img src="/icons/cast.svg" alt="">
                        <span>Rzutuj</span>
                    </button>`;
                }

                // 3. WIDEO (Link zewnętrzny)
                if (exercise.youtube_url) {
                    actionButtons += `
                    <a href="${exercise.youtube_url}" target="_blank" rel="noopener noreferrer" 
                       class="btn-with-icon btn-secondary"
                       title="Otwórz w YouTube">
                        <img src="/icons/external-link.svg" alt="">
                        <span>Wideo</span>
                    </a>`;
                }

                // 4. BLOKOWANIE
                if (!isBlocked) {
                    actionButtons += `
                    <button class="btn-with-icon btn-danger block-btn" 
                            data-id="${exercise.id}"
                            title="Dodaj do czarnej listy">
                        <img src="/icons/ban.svg" alt="">
                        <span>Blokuj</span>
                    </button>`;
                }
            }

            card.innerHTML = `
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <h3 style="margin-bottom:0.5rem;">${exercise.name}</h3>
                    ${isBlocked && currentTab === 'all' ? '<span style="font-size:0.8rem; color:red; font-weight:bold;">🚫 Zablokowane</span>' : ''}
                </div>
                ${tagsHTML}
                <p class="library-card-description">${exercise.description || ''}</p>
                <div class="library-card-footer">
                    <div style="display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end; width:100%;">
                        ${actionButtons}
                    </div>
                </div>`;
            container.appendChild(card);
        });
    }

    // ============================================================
    // 5. OBSŁUGA ZDARZEŃ
    // ============================================================
    const searchInput = document.getElementById('library-search-input');

    // Tabs & Filtry
    wrapper.querySelector('#tab-all').addEventListener('click', () => { currentTab = 'all'; renderLibraryScreen(searchInput.value); });
    wrapper.querySelector('#tab-blacklist').addEventListener('click', () => { currentTab = 'blacklist'; renderLibraryScreen(searchInput.value); });
    
    wrapper.querySelector('#filter-category').addEventListener('change', (e) => { activeFilters.category = e.target.value; renderLibraryScreen(searchInput.value); });
    wrapper.querySelector('#filter-level').addEventListener('change', (e) => { activeFilters.level = e.target.value; renderLibraryScreen(searchInput.value); });
    wrapper.querySelector('#filter-equipment').addEventListener('change', (e) => { activeFilters.equipment = e.target.value; renderLibraryScreen(searchInput.value); });
    
    wrapper.querySelector('#filter-reset').addEventListener('click', () => {
        activeFilters = { category: 'all', level: 'all', equipment: 'all' };
        renderLibraryScreen(searchInput.value); // zachowujemy wpisany tekst szukania
    });

    // Handler Kart (Delegacja)
    const handleContainerClick = async (e) => {
        // --- MODAL PODGLĄDU (NOWOŚĆ) ---
        const previewBtn = e.target.closest('.preview-anim-btn');
        if (previewBtn) {
            e.stopPropagation();
            const exId = previewBtn.dataset.exerciseId;
            const ex = state.exerciseLibrary[exId];
            
            if (ex && ex.animationSvg) {
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.innerHTML = `
                    <div class="swap-modal" style="align-items: center; text-align: center;">
                        <h3>${ex.name}</h3>
                        <div style="width: 100%; max-width: 300px; margin: 1rem 0;">
                            ${ex.animationSvg}
                        </div>
                        <button type="button" id="close-preview" class="nav-btn" style="width: 100%">Zamknij</button>
                    </div>
                `;
                document.body.appendChild(overlay);

                const closeBtn = overlay.querySelector('#close-preview');
                closeBtn.onclick = (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    overlay.remove();
                };
                overlay.onclick = (evt) => {
                    if (evt.target === overlay) overlay.remove();
                };
            }
            return;
        }

        const target = e.target;
        const currentSearch = searchInput.value;

        if (target.classList.contains('restore-btn')) {
            const id = target.dataset.id;
            e.stopPropagation(); 
            if (confirm('Czy na pewno chcesz przywrócić to ćwiczenie?')) {
                await dataStore.removeFromBlacklist(id);
                renderLibraryScreen(currentSearch); 
            }
        }

        if (target.classList.contains('block-btn')) {
            const id = target.dataset.id;
            e.stopPropagation();
            if (confirm('Czy na pewno chcesz dodać to ćwiczenie do Czarnej Listy?')) {
                await dataStore.addToBlacklist(id, null);
                renderLibraryScreen(currentSearch);
            }
        }

        if (target.classList.contains('cast-video-btn')) {
            const youtubeId = target.dataset.youtubeId;
            if (youtubeId && getIsCasting()) {
                sendPlayVideo(youtubeId);
                target.textContent = "Zatrzymaj ⏹️";
                target.classList.replace('cast-video-btn', 'stop-cast-video-btn');
            } else if (!getIsCasting()) {
                alert("Najpierw połącz się z urządzeniem Chromecast.");
            }
        } else if (target.classList.contains('stop-cast-video-btn')) {
            sendStopVideo();
            target.textContent = "Rzutuj 📺";
            target.classList.replace('stop-cast-video-btn', 'cast-video-btn');
        }
    };

    if (container._libraryClickHandler) {
        container.removeEventListener('click', container._libraryClickHandler);
    }
    container.addEventListener('click', handleContainerClick);
    container._libraryClickHandler = handleContainerClick;

    navigateTo('library');
};