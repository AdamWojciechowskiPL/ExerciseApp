// ExerciseApp/ui/screens/help.js
import { screens } from '../../dom.js';
import { navigateTo } from '../core.js';

export const renderHelpScreen = () => {
    const screen = screens.help;
    screen.innerHTML = '';
    const html = `
        <div class="help-container">
            <h2 class="section-title">Centrum Wiedzy</h2>

            <div class="help-card highlight">
                <div class="help-header">
                    <span class="help-icon-large">🧠</span>
                    <h3>Jak to działa?</h3>
                </div>
                <p>Ta aplikacja to nie zwykły PDF. To <strong>Inteligentny Asystent</strong>, który dostosowuje się do Ciebie każdego dnia.</p>

                <div class="logic-block">
                    <h4>🌪️ Workout Mixer (Mikser)</h4>
                    <p>Nie lubisz nudy? Mikser analizuje Twoją historię i codziennie <strong>miesza ćwiczenia</strong>. Jeśli wczoraj robiłeś "Plank", dziś dostaniesz "Dead Bug".</p>
                </div>

                <div class="logic-block">
                    <h4>🛡️ Assistant & Tarcza</h4>
                    <p>System dba o Twoje bezpieczeństwo. Przed treningiem pytamy o poziom bólu. Jeśli zgłosisz problem, <strong>Asystent automatycznie zmniejszy liczbę serii</strong>.</p>
                </div>
            </div>

            <div class="help-card">
                <h3>Legenda: Przyciski i Ikony</h3>
                <div class="icon-legend">

                    <div class="legend-item">
                        <div class="icon-box"><svg width="24" height="24"><use href="#icon-swap"/></svg></div>
                        <div class="legend-desc">
                            <strong>Wymień (Smart Swap)</strong>
                            <p>Nie masz sprzętu lub boli Cię bark? Kliknij, aby wymienić ćwiczenie na bezpieczną alternatywę.</p>
                        </div>
                    </div>

                    <div class="legend-item">
                        <div class="icon-box"><svg width="24" height="24"><use href="#icon-eye"/></svg></div>
                        <div class="legend-desc">
                            <strong>Podgląd Animacji</strong>
                            <p>Zobacz, jak poprawnie wykonać ruch, zanim zaczniesz serię.</p>
                        </div>
                    </div>

                    <div class="legend-item">
                        <div class="icon-box"><svg width="24" height="24"><use href="#icon-cast"/></svg></div>
                        <div class="legend-desc">
                            <strong>Ekran TV (Google Cast)</strong>
                            <p>Przenieś trening na duży ekran. Telefon stanie się pilotem.</p>
                        </div>
                    </div>

                    <div class="legend-item">
                        <div class="icon-box"><svg width="24" height="24"><use href="#icon-shield-check"/></svg></div>
                        <div class="legend-desc">
                            <strong>Tarcza (Resilience)</strong>
                            <p>Wskaźnik Twojej odporności na kontuzje. Im regularniej ćwiczysz, tym silniejsza Tarcza.</p>
                        </div>
                    </div>

                    <div class="legend-item">
                        <div class="icon-box"><svg width="24" height="24"><use href="#icon-streak-fire"/></svg></div>
                        <div class="legend-desc">
                            <strong>Ogień (Streak)</strong>
                            <p>Liczba dni treningowych z rzędu. Nie przerwij łańcucha!</p>
                        </div>
                    </div>

                </div>
            </div>

            <div class="help-card">
                <h3>Sterowanie w trakcie treningu</h3>
                <div class="controls-legend">
                    <div class="control-pair">
                        <svg width="24" height="24"><use href="#icon-play"/></svg> <span><strong>Start/Wznów:</strong> Uruchamia licznik czasu.</span>
                    </div>
                    <div class="control-pair">
                        <svg width="24" height="24"><use href="#icon-pause"/></svg> <span><strong>Pauza:</strong> Zatrzymuje czas.</span>
                    </div>
                    <div class="control-pair">
                        <svg width="24" height="24"><use href="#icon-skip"/></svg> <span><strong>Pomiń:</strong> Przechodzi do kolejnego ćwiczenia bez zaliczenia.</span>
                    </div>
                    <div class="control-pair">
                        <svg width="24" height="24"><use href="#icon-info"/></svg> <span><strong>Obróć kartę:</strong> Przełącza widok między animacją a opisem.</span>
                    </div>
                </div>
            </div>

            <button id="help-back-btn" class="action-btn help-back-btn">Wróć do Panelu Głównego</button>
        </div>
    `;

    screen.innerHTML = html;

    screen.querySelector('#help-back-btn').addEventListener('click', () => {
        navigateTo('main');
    });

    navigateTo('help');
};