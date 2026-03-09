import { state } from '../state.js';
import dataStore from '../dataStore.js';

function setDifficultyIndicator(difficultyIndicator, type) {
    if (!difficultyIndicator) return;

    if (type === 'easy') {
        difficultyIndicator.textContent = '⬆️ Łatwe';
        difficultyIndicator.style.background = '#ecfdf5';
        difficultyIndicator.style.color = '#166534';
        difficultyIndicator.style.borderColor = '#10b981';
        return;
    }

    if (type === 'hard') {
        difficultyIndicator.textContent = '⬇️ Trudne';
        difficultyIndicator.style.background = '#fef2f2';
        difficultyIndicator.style.color = '#991b1b';
        difficultyIndicator.style.borderColor = '#ef4444';
        return;
    }

    difficultyIndicator.textContent = '👌 OK';
    difficultyIndicator.style.background = '#f8fafc';
    difficultyIndicator.style.color = '#64748b';
    difficultyIndicator.style.borderColor = '#e2e8f0';
}

function resolveSessionId({ root, triggerEl, fallbackSessionId }) {
    const row = triggerEl.closest('.rating-card');
    const rowSessionId = row?.dataset.sessionId;
    if (rowSessionId) return rowSessionId;

    const sessionCard = triggerEl.closest('.workout-context-card') || root?.closest('.workout-context-card');
    const deleteBtn = sessionCard ? sessionCard.querySelector('.delete-session-btn') : null;
    return deleteBtn?.dataset.sessionId || fallbackSessionId || null;
}

export async function handleHistoryInteractions(event, {
    root,
    fallbackSessionId = null,
    openDetailAssessmentModal
} = {}) {
    const ampsBadge = event.target.closest('.amps-inline-badge');
    if (ampsBadge) {
        event.stopPropagation();

        const row = ampsBadge.closest('.rating-card');
        const exerciseId = row?.dataset.id || null;
        const ratingNameEl = row?.querySelector('.rating-name');
        const exerciseName = ratingNameEl ? ratingNameEl.innerText : 'Ćwiczenie';
        const sessionId = resolveSessionId({ root, triggerEl: ampsBadge, fallbackSessionId });

        if (sessionId && exerciseId && openDetailAssessmentModal) {
            openDetailAssessmentModal(exerciseName, async (newTech, newRir) => {
                const icon = (newRir === 0) ? '👎' : ((newRir >= 3) ? '👍' : '👌');
                const originalContent = ampsBadge.innerHTML;
                ampsBadge.innerHTML = '<span class="pulsate-slow">⏳ Zapisuję...</span>';

                try {
                    const res = await dataStore.updateExerciseLog(sessionId, exerciseId, newTech, newRir);
                    if (!res) throw new Error('Brak odpowiedzi');

                    ampsBadge.innerHTML = `${icon} T:${newTech} RIR:${newRir}`;
                    ampsBadge.style.backgroundColor = '#dcfce7';
                    setTimeout(() => { ampsBadge.style.backgroundColor = ''; }, 1000);
                } catch (err) {
                    console.error('AMPS Update Failed:', err);
                    alert('Nie udało się zapisać oceny.');
                    ampsBadge.innerHTML = originalContent;
                }
            });
        }

        return true;
    }

    const deviationBtn = event.target.closest('.deviation-btn-hist');
    if (deviationBtn) {
        event.stopPropagation();

        const type = deviationBtn.dataset.type;
        const isActive = deviationBtn.classList.contains('active');
        const card = deviationBtn.closest('.rating-card');
        if (!card) return true;

        const exerciseId = card.dataset.id;
        const sessionId = card.dataset.sessionId || resolveSessionId({ root, triggerEl: deviationBtn, fallbackSessionId });
        const deviationGroup = card.querySelector('.difficulty-deviation-group');
        const difficultyIndicator = card.querySelector('.difficulty-indicator');

        deviationGroup?.querySelectorAll('.deviation-btn-hist').forEach(btn => btn.classList.remove('active'));

        if (!isActive) {
            deviationBtn.classList.add('active');
            setDifficultyIndicator(difficultyIndicator, type);

            if (sessionId) {
                let newRir;
                let newRating;
                if (type === 'easy') { newRir = 4; newRating = 'good'; }
                else if (type === 'hard') { newRir = 0; newRating = 'hard'; }

                dataStore.updateExerciseLog(sessionId, exerciseId, undefined, newRir, type, newRating)
                    .then(res => { if (!res) console.warn('Deviation update might have failed'); })
                    .catch(err => console.error('Deviation update failed:', err));
            }
        } else {
            setDifficultyIndicator(difficultyIndicator, 'ok');

            if (sessionId) {
                dataStore.updateExerciseLog(sessionId, exerciseId, undefined, 2, null, 'ok')
                    .catch(err => console.error('Deviation reset failed:', err));
            }
        }

        return true;
    }

    const rateBtn = event.target.closest('.rate-btn-hist');
    if (rateBtn) {
        event.stopPropagation();

        const exerciseId = rateBtn.dataset.id;
        const action = rateBtn.dataset.action;
        const isAffinity = rateBtn.classList.contains('affinity-btn');
        if (!isAffinity || !root) return true;

        const allRowsForExercise = root.querySelectorAll(`.rating-card[data-id="${exerciseId}"]`);
        const SCORE_LIKE = 15;
        const SCORE_DISLIKE = 30;
        const isTurningOff = rateBtn.classList.contains('active');
        const currentRow = rateBtn.closest('.rating-card');
        const siblingBtn = action === 'like'
            ? currentRow?.querySelector('[data-action="dislike"]')
            : currentRow?.querySelector('[data-action="like"]');
        const isSwitching = siblingBtn && siblingBtn.classList.contains('active');
        let delta = 0;

        if (action === 'like') {
            if (isTurningOff) delta = -SCORE_LIKE;
            else {
                delta = SCORE_LIKE;
                if (isSwitching) delta += SCORE_DISLIKE;
            }
        } else if (action === 'dislike') {
            if (isTurningOff) delta = SCORE_DISLIKE;
            else {
                delta = -SCORE_DISLIKE;
                if (isSwitching) delta -= SCORE_LIKE;
            }
        }

        const currentScore = state.userPreferences[exerciseId]?.score || 0;
        const newScore = Math.max(-100, Math.min(100, currentScore + delta));

        if (!state.userPreferences[exerciseId]) state.userPreferences[exerciseId] = {};
        state.userPreferences[exerciseId].score = newScore;

        allRowsForExercise.forEach(row => {
            const likeBtn = row.querySelector('[data-action="like"]');
            const dislikeBtn = row.querySelector('[data-action="dislike"]');
            likeBtn?.classList.remove('active');
            dislikeBtn?.classList.remove('active');

            if (!isTurningOff) {
                if (action === 'like') likeBtn?.classList.add('active');
                if (action === 'dislike') dislikeBtn?.classList.add('active');
            }

            const scoreSpan = row.querySelector('.dynamic-score-val');
            const scoreText = newScore > 0 ? `+${newScore}` : `${newScore}`;
            const scoreColor = newScore > 0 ? '#10b981' : (newScore < 0 ? '#ef4444' : '#6b7280');

            if (scoreSpan) {
                scoreSpan.textContent = newScore !== 0 ? `[${scoreText}]` : '';
                scoreSpan.style.color = scoreColor;
            }
        });

        try {
            await dataStore.updatePreference(exerciseId, 'set', newScore);
        } catch (err) {
            console.error('Błąd zapisu punktów:', err);
        }

        return true;
    }

    return false;
}
