/**
 * UI state management — status indicator, transcript display, error notifications.
 */

export class UIController {
    constructor() {
        this.statusDot = document.getElementById('status-dot');
        this.statusLabel = document.getElementById('status-label');
        this.transcriptEl = document.getElementById('transcript');
        this.responseEl = document.getElementById('response');
    }

    setState(state) {
        this.statusDot.className = state;
        const labels = {
            idle: 'Say "Jarvis" to begin',
            listening: 'Listening...',
            processing: 'Thinking...',
            speaking: 'Speaking...',
        };
        this.statusLabel.textContent = labels[state] || state;
    }

    showTranscript(text, isFinal) {
        this.transcriptEl.textContent = text;
        this.transcriptEl.style.opacity = isFinal ? '1' : '0.6';
    }

    showResponse(text) {
        this.responseEl.textContent = text;
    }

    clearDisplay() {
        this.transcriptEl.textContent = '';
        this.responseEl.textContent = '';
    }

    showError(message) {
        this.statusDot.className = 'error';
        this.statusLabel.textContent = message;
    }
}
