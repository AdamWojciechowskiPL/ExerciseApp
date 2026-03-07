import { state } from '../state.js';
import { focus } from '../dom.js';

export function fitText(element) {
    if (!element) return;
    element.style.fontSize = '';
    requestAnimationFrame(() => {
        if (element.scrollWidth > element.offsetWidth) {
            const style = window.getComputedStyle(element);
            const currentSize = parseFloat(style.fontSize);
            const ratio = element.offsetWidth / element.scrollWidth;
            const newSize = Math.max(currentSize * ratio * 0.95, 12);
            element.style.fontSize = `${newSize}px`;
        }
    });
}

export function updateTrainingHeaderControls(index) {
    if (focus.ttsIcon) {
        const useEl = focus.ttsIcon.querySelector('use');
        if (useEl) {
            useEl.setAttribute('href', state.tts.isSoundOn ? '#icon-sound-on' : '#icon-sound-off');
        }
    }

    if (!focus.prevStepBtn) return;

    const isFirst = index === 0;
    focus.prevStepBtn.disabled = isFirst;
    focus.prevStepBtn.style.opacity = isFirst ? '0.3' : '1';
    focus.prevStepBtn.style.pointerEvents = isFirst ? 'none' : 'auto';
}

export function updatePauseButtonState() {
    if (state.isPaused) {
        state.lastPauseStartTime = Date.now();
        if (focus.pauseResumeBtn) {
            focus.pauseResumeBtn.innerHTML = '<svg><use href="#icon-play"/></svg>';
            focus.pauseResumeBtn.classList.add('paused-state');
            focus.pauseResumeBtn.classList.remove('hidden');
        }
        if (focus.timerDisplay) focus.timerDisplay.style.opacity = '0.5';
        return;
    }

    if (focus.pauseResumeBtn) {
        focus.pauseResumeBtn.innerHTML = '<svg><use href="#icon-pause"/></svg>';
        focus.pauseResumeBtn.classList.remove('paused-state');
        focus.pauseResumeBtn.classList.remove('hidden');
    }
    if (focus.timerDisplay) focus.timerDisplay.style.opacity = '1';
}

export function initProgressBar() {
    if (!focus.progressContainer) return;
    focus.progressContainer.innerHTML = '';

    state.flatExercises.forEach((exercise, realIndex) => {
        if (!exercise.isWork) return;

        const segment = document.createElement('div');
        segment.className = 'progress-segment';
        segment.dataset.realIndex = realIndex;

        const secName = (exercise.sectionName || '').toLowerCase();
        if (secName.includes('rozgrzewka') || secName.includes('warmup') || secName.includes('start')) {
            segment.classList.add('section-warmup');
        } else if (secName.includes('schłodzenie') || secName.includes('cooldown') || secName.includes('koniec')) {
            segment.classList.add('section-cooldown');
        } else {
            segment.classList.add('section-main');
        }

        focus.progressContainer.appendChild(segment);
    });
}

export function updateProgressBar() {
    if (!focus.progressContainer) return;

    const currentIndex = state.currentExerciseIndex;
    const currentExercise = state.flatExercises[currentIndex];
    const segments = focus.progressContainer.querySelectorAll('.progress-segment');

    segments.forEach((segment) => {
        const segmentRealIndex = parseInt(segment.dataset.realIndex, 10);
        segment.classList.remove('completed', 'active', 'rest-pulse', 'paused-active');

        if (segmentRealIndex < currentIndex) {
            segment.classList.add('completed');
            return;
        }

        if (segmentRealIndex === currentIndex) {
            segment.classList.add(state.isPaused ? 'paused-active' : 'active');
            return;
        }

        if (currentExercise && !currentExercise.isWork && segmentRealIndex > currentIndex && !state.isPaused) {
            let nextWorkIndex = -1;
            for (let i = currentIndex + 1; i < state.flatExercises.length; i++) {
                if (state.flatExercises[i].isWork) {
                    nextWorkIndex = i;
                    break;
                }
            }
            if (segmentRealIndex === nextWorkIndex) {
                segment.classList.add('rest-pulse');
            }
        }
    });
}
