import { state } from '../../state.js';
import { containers } from '../../dom.js';
import { getActiveTrainingPlan, getTrainingDayForDate, getHydratedDay, getISODate } from '../../utils.js';
import { getIsCasting, sendUserStats } from '../../cast.js';
import { getGamificationState } from '../../gamification.js';
import { assistant } from '../../assistantEngine.js';
import { navigateTo } from '../core.js';
import { generateHeroDashboardHTML, generateMissionCardHTML, generateCompletedMissionCardHTML } from '../templates.js';
import { renderPreTrainingScreen } from './training.js';
import { renderDayDetailsScreen } from './history.js';
// NOWOŚĆ: Import Mixera
import { workoutMixer } from '../../workoutMixer.js';

export const renderMainScreen = () => {
    const activePlan = getActiveTrainingPlan();
    if (!activePlan) {
        containers.days.innerHTML = '<p>Ładowanie planu treningowego...</p>';
        return;
    }

    // 1. HERO DASHBOARD (Bez zmian)
    const heroContainer = document.getElementById('hero-dashboard');
    if (heroContainer) {
        try {
            const stats = state.userStats || {};
            const combinedStats = {
                ...getGamificationState(state.userProgress), 
                resilience: stats.resilience, 
                streak: stats.streak,         
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
    const todayISO = getISODate(today); 
    
    const todayDataRaw = getTrainingDayForDate(today);
    // KROK 1: Pobieramy standardowy ("sztywny") plan
    const todayDataStatic = getHydratedDay(todayDataRaw);

    if (todayDataStatic) {
        // --- SPRAWDZENIE CZY MISJA JUŻ WYKONANA ---
        const todaysSessions = state.userProgress[todayISO] || [];
        const completedSession = todaysSessions.find(s => 
            String(s.trainingDayId) === String(todayDataStatic.dayNumber)
        );

        containers.days.innerHTML += `<div class="section-title">Twoja Misja na Dziś</div>`;
        const missionCardContainer = document.createElement('div');

        if (completedSession) {
            // MISJA WYKONANA (Bez zmian)
            missionCardContainer.innerHTML = generateCompletedMissionCardHTML(completedSession);
            containers.days.appendChild(missionCardContainer);

            const detailsBtn = missionCardContainer.querySelector('.view-details-btn');
            if (detailsBtn) {
                detailsBtn.addEventListener('click', () => {
                    renderDayDetailsScreen(todayISO, () => {
                        navigateTo('main');
                        renderMainScreen();
                    });
                });
            }

        } else {
            // --- SCENARIUSZ B: MISJA DO WYKONANIA (DYNAMICZNA!) ---
            
            // KROK 2: Przepuszczamy przez Mixer ("Magia")
            // Sprawdzamy, czy w stanie już mamy wygenerowany plan na dziś (żeby nie tasować przy każdym wejściu do dashboardu)
            if (!state.todaysDynamicPlan || state.todaysDynamicPlan.dayNumber !== todayDataStatic.dayNumber) {
                console.log("🎲 Generowanie nowego Dynamicznego Planu...");
                state.todaysDynamicPlan = workoutMixer.mixWorkout(todayDataStatic);
            }
            
            const dynamicDayData = state.todaysDynamicPlan;

            const estimatedMinutes = assistant.estimateDuration(dynamicDayData);
            
            // Renderujemy kartę z DYNAMICZNYMI danymi
            missionCardContainer.innerHTML = generateMissionCardHTML(dynamicDayData, estimatedMinutes);
            containers.days.appendChild(missionCardContainer);

            // Logika Wellness Check-in (Bez zmian, działa na dynamicznym planie)
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
                    // Asystent też dostaje dynamiczny plan
                    const adjustedPlan = assistant.adjustTrainingVolume(dynamicDayData, painLevel);
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
                // Renderujemy PreTraining z dynamicznym planem (przekazując ID, ale logika preTraining weźmie state.todaysDynamicPlan)
                renderPreTrainingScreen(dynamicDayData.dayNumber, pain, true); // true = use dynamic
            });
        }

    } else {
        containers.days.innerHTML += `<p style="padding:1rem; text-align:center; opacity:0.6">Brak treningu na dziś. Odpoczywaj!</p>`;
    }

    // 3. NADCHODZĄCE DNI (Bez zmian - tutaj pokazujemy statyczne podglądy, bez tasowania)
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
            // Dla nadchodzących nie używamy dynamicznego mixera (jeszcze)
            renderPreTrainingScreen(dayData.dayNumber, 0, false); 
        });
        containers.days.appendChild(card);
    }

    navigateTo('main');
};