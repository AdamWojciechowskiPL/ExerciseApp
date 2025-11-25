// js/ui/screens/dashboard.js
import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { getActiveTrainingPlan, getTrainingDayForDate, getHydratedDay, getISODate } from '../../utils.js';
import { getIsCasting, sendUserStats } from '../../cast.js';
import { getGamificationState } from '../../gamification.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo } from '../core.js';
// Dodano import generateCompletedMissionCardHTML
import { generateHeroDashboardHTML, generateMissionCardHTML, generateCompletedMissionCardHTML } from '../templates.js';
import { renderPreTrainingScreen } from './training.js';
// Importujemy renderDayDetailsScreen do obsługi przycisku "Zobacz szczegóły"
import { renderDayDetailsScreen } from './history.js';

export const renderMainScreen = () => {
    const activePlan = getActiveTrainingPlan();
    if (!activePlan) {
        containers.days.innerHTML = '<p>Ładowanie planu treningowego...</p>';
        return;
    }

    // 1. HERO DASHBOARD
    const heroContainer = document.getElementById('hero-dashboard');
    if (heroContainer) {
        try {
            // Używamy helpera z gamification, ale Tarcze bierzemy bezpośrednio ze stanu
            // (bo assistant.calculateResilience w nowej wersji tylko zwraca state.userStats.resilience)
            
            const stats = state.userStats || {};
            
            // Jeśli mamy dane o Tarczy (z cache lub serwera), używamy ich
            // Jeśli nie, template obsłuży to jako "Ładowanie..."
            
            const combinedStats = {
                ...getGamificationState(state.userProgress), // To wylicza progressPercent i Tier lokalnie
                resilience: stats.resilience, // To może być null na początku
                streak: stats.streak,         // To bierzemy z serwera (pewniejsze)
                totalSessions: stats.totalSessions,
                level: stats.level
            };

            if (getIsCasting()) sendUserStats(combinedStats);
            heroContainer.classList.remove('hidden');
            heroContainer.innerHTML = generateHeroDashboardHTML(combinedStats);
        } catch (e) {
            console.error('[Dashboard] Błąd renderowania Hero:', e);
        }
    }

    // 2. MISJA DNIA
    containers.days.innerHTML = '';
    const today = new Date();
    const todayISO = getISODate(today); // Potrzebne do sprawdzenia historii
    
    const todayDataRaw = getTrainingDayForDate(today);
    const todayData = getHydratedDay(todayDataRaw);

    if (todayData) {
        // --- SPRAWDZENIE CZY MISJA JUŻ WYKONANA (NOWOŚĆ) ---
        const todaysSessions = state.userProgress[todayISO] || [];
        // Szukamy sesji, która ma ten sam numer dnia treningowego co dzisiejszy plan
        const completedSession = todaysSessions.find(s => 
            String(s.trainingDayId) === String(todayData.dayNumber)
        );

        containers.days.innerHTML += `<div class="section-title">Twoja Misja na Dziś</div>`;
        const missionCardContainer = document.createElement('div');

        if (completedSession) {
            // --- SCENARIUSZ A: MISJA WYKONANA ---
            missionCardContainer.innerHTML = generateCompletedMissionCardHTML(completedSession);
            containers.days.appendChild(missionCardContainer);

            // Obsługa przycisku "Zobacz szczegóły"
            const detailsBtn = missionCardContainer.querySelector('.view-details-btn');
            if (detailsBtn) {
                detailsBtn.addEventListener('click', () => {
                    // ZMIANA: Przekazujemy callback, który wraca do Dashboardu
                    renderDayDetailsScreen(todayISO, () => {
                        navigateTo('main');
                        renderMainScreen();
                    });
                });
            }

        } else {
            // --- SCENARIUSZ B: MISJA DO WYKONANIA (Stary kod) ---
            const estimatedMinutes = assistant.estimateDuration(todayData);
            missionCardContainer.innerHTML = generateMissionCardHTML(todayData, estimatedMinutes);
            containers.days.appendChild(missionCardContainer);

            // Logika Wellness Check-in
            const cardEl = missionCardContainer.firstElementChild;
            const timeBadge = cardEl.querySelector('#mission-time-val');
            const timeContainer = cardEl.querySelector('.estimated-time-badge');
            const startBtn = cardEl.querySelector('#start-mission-btn');
            const painOptions = cardEl.querySelectorAll('.pain-option');

            painOptions.forEach(opt => {
                opt.addEventListener('click', () => {
                    painOptions.forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');

                    const painLevel = parseInt(opt.dataset.level, 10);
                    const adjustedPlan = assistant.adjustTrainingVolume(todayData, painLevel);
                    const newDuration = assistant.estimateDuration(adjustedPlan);

                    timeBadge.textContent = `${newDuration} min`;
                    startBtn.dataset.initialPain = painLevel;

                    if (newDuration < estimatedMinutes) {
                        timeContainer.classList.add('reduced');
                        startBtn.textContent = "Start (Dostosowany)";
                    } else {
                        timeContainer.classList.remove('reduced');
                        startBtn.textContent = "Start Misji";
                    }
                });
            });

            startBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                const pain = parseInt(startBtn.dataset.initialPain, 10) || 0;
                renderPreTrainingScreen(todayData.dayNumber, pain);
            });
        }

    } else {
        containers.days.innerHTML += `<p style="padding:1rem; text-align:center; opacity:0.6">Brak treningu na dziś. Odpoczywaj!</p>`;
    }

    // 3. NADCHODZĄCE DNI (Bez zmian)
    let upcomingHeaderAdded = false;
    for (let i = 1; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        const dayDataRaw = getTrainingDayForDate(date);
        if (!dayDataRaw) continue;
        const dayData = getHydratedDay(dayDataRaw);

        if (!upcomingHeaderAdded) {
            const upcomingTitle = document.createElement('div');
            upcomingTitle.className = 'section-title';
            upcomingTitle.textContent = 'Nadchodzące';
            containers.days.appendChild(upcomingTitle);
            upcomingHeaderAdded = true;
        }
        
        const dateLabel = i === 1 ? "JUTRO" : date.toLocaleString('pl-PL', { weekday: 'short', day: 'numeric' });
        const card = document.createElement('div');
        card.className = 'day-card';
        card.innerHTML = `
            <p class="day-card-date">${dateLabel}</p>
            <div class="card-header"><h3>Dzień ${dayData.dayNumber}: ${dayData.title}</h3></div>
            <button class="nav-btn" style="width:100%; margin-top:0.5rem; opacity:0.7">Podgląd</button>
        `;
        
        card.querySelector('button').addEventListener('click', (e) => {
            e.stopPropagation();
            renderPreTrainingScreen(dayData.dayNumber, 0);
        });
        containers.days.appendChild(card);
    }

    navigateTo('main');
};