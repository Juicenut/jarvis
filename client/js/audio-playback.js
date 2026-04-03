/**
 * Audio playback queue for sequential sentence playback.
 *
 * When TalkingHead.js handles playback natively (via Google TTS integration),
 * this module manages the sentence queue — ensuring sentences play in order
 * and signaling when all playback is complete.
 */

export class AudioPlayback {
    constructor() {
        this.queue = [];
        this.playing = false;
        this.onAllComplete = null; // callback() when queue is drained
        this._cancelled = false;
    }

    /**
     * Add a sentence to the playback queue.
     * @param {string} text - Sentence to speak
     * @param {Function} speakFn - async function(text) that plays audio (e.g. avatar.speak)
     */
    enqueue(text, speakFn) {
        this.queue.push({ text, speakFn });
        if (!this.playing) {
            this._processQueue();
        }
    }

    async _processQueue() {
        this.playing = true;
        this._cancelled = false;

        while (this.queue.length > 0 && !this._cancelled) {
            const { text, speakFn } = this.queue.shift();
            try {
                await speakFn(text);
            } catch (err) {
                console.error('[Playback] Error speaking:', err);
            }
        }

        this.playing = false;
        if (!this._cancelled) {
            this.onAllComplete?.();
        }
    }

    /**
     * Cancel all queued and current playback.
     */
    cancel() {
        this._cancelled = true;
        this.queue = [];
        this.playing = false;
    }

    get isPlaying() {
        return this.playing;
    }
}
