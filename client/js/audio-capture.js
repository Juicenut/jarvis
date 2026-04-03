/**
 * Microphone audio capture module.
 *
 * Captures mic input, resamples to 16kHz mono, emits fixed-size
 * Int16 PCM frames via callback. Uses AudioWorklet for low-latency
 * processing in a separate thread.
 */

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SIZE = 512; // Matches Porcupine's expected frame size

export class AudioCapture {
    constructor() {
        this.audioContext = null;
        this.stream = null;
        this.workletNode = null;
        this.onAudioFrame = null; // callback(int16Array)
        this.onRawFrame = null;   // callback(float32Array) — for wake word
        this._started = false;
    }

    async start() {
        if (this._started) return;

        // Request mic
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: TARGET_SAMPLE_RATE,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        // Create audio context at target sample rate
        // Browser may not honor this exactly — we request it as a hint
        this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });

        // If browser gave us a different sample rate, log it
        if (this.audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
            console.warn(
                `[Audio] Requested ${TARGET_SAMPLE_RATE}Hz, got ${this.audioContext.sampleRate}Hz. ` +
                `Resampling may affect quality.`
            );
        }

        // Load worklet
        await this.audioContext.audioWorklet.addModule('js/audio-worklet-processor.js');

        // Create worklet node
        this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor', {
            processorOptions: { frameSize: FRAME_SIZE },
        });

        // Handle frames from worklet
        this.workletNode.port.onmessage = (e) => {
            if (e.data.type === 'frame') {
                const float32 = e.data.data;

                // Pass raw float32 to wake word detector
                this.onRawFrame?.(float32);

                // Convert to Int16 for server transmission
                if (this.onAudioFrame) {
                    this.onAudioFrame(float32ToInt16(float32));
                }
            }
        };

        // Connect mic -> worklet
        const source = this.audioContext.createMediaStreamSource(this.stream);
        source.connect(this.workletNode);
        // Don't connect worklet to destination (no playback of mic input)

        this._started = true;
        console.log(`[Audio] Capture started: ${this.audioContext.sampleRate}Hz, frame=${FRAME_SIZE}`);
    }

    mute() {
        this.workletNode?.port.postMessage({ type: 'mute' });
    }

    unmute() {
        this.workletNode?.port.postMessage({ type: 'unmute' });
    }

    stop() {
        this.workletNode?.disconnect();
        this.stream?.getTracks().forEach(t => t.stop());
        this.audioContext?.close();
        this._started = false;
        console.log('[Audio] Capture stopped');
    }

    get sampleRate() {
        return this.audioContext?.sampleRate || TARGET_SAMPLE_RATE;
    }

    get started() {
        return this._started;
    }
}

/**
 * Convert Float32 PCM [-1.0, 1.0] to Int16 PCM [-32768, 32767].
 */
function float32ToInt16(float32) {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
}

/**
 * Encode Int16Array to base64 string for WebSocket transmission.
 */
export function int16ToBase64(int16Array) {
    const bytes = new Uint8Array(int16Array.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
