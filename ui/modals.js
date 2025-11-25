// js/ui/modals.js
import { state } from '../state.js';

export function renderSwapModal(currentExercise, onConfirm) {
    // 1. IDENTYFIKACJA KATEGORII
    // Pobieramy ID z planu (exerciseId) lub z obiektu (id)
    const currentId = currentExercise.id || currentExercise.exerciseId;
    
    // Sprawdzamy kategorię w planie, a jak brak to w bibliotece
    let categoryId = currentExercise.categoryId;
    const libraryExercise = state.exerciseLibrary[currentId];

    if (!categoryId && libraryExercise) {
        categoryId = libraryExercise.categoryId;
    }

    if (!categoryId) {
        console.error("[Smart Swap] Błąd: Ćwiczenie bez kategorii:", currentExercise);
        alert("Błąd danych: To ćwiczenie nie ma przypisanej kategorii. Nie mogę znaleźć zamiennika.");
        return;
    }

    // 2. PRZYGOTOWANIE ALTERNATYW (FIX: Dodawanie ID)
    // Zamiast Object.values, używamy Object.entries, żeby wyciągnąć klucz (ID)
    const alternatives = Object.entries(state.exerciseLibrary)
        .map(([id, data]) => ({ 
            id: id,      // Jawnie przypisujemy ID z klucza
            ...data      // Reszta danych (name, categoryId, etc.)
        }))
        .filter(ex => {
            // Ta sama kategoria
            const isSameCategory = ex.categoryId === categoryId;
            // Inne ID niż obecne
            const isDifferent = String(ex.id) !== String(currentId);
            return isSameCategory && isDifferent;
        });

    if (alternatives.length === 0) {
        alert(`Brak alternatyw dla kategorii "${categoryId}" w bazie.`);
        return;
    }

    // 3. RENDEROWANIE WIDOKU (HTML)
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const altsHtml = alternatives.map(alt => `
        <div class="alt-exercise-card" data-id="${alt.id}">
            <div class="alt-info">
                <h4>${alt.name}</h4>
                <p>
                    <span class="alt-badge">Lvl ${alt.difficultyLevel || 1}</span>
                    ${alt.equipment || 'Brak sprzętu'}
                </p>
            </div>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div class="swap-modal">
            <h3>Wymień: ${currentExercise.name || (libraryExercise ? libraryExercise.name : 'Ćwiczenie')}</h3>
            <p style="font-size:0.85rem; color:#666; margin-bottom:1rem;">Kategoria: ${categoryId}</p>
            
            <div class="swap-options-list">
                ${altsHtml}
            </div>

            <div class="swap-actions">
                <div style="font-size:0.85rem; font-weight:bold; margin-bottom:5px;">Tryb wymiany:</div>
                <div class="swap-type-toggle">
                    <button class="toggle-btn active" data-type="today">Tylko dziś</button>
                    <button class="toggle-btn" data-type="blacklist">🚫 Nie lubię (Czarna Lista)</button>
                </div>
                
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button id="cancel-swap" class="nav-btn" style="flex:1">Anuluj</button>
                    <button id="confirm-swap" class="action-btn" style="flex:1" disabled>Wymień</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // 4. LOGIKA INTERAKCJI
    let selectedAltId = null;
    let swapType = 'today';

    const cards = overlay.querySelectorAll('.alt-exercise-card');
    const confirmBtn = overlay.querySelector('#confirm-swap');
    const toggleBtns = overlay.querySelectorAll('.toggle-btn');

    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            // Teraz data-id na pewno jest poprawne
            selectedAltId = card.dataset.id;
            
            const selectedName = state.exerciseLibrary[selectedAltId]?.name || 'Wybrane';
            confirmBtn.disabled = false;
            confirmBtn.textContent = `Wymień na: ${selectedName}`;
        });
    });

    toggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 1. Resetujemy klasę 'active' na wszystkich przyciskach
            toggleBtns.forEach(b => b.classList.remove('active'));
            
            // 2. Dodajemy klasę 'active' do KLIKNIĘTEGO przycisku
            // Używamy 'btn' zamiast 'e.target', aby mieć pewność, że celujemy w <button>
            btn.classList.add('active');
            
            // 3. Aktualizujemy zmienną logiczną
            swapType = btn.dataset.type;
            
            console.log("Wybrano tryb wymiany:", swapType);
        });
    });

    overlay.querySelector('#cancel-swap').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    confirmBtn.addEventListener('click', () => {
        if (selectedAltId) {
            // FIX: Tworzymy pełny obiekt z ID, żeby przekazać go dalej
            const rawDef = state.exerciseLibrary[selectedAltId];
            const newExerciseDef = {
                id: selectedAltId, // Gwarantujemy, że ID jest w obiekcie
                ...rawDef
            };
            
            onConfirm(newExerciseDef, swapType);
            document.body.removeChild(overlay);
        }
    });
}

// Przykład prostego modala (można dodać do ui/modals.js)
export function renderPreviewModal(svgContent, title) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="swap-modal" style="align-items: center; text-align: center;">
            <h3>${title}</h3>
            <div style="width: 100%; max-width: 300px; margin: 1rem 0;">
                ${svgContent}
            </div>
            <button id="close-preview" class="nav-btn" style="width: 100%">Zamknij</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#close-preview').addEventListener('click', () => overlay.remove());
}

// W preTraining lub Library nasłuchuj kliknięć:
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.preview-anim-btn');
    if (btn) {
        const exId = btn.dataset.exerciseId;
        const ex = state.exerciseLibrary[exId]; // Pobierz z globalnego stanu
        if (ex && ex.animationSvg) {
            renderPreviewModal(ex.animationSvg, ex.name);
        }
    }
});

export function renderEvolutionModal(adaptation, onCheck) {
    // adaptation: { original: string, type: 'evolution'|'devolution', newId: string, newName: string }
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const isEvo = adaptation.type === 'evolution';
    
    // Konfiguracja treści zależna od typu zmiany
    const config = isEvo ? {
        title: "Ewolucja!",
        desc: "Twoja stabilność osiągnęła 100%. System odblokował trudniejszy wariant, aby utrzymać progresję.",
        icon: "🏆",
        color: "var(--gold-color)",
        btnText: "Przyjmuję Wyzwanie"
    } : {
        title: "Korekta",
        desc: "Wykryto przeciążenie. System tymczasowo cofa trudność tego ćwiczenia, abyś mógł odzyskać pełną kontrolę.",
        icon: "🛡️",
        color: "var(--secondary-color)", // Turkus/Mint
        btnText: "Zrozumiałem"
    };

    // Jeśli backend nie zwrócił nazwy nowego ćwiczenia (bo np. robił tylko ID),
    // możemy spróbować pobrać ją ze stanu, ale dla bezpieczeństwa użyjmy ogólnej nazwy.
    const newName = adaptation.newName || "Nowy Wariant";

    overlay.innerHTML = `
        <div class="evolution-modal" style="--glow-color: ${config.color}">
            <div class="evo-icon-wrapper">
                <span style="font-size: 3rem;">${config.icon}</span>
            </div>
            
            <h2 class="evo-title">${config.title}</h2>
            <p class="evo-desc">${config.desc}</p>
            
            <div class="change-box">
                <div class="ex-name" style="opacity: 0.7; text-decoration: line-through;">${adaptation.original}</div>
                <div class="change-arrow">⬇</div>
                <div class="ex-name" style="color: ${config.color}">${newName}</div>
            </div>

            <button id="close-evo" class="action-btn" style="background: ${config.color}; color: #000; border: none;">
                ${config.btnText}
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Dźwięk sukcesu (jeśli mamy audioContext w state)
    if (state.completionSound && isEvo) {
        state.finalCompletionSound(); 
    }

    const closeBtn = overlay.querySelector('#close-evo');
    closeBtn.onclick = () => {
        // Animacja wyjścia
        const modal = overlay.querySelector('.evolution-modal');
        modal.style.transform = 'scale(0.8)';
        modal.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            if (onCheck) onCheck();
        }, 200);
    };
}