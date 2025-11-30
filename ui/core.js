// js/ui/core.js
import { screens } from '../dom.js';

const loadingOverlay = document.getElementById('loading-overlay');

// --- Loader ---
export const showLoader = () => {
    if (!loadingOverlay) return;
    loadingOverlay.classList.remove('hidden');
    setTimeout(() => { loadingOverlay.style.opacity = '1'; }, 10);
};

export const hideLoader = () => {
    if (!loadingOverlay) return;
    loadingOverlay.style.opacity = '0';
    setTimeout(() => { loadingOverlay.classList.add('hidden'); }, 300);
};

// --- Wake Lock API ---
export const wakeLockManager = {
    wakeLock: null,
    async request() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.error(`Błąd Wake Lock: ${err.name}, ${err.message}`);
            }
        }
    },
    async release() {
        if (this.wakeLock !== null) {
            try {
                await this.wakeLock.release();
                this.wakeLock = null;
            } catch (err) {
                console.error(`Błąd zwalniania Wake Lock: ${err.name}, ${err.message}`);
            }
        }
    }
};

// --- Nawigacja ---
export const navigateTo = (screenName) => {
    // Zarządzanie blokadą ekranu tylko w trybie treningu
    if (screenName === 'training') {
        wakeLockManager.request();
    } else {
        wakeLockManager.release();
    }

    const bottomNav = document.getElementById('app-bottom-nav');
    const footer = document.getElementById('app-footer');
    const header = document.querySelector('header');

    // Przełączanie widoczności ekranów
    if (screenName === 'training') {
        screens.training.classList.add('active');
        if (header) header.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        if (footer) footer.style.display = 'none';
    } else {
        screens.training.classList.remove('active');
        if (header) header.style.display = '';
        if (bottomNav) bottomNav.style.display = '';
        if (footer) footer.style.display = '';
        
        // Ukryj inne ekrany, pokaż wybrany
        Object.values(screens).forEach(s => { 
            if (s) s.classList.remove('active'); 
        });
        if (screens[screenName]) screens[screenName].classList.add('active');

        // Aktualizacja dolnej nawigacji (jeśli istnieje)
        if (bottomNav) {
            const bottomNavButtons = bottomNav.querySelectorAll('.bottom-nav-btn');
            bottomNavButtons.forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.screen === screenName) {
                    btn.classList.add('active');
                }
            });
        }
    }
    window.scrollTo(0, 0);
};