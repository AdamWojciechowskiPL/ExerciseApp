import { state, mergeSessionParams } from '../state.js';
import { focus, screens } from '../dom.js';
import { saveSessionBackup } from '../sessionRecovery.js';

let backupInterval = null;
let sessionClockInterval = null;

function getTrainingTitle() {
    if (state.todaysDynamicPlan && state.todaysDynamicPlan.type === 'protocol') {
        return state.todaysDynamicPlan.title;
    }

    const days = state.settings.dynamicPlanData?.days || [];
    const day = days.find((item) => item.dayNumber === state.currentTrainingDayId);
    return day ? day.title : 'Trening';
}

export function triggerSessionBackup() {
    saveSessionBackup({
        sessionStartTime: state.sessionStartTime ? state.sessionStartTime.toISOString() : null,
        totalPausedTime: state.totalPausedTime || 0,
        planId: state.settings.dynamicPlanData?.id || 'dynamic',
        planMode: 'dynamic',
        currentTrainingDayId: state.currentTrainingDayId,
        trainingTitle: getTrainingTitle(),
        todaysDynamicPlan: state.todaysDynamicPlan,
        flatExercises: state.flatExercises,
        currentExerciseIndex: state.currentExerciseIndex,
        sessionLog: state.sessionLog,
        stopwatchSeconds: state.stopwatch.seconds,
        timerTimeLeft: state.timer.timeLeft,
        timerInitialDuration: state.timer.initialDuration,
        sessionDetailPromptCount: state.sessionDetailPromptCount,
        sessionParams: state.sessionParams
    });
}

function updateSessionClockDisplay() {
    if (!focus.sessionElapsedTime) return;
    if (!state.sessionStartTime) {
        focus.sessionElapsedTime.textContent = '00:00';
        return;
    }

    if (state.isPaused) return;

    const now = Date.now();
    const durationMs = Math.max(0, now - state.sessionStartTime.getTime() - (state.totalPausedTime || 0));
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        const m = minutes % 60;
        focus.sessionElapsedTime.textContent = `${hours}:${m < 10 ? '0' : ''}${m}:${seconds < 10 ? '0' : ''}${seconds}`;
        return;
    }

    focus.sessionElapsedTime.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export function startSessionClock() {
    stopSessionClock();
    updateSessionClockDisplay();

    sessionClockInterval = setInterval(() => {
        if (!screens.training.classList.contains('active')) {
            stopSessionClock();
            return;
        }
        updateSessionClockDisplay();
    }, 1000);
}

export function stopSessionClock() {
    if (!sessionClockInterval) return;
    clearInterval(sessionClockInterval);
    sessionClockInterval = null;
}

export function startBackupInterval() {
    if (backupInterval) clearInterval(backupInterval);
    backupInterval = setInterval(() => {
        if (!state.isPaused) triggerSessionBackup();
    }, 2000);
}

export function stopBackupInterval() {
    if (!backupInterval) return;
    clearInterval(backupInterval);
    backupInterval = null;
}

export function hydrateStateFromBackup(backup, timeGapMs) {
    state.sessionStartTime = backup.sessionStartTime ? new Date(backup.sessionStartTime) : new Date();
    state.totalPausedTime = (backup.totalPausedTime || 0) + timeGapMs;
    state.isPaused = false;
    state.lastPauseStartTime = null;

    state.currentTrainingDayId = backup.currentTrainingDayId;
    state.todaysDynamicPlan = backup.todaysDynamicPlan;
    state.flatExercises = backup.flatExercises;
    state.sessionLog = backup.sessionLog || [];
    mergeSessionParams(backup.sessionParams || { initialPainLevel: 0, timeFactor: 1.0 });
    state.sessionDetailPromptCount = backup.sessionDetailPromptCount || 0;

    state.stopwatch.seconds = backup.stopwatchSeconds || 0;
    state.timer.timeLeft = backup.timerTimeLeft || 0;
    state.timer.initialDuration = backup.timerInitialDuration || 0;
}
