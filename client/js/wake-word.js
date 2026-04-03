/**
 * Wake word detection using Picovoice Porcupine Web SDK.
 *
 * Porcupine runs entirely in the browser via WASM. It processes
 * audio frames locally — no server round-trip for wake word detection.
 *
 * Expects 512-sample Float32 frames at 16kHz (matching AudioCapture output).
 */

export class WakeWordDetector {
    constructor() {
        this.porcupine = null;
        this.onWakeWord = null; // callback()
        this._muted = false;
        this._initialized = false;
    }

    /**
     * Initialize Porcupine with the "Jarvis" built-in keyword.
     * @param {string} accessKey - Picovoice access key from /config/porcupine
     */
    async init(accessKey) {
        if (!accessKey) {
            console.warn('[WakeWord] No access key — wake word disabled. Use J key instead.');
            return;
        }

        // Porcupine Web SDK loaded via CDN in index.html
        const Porcupine = window.Porcupine;
        if (!Porcupine) {
            console.error('[WakeWord] Porcupine SDK not loaded. Add CDN script to index.html.');
            return;
        }

        try {
            this.porcupine = await Porcupine.create(
                accessKey,
                [{ builtin: 'Jarvis', sensitivity: 0.5 }]
            );
            this._initialized = true;
            console.log(`[WakeWord] Initialized. Frame length: ${this.porcupine.frameLength}, sample rate: ${this.porcupine.sampleRate}`);
        } catch (err) {
            console.error('[WakeWord] Failed to initialize Porcupine:', err);
            // Common errors: invalid access key, unsupported browser
        }
    }

    /**
     * Process an audio frame. Call this from AudioCapture.onRawFrame.
     * @param {Float32Array} float32Frame - 512 samples at 16kHz
     */
    processFrame(float32Frame) {
        if (!this._initialized || this._muted || !this.porcupine) return;

        // Porcupine expects Int16 samples
        const int16Frame = new Int16Array(float32Frame.length);
        for (let i = 0; i < float32Frame.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Frame[i]));
            int16Frame[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const keywordIndex = this.porcupine.process(int16Frame);
        if (keywordIndex >= 0) {
            console.log('[WakeWord] "Jarvis" detected!');
            this.onWakeWord?.();
        }
    }

    /**
     * Mute detection. MUST be called when avatar is speaking
     * to prevent echo from triggering the wake word.
     */
    mute() {
        this._muted = true;
    }

    /**
     * Resume detection after speaking is done.
     */
    unmute() {
        this._muted = false;
    }

    get initialized() {
        return this._initialized;
    }

    destroy() {
        this.porcupine?.delete();
        this.porcupine = null;
        this._initialized = false;
    }
}
