/**
 * Avatar controller — TalkingHead.js 3D avatar with lip sync.
 *
 * Uses TalkingHead's speakAudio() method: we fetch audio + word timing
 * from our server's /api/tts endpoint, then feed both to TalkingHead
 * for synchronized lip animation.
 *
 * Falls back to browser SpeechSynthesis when no avatar model is loaded.
 */

const TTS_ENDPOINT = 'http://localhost:8000/api/tts';

let TalkingHead = null;

// Try to import TalkingHead (loaded via import map in index.html)
try {
    const module = await import('talkinghead');
    TalkingHead = module.TalkingHead;
} catch (err) {
    console.warn('[Avatar] TalkingHead module not available:', err.message);
}

export class AvatarController {
    constructor() {
        this.head = null;
        this.container = null;
        this._initialized = false;
        this._speaking = false;
        this._currentUtterance = null;
    }

    /**
     * Initialize the avatar.
     * @param {HTMLElement} container - DOM element to render avatar in
     */
    async init(container) {
        this.container = container;

        if (!TalkingHead) {
            console.log('[Avatar] Using browser SpeechSynthesis fallback');
            return;
        }

        try {
            // Hide the placeholder text
            const placeholder = container.querySelector('#avatar-placeholder');

            // Create TalkingHead instance
            this.head = new TalkingHead(container, {
                cameraView: 'upper',
                cameraRotateEnable: true,
                cameraPanEnable: false,
                cameraZoomEnable: false,
            });

            // Try to load avatar model
            const avatarUrl = 'assets/avatar/jarvis.glb';
            const avatarExists = await fetch(avatarUrl, { method: 'HEAD' })
                .then(r => r.ok).catch(() => false);

            if (avatarExists) {
                await this.head.showAvatar({
                    url: avatarUrl,
                    body: 'M',
                    avatarMood: 'neutral',
                    lipsyncLang: 'en',
                });
                if (placeholder) placeholder.style.display = 'none';
                this._initialized = true;
                console.log('[Avatar] TalkingHead loaded with avatar model');
            } else {
                console.warn('[Avatar] No avatar model at assets/avatar/jarvis.glb');
                console.log('[Avatar] Create one at https://avaturn.me and export as GLB');
                console.log('[Avatar] Using TTS audio playback without 3D avatar');
            }
        } catch (err) {
            console.error('[Avatar] TalkingHead init failed:', err);
        }
    }

    /**
     * Speak text with lip sync.
     * Fetches audio + word timing from server, feeds to TalkingHead.
     * @param {string} text
     * @returns {Promise} resolves when speech completes
     */
    async speak(text) {
        this._speaking = true;

        try {
            // Fetch TTS audio + timing from server
            const resp = await fetch(TTS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            const data = await resp.json();

            if (data.stub || !data.audio_base64) {
                // No real TTS available — use browser fallback
                return this._speakWithBrowserTTS(text);
            }

            // Decode base64 audio to ArrayBuffer
            const binaryStr = atob(data.audio_base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }

            if (this.head && this._initialized) {
                return this._speakWithTalkingHead(bytes.buffer, data.timepoints, text);
            }

            // TalkingHead not ready — play audio directly
            return this._playAudioBlob(bytes, data.content_type);
        } catch (err) {
            console.error('[Avatar] Speak error:', err);
            return this._speakWithBrowserTTS(text);
        } finally {
            this._speaking = false;
        }
    }

    async _speakWithTalkingHead(audioArrayBuffer, timepoints, text) {
        // Decode MP3 to AudioBuffer for TalkingHead
        const audioCtx = new AudioContext();
        const audioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer);
        await audioCtx.close();

        // Build word timing arrays from server timepoints
        // Timepoints are {mark: "w0", time: 0.015} for each word
        const words = text.split(/\s+/);
        const wtimes = [];
        const wdurations = [];

        for (let i = 0; i < words.length; i++) {
            const tp = timepoints.find(t => t.mark === `w${i}`);
            const nextTp = timepoints.find(t => t.mark === `w${i + 1}`);

            if (tp) {
                wtimes.push(Math.round(tp.time * 1000)); // seconds to ms
                const duration = nextTp
                    ? Math.round((nextTp.time - tp.time) * 1000)
                    : 300; // default duration for last word
                wdurations.push(duration);
            }
        }

        // Feed audio + word timing to TalkingHead
        await this.head.speakAudio({
            audio: audioBuffer,
            words: words.slice(0, wtimes.length),
            wtimes,
            wdurations,
        });
    }

    async _playAudioBlob(bytes, contentType) {
        const blob = new Blob([bytes], { type: contentType });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        return new Promise((resolve) => {
            audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
            audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            audio.play();
        });
    }

    _speakWithBrowserTTS(text) {
        return new Promise((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-GB';
            utterance.rate = 1.0;
            utterance.pitch = 0.9;
            this._currentUtterance = utterance;
            utterance.onend = () => { this._currentUtterance = null; resolve(); };
            utterance.onerror = () => { this._currentUtterance = null; resolve(); };
            speechSynthesis.speak(utterance);
        });
    }

    setState(state) {
        if (!this.head || !this._initialized) return;
        try {
            switch (state) {
                case 'listening':
                    this.head.setMood('happy');
                    break;
                case 'processing':
                    this.head.setMood('thinking');
                    break;
                case 'idle':
                    this.head.setMood('neutral');
                    break;
            }
        } catch (e) { /* mood methods may not exist in all versions */ }
    }

    stopSpeaking() {
        this._speaking = false;
        try { this.head?.stopSpeaking?.(); } catch (e) { /* ignore */ }
        speechSynthesis.cancel();
        this._currentUtterance = null;
    }

    get isSpeaking() {
        return this._speaking;
    }
}
