import { state } from './state.js';

export const loadVoices = () => {
    if (!state.tts.isSupported) return;
    const voices = state.tts.synth.getVoices();
    state.tts.polishVoice = voices.find(voice => voice.lang === 'pl-PL') || voices.find(voice => voice.lang.startsWith('pl'));
};

export const speak = (text, interrupt = true, onEndCallback = null) => {
    if (!state.tts.isSupported || !text || !state.tts.isSoundOn) {
        if (onEndCallback) onEndCallback();
        return;
    }
    if (interrupt && state.tts.synth.speaking) {
        state.tts.synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    if (state.tts.polishVoice) {
        utterance.voice = state.tts.polishVoice;
    }
    utterance.lang = 'pl-PL';
    if (onEndCallback) {
        utterance.onend = onEndCallback;
    }
    state.tts.synth.speak(utterance);
};