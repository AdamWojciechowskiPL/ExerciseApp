import { screens } from '../../dom.js';
import { navigateTo } from '../core.js';
export const renderHelpScreen = () => {
const screen = screens.help;
screen.innerHTML = '';
const html = `
    <div class="help-container">
        <h2 class="section-title">Centrum Wiedzy</h2>

        <!-- SEKCJA 1: LOGIKA -->
        <div class="help-card highlight">
            <div class="help-header">
                <span style="font-size: 2rem;">🧠</span>
                <h3>Jak to działa?</h3>
            </div>
            <p>Ta aplikacja to nie zwykły PDF. To <strong>Inteligentny Asystent</strong>, który dostosowuje się do Ciebie każdego dnia.</p>
            
            <div class="logic-block">
                <h4>🌪️ Workout Mixer (Mikser)</h4>
                <p>Nie lubisz nudy? Mikser analizuje Twoją historię i codziennie <strong>miesza ćwiczenia</strong>. Jeśli wczoraj robiłeś "Plank", dziś dostaniesz "Dead Bug". Dzięki temu unikasz monotonii, a ciało dostaje nowe bodźce.</p>
            </div>

            <div class="logic-block">
                <h4>🛡️ Assistant & Tarcza</h4>
                <p>System dba o Twoje bezpieczeństwo. Przed treningiem pytamy o poziom bólu. Jeśli zgłosisz problem, <strong>Asystent automatycznie zmniejszy liczbę serii</strong> i usunie najcięższe ćwiczenia, zamieniając je na rehabilitacyjne.</p>
            </div>
        </div>

        <!-- SEKCJA 2: IKONY I AKCJE -->
        <div class="help-card">
            <h3>Legenda: Przyciski i Ikony</h3>
            <div class="icon-legend">
                
                <div class="legend-item">
                    <div class="icon-box"><img src="/icons/swap.svg" alt="Swap"></div>
                    <div class="legend-desc">
                        <strong>Wymień (Smart Swap)</strong>
                        <p>Nie masz sprzętu lub boli Cię bark? Kliknij, aby wymienić ćwiczenie na bezpieczną alternatywę.</p>
                    </div>
                </div>

                <div class="legend-item">
                    <div class="icon-box"><img src="/icons/eye.svg" alt="Podgląd"></div>
                    <div class="legend-desc">
                        <strong>Podgląd Animacji</strong>
                        <p>Zobacz, jak poprawnie wykonać ruch, zanim zaczniesz serię.</p>
                    </div>
                </div>

                <div class="legend-item">
                    <div class="icon-box"><img src="/icons/cast.svg" alt="Cast"></div>
                    <div class="legend-desc">
                        <strong>Ekran TV (Google Cast)</strong>
                        <p>Przenieś trening na duży ekran. Telefon stanie się pilotem.</p>
                    </div>
                </div>

                <div class="legend-item">
                    <div class="icon-box"><img src="/icons/shield-check.svg" alt="Tarcza"></div>
                    <div class="legend-desc">
                        <strong>Tarcza (Resilience)</strong>
                        <p>Wskaźnik Twojej odporności na kontuzje. Im regularniej ćwiczysz, tym silniejsza Tarcza.</p>
                    </div>
                </div>

                <div class="legend-item">
                    <div class="icon-box"><img src="/icons/streak-fire.svg" alt="Seria"></div>
                    <div class="legend-desc">
                        <strong>Ogień (Streak)</strong>
                        <p>Liczba dni treningowych z rzędu. Nie przerwij łańcucha!</p>
                    </div>
                </div>

            </div>
        </div>

        <!-- SEKCJA 3: STEROWANIE -->
        <div class="help-card">
            <h3>Sterowanie w trakcie treningu</h3>
            <div class="controls-legend">
                <div class="control-pair">
                    <img src="/icons/control-play.svg"> <span><strong>Start/Wznów:</strong> Uruchamia licznik czasu.</span>
                </div>
                <div class="control-pair">
                    <img src="/icons/control-pause.svg"> <span><strong>Pauza:</strong> Zatrzymuje czas (np. na łyk wody).</span>
                </div>
                <div class="control-pair">
                    <img src="/icons/control-skip.svg"> <span><strong>Pomiń:</strong> Przechodzi do kolejnego ćwiczenia bez zaliczenia.</span>
                </div>
                <div class="control-pair">
                    <img src="/icons/info.svg"> <span><strong>Obróć kartę:</strong> Przełącza widok między animacją a opisem.</span>
                </div>
            </div>
        </div>

        <button id="help-back-btn" class="action-btn" style="margin-top: 1rem;">Wróć do Panelu Głównego</button>
    </div>
`;

screen.innerHTML = html;

screen.querySelector('#help-back-btn').addEventListener('click', () => {
    navigateTo('main');
});

navigateTo('help');
};  