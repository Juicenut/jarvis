/**
 * AudioWorklet processor for capturing raw PCM audio frames.
 * Runs in a separate thread — communicates via port.postMessage.
 *
 * Collects samples into fixed-size frames (default 512) and posts
 * Float32Array buffers to the main thread.
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.frameSize = options.processorOptions?.frameSize || 512;
        this.buffer = new Float32Array(this.frameSize);
        this.bufferIndex = 0;
        this.muted = false;

        this.port.onmessage = (e) => {
            if (e.data.type === 'mute') this.muted = true;
            if (e.data.type === 'unmute') this.muted = false;
        };
    }

    process(inputs) {
        const input = inputs[0]?.[0]; // First input, first channel (mono)
        if (!input || this.muted) return true;

        let offset = 0;
        while (offset < input.length) {
            const remaining = this.frameSize - this.bufferIndex;
            const toCopy = Math.min(remaining, input.length - offset);
            this.buffer.set(input.subarray(offset, offset + toCopy), this.bufferIndex);
            this.bufferIndex += toCopy;
            offset += toCopy;

            if (this.bufferIndex === this.frameSize) {
                // Post a copy of the buffer
                this.port.postMessage({ type: 'frame', data: this.buffer.slice() });
                this.bufferIndex = 0;
            }
        }

        return true; // Keep processor alive
    }
}

registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
