/**
 * JARVIS — Main application entry point and state machine.
 *
 * State flow:
 *   IDLE → (wake word / J key) → LISTENING → (speech_final) →
 *   PROCESSING → (first speak msg) → SPEAKING → (all done) → IDLE
 *
 * Interrupt: SPEAKING → (user speaks) → LISTENING
 */
import { WebSocketClient } from './websocket.js';
import { AudioCapture, int16ToBase64 } from './audio-capture.js';
import { WakeWordDetector } from './wake-word.js';
import { AvatarController } from './avatar.js';
import { AudioPlayback } from './audio-playback.js';
import { UIController } from './ui.js';

// --- State ---
const State = {
    IDLE: 'idle',
    LISTENING: 'listening',
    PROCESSING: 'processing',
    SPEAKING: 'speaking',
};

let currentState = State.IDLE;
let wsClient = null;
let audioCapture = null;
let wakeWordDetector = null;
let avatar = null;
let playback = null;
let ui = null;
let streamingAudio = false;
let continuousListenTimeout = null; // Timer to return to IDLE after silence

// --- DOM refs ---
const btnConnect = document.getElementById('btn-connect');
const btnWake = document.getElementById('btn-wake');

// --- State management ---
function setState(newState) {
    const prevState = currentState;
    currentState = newState;
    ui?.setState(newState);
    avatar?.setState(newState);

    // State transition side effects
    switch (newState) {
        case State.LISTENING:
            streamingAudio = true;
            wakeWordDetector?.mute();
            break;

        case State.PROCESSING:
            streamingAudio = false;
            clearTimeout(continuousListenTimeout);
            break;

        case State.SPEAKING:
            streamingAudio = false;
            wakeWordDetector?.mute(); // Prevent echo triggering wake word
            break;

        case State.IDLE:
            streamingAudio = false;
            wakeWordDetector?.unmute();
            break;
    }

    console.log(`[State] ${prevState} → ${newState}`);
}

// --- WebSocket message handler ---
function handleMessage(msg) {
    switch (msg.type) {
        case 'state':
            // Ignore server's idle transition while we're still playing audio
            // The client manages SPEAKING → LISTENING/IDLE via playback.onAllComplete
            if (msg.state === 'idle' && (currentState === State.SPEAKING || playback?.isPlaying)) {
                console.log('[State] Ignoring server idle — still speaking');
                break;
            }
            if (msg.state !== currentState) {
                setState(msg.state);
            }
            break;

        case 'transcript':
            ui?.showTranscript(msg.text, msg.final);
            // User is speaking — cancel the idle timeout
            if (msg.text) {
                clearTimeout(continuousListenTimeout);
            }
            break;

        case 'response_text':
            if (!msg.done) {
                ui?.showResponse(msg.text);
            }
            break;

        case 'speak':
            // Queue sentence for TTS playback via avatar
            if (currentState !== State.SPEAKING) {
                setState(State.SPEAKING);
            }
            playback.enqueue(msg.text, (text) => avatar.speak(text));
            break;

        case 'error':
            console.error('[Server Error]', msg.message);
            ui?.showError(msg.message);
            playback?.cancel();
            avatar?.stopSpeaking();
            setTimeout(() => setState(State.IDLE), 3000);
            break;
    }
}

// --- Audio + wake word setup ---
async function initAudio() {
    audioCapture = new AudioCapture();
    await audioCapture.start();

    audioCapture.onAudioFrame = (int16) => {
        if (streamingAudio && wsClient?.connected) {
            wsClient.send({ type: 'audio', data: int16ToBase64(int16) });
        }
    };

    audioCapture.onRawFrame = (float32) => {
        wakeWordDetector?.processFrame(float32);
    };

    // Init wake word
    wakeWordDetector = new WakeWordDetector();
    wakeWordDetector.onWakeWord = () => triggerWake();

    try {
        const resp = await fetch('http://localhost:8000/config/porcupine');
        const { accessKey } = await resp.json();
        await wakeWordDetector.init(accessKey);
        if (wakeWordDetector.initialized) {
            console.log('[App] Wake word active — say "Jarvis"');
        }
    } catch (err) {
        console.warn('[App] Wake word setup failed, use J key:', err);
    }

    console.log('[App] Audio pipeline ready');
}

// --- Avatar + playback setup ---
async function initAvatar() {
    avatar = new AvatarController();
    const container = document.getElementById('avatar-container');
    await avatar.init(container);

    playback = new AudioPlayback();
    playback.onAllComplete = () => {
        // All sentences spoken — continue listening for follow-up
        if (currentState === State.SPEAKING) {
            wsClient?.send({ type: 'wake', timestamp: Date.now() });
            setState(State.LISTENING);
            streamingAudio = true;

            // If no speech detected within 5 seconds, return to idle
            clearTimeout(continuousListenTimeout);
            continuousListenTimeout = setTimeout(() => {
                if (currentState === State.LISTENING) {
                    console.log('[App] No follow-up detected, returning to idle');
                    streamingAudio = false;
                    wsClient?.send({ type: 'interrupt' });
                    setState(State.IDLE);
                }
            }, 5000);
        }
    };

    console.log('[App] Avatar ready');
}

// --- Connect ---
function connect() {
    wsClient = new WebSocketClient('ws://localhost:8000/ws');

    wsClient.onConnect = async () => {
        setState(State.IDLE);
        btnConnect.textContent = 'Connected';
        btnConnect.disabled = true;
        btnWake.disabled = false;

        // Init audio on first connect
        if (!audioCapture?.started) {
            try {
                await initAudio();
            } catch (err) {
                console.error('[App] Mic access denied:', err);
                ui?.showError('Mic access denied — check permissions');
            }
        }

        // Init avatar on first connect
        if (!avatar) {
            try {
                await initAvatar();
            } catch (err) {
                console.warn('[App] Avatar init failed:', err);
            }
        }
    };

    wsClient.onDisconnect = () => {
        ui?.showError('Disconnected — reconnecting...');
        btnConnect.disabled = false;
        btnWake.disabled = true;
    };

    wsClient.onMessage = handleMessage;
    wsClient.connect();
}

// --- Wake trigger ---
function triggerWake() {
    if (currentState !== State.IDLE) return;
    ui?.clearDisplay();
    streamingAudio = true;
    wsClient.send({ type: 'wake', timestamp: Date.now() });
}

// --- Interrupt (user speaks while avatar is talking) ---
function triggerInterrupt() {
    if (currentState !== State.SPEAKING) return;
    playback?.cancel();
    avatar?.stopSpeaking();
    wsClient?.send({ type: 'interrupt' });
    // Server will transition us to LISTENING
}

// --- Event listeners ---
btnConnect.addEventListener('click', connect);
btnWake.addEventListener('click', triggerWake);

// J key = wake, Escape = interrupt
document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) return;
    if (document.activeElement !== document.body) return;

    if (e.key === 'j') triggerWake();
    if (e.key === 'Escape') triggerInterrupt();
});

// --- Init ---
ui = new UIController();
ui.setState('idle');
connect();
