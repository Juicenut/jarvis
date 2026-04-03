/**
 * Avatar controller — wraps TalkingHead.js for 3D avatar with lip sync.
 *
 * Falls back to browser SpeechSynthesis when TalkingHead isn't loaded
 * or no avatar model is available. This lets the full pipeline work
 * end-to-end even without the 3D avatar.
 */

const TTS_ENDPOINT = 'http://localhost:8000/api/tts';

export class AvatarController {
    constructor() {
        this.talkingHead = null;
        this.container = null;
        this._initialized = false;
        this._useFallback = false;
        this._speaking = false;
        this._currentUtterance = null;
    }

    /**
     * Initialize the avatar.
     * @param {HTMLElement} container - DOM element to render avatar in
     */
    async init(container) {
        this.container = container;

        // Check if TalkingHead is loaded (from CDN script tag)
        if (window.TalkingHead) {
            try {
                await this._initTalkingHead(container);
                return;
            } catch (err) {
                console.warn('[Avatar] TalkingHead init failed, using fallback:', err);
            }
        }

        // Fallback: use browser speech synthesis
        this._useFallback = true;
        console.log('[Avatar] Using browser SpeechSynthesis fallback (no TalkingHead/avatar)');
    }

    async _initTalkingHead(container) {
        // TalkingHead.js initialization
        // This will be refined once we have a GLB model and test the actual library
        this.talkingHead = new window.TalkingHead(container, {
            ttsEndpoint: TTS_ENDPOINT,
            cameraView: 'head',
            cameraRotateEnable: false,
        });

        // Load avatar model — placeholder path, will need a real GLB
        // TalkingHead requires a model with ARKit blend shapes + Oculus visemes
        // await this.talkingHead.showAvatar('/assets/avatar/jarvis.glb');

        this._initialized = true;
        console.log('[Avatar] TalkingHead initialized');
    }

    /**
     * Speak text with lip sync (or fallback to browser TTS).
     * Returns a promise that resolves when speech is complete.
     * @param {string} text
     */
    async speak(text) {
        this._speaking = true;

        if (this.talkingHead && this._initialized) {
            return this._speakWithTalkingHead(text);
        }

        return this._speakWithFallback(text);
    }

    async _speakWithTalkingHead(text) {
        try {
            // TalkingHead's speakText method handles TTS + lip sync
            await this.talkingHead.speakText(text);
        } catch (err) {
            console.error('[Avatar] TalkingHead speak error:', err);
            // Fall back to browser TTS for this sentence
            await this._speakWithFallback(text);
        } finally {
            this._speaking = false;
        }
    }

    async _speakWithFallback(text) {
        // First try server TTS for actual audio quality
        try {
            const resp = await fetch(TTS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            const data = await resp.json();

            if (data.audio_base64 && !data.stub) {
                await this._playBase64Audio(data.audio_base64, data.content_type);
                this._speaking = false;
                return;
            }
        } catch (err) {
            console.warn('[Avatar] Server TTS failed, using browser synthesis:', err);
        }

        // Final fallback: browser SpeechSynthesis
        return new Promise((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-GB';
            utterance.rate = 1.0;
            utterance.pitch = 0.9; // Slightly deeper for Jarvis
            this._currentUtterance = utterance;

            utterance.onend = () => {
                this._speaking = false;
                this._currentUtterance = null;
                resolve();
            };
            utterance.onerror = () => {
                this._speaking = false;
                this._currentUtterance = null;
                resolve();
            };

            speechSynthesis.speak(utterance);
        });
    }

    /**
     * Play base64-encoded audio through Web Audio API.
     */
    async _playBase64Audio(base64Data, contentType) {
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: contentType });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        return new Promise((resolve) => {
            audio.onended = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            audio.onerror = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            audio.play();
        });
    }

    /**
     * Set avatar visual state.
     */
    setState(state) {
        if (!this.talkingHead) return;

        // TalkingHead emotion/animation control
        // Will be refined once we test the actual library
        switch (state) {
            case 'idle':
                // Subtle idle animations (handled by TalkingHead default)
                break;
            case 'listening':
                // Could set an attentive expression
                break;
            case 'processing':
                // Could set a thinking expression
                break;
            case 'speaking':
                // Handled by speak() method
                break;
        }
    }

    /**
     * Stop current speech immediately.
     */
    stopSpeaking() {
        this._speaking = false;

        if (this.talkingHead) {
            try {
                this.talkingHead.stopSpeaking?.();
            } catch (e) { /* ignore */ }
        }

        // Cancel browser speech synthesis
        speechSynthesis.cancel();
        this._currentUtterance = null;
    }

    get isSpeaking() {
        return this._speaking;
    }
}
