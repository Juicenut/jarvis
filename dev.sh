#!/bin/bash
# JARVIS development environment launcher
# Usage: ./dev.sh [start|stop|restart|status]

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$PROJECT_DIR/server"
CLIENT_DIR="$PROJECT_DIR/client"
SERVER_PORT=8000
CLIENT_PORT=3001
SERVER_PID_FILE="$PROJECT_DIR/.server.pid"
CLIENT_PID_FILE="$PROJECT_DIR/.client.pid"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[JARVIS]${NC} $1"; }
ok()  { echo -e "${GREEN}  ✓${NC} $1"; }
err() { echo -e "${RED}  ✗${NC} $1"; }
warn(){ echo -e "${YELLOW}  !${NC} $1"; }

stop_services() {
    log "Stopping services..."

    if [ -f "$SERVER_PID_FILE" ]; then
        pid=$(cat "$SERVER_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            ok "Server stopped (PID $pid)"
        fi
        rm -f "$SERVER_PID_FILE"
    fi

    if [ -f "$CLIENT_PID_FILE" ]; then
        pid=$(cat "$CLIENT_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            ok "Client stopped (PID $pid)"
        fi
        rm -f "$CLIENT_PID_FILE"
    fi

    # Also kill any orphaned processes on our ports
    lsof -ti:$SERVER_PORT | xargs kill 2>/dev/null || true
    lsof -ti:$CLIENT_PORT | xargs kill 2>/dev/null || true

    # Wait for ports to release
    for i in $(seq 1 10); do
        if ! lsof -ti:$SERVER_PORT >/dev/null 2>&1 && ! lsof -ti:$CLIENT_PORT >/dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done
}

start_services() {
    log "Starting JARVIS dev environment..."
    echo ""

    # Check venv exists
    if [ ! -d "$SERVER_DIR/venv" ]; then
        log "Creating Python venv..."
        python3 -m venv "$SERVER_DIR/venv"
        "$SERVER_DIR/venv/bin/pip" install -r "$SERVER_DIR/requirements.txt" --quiet
        ok "Venv created and dependencies installed"
    fi

    # Check .env exists
    if [ ! -f "$SERVER_DIR/.env" ]; then
        err "No .env file found! Copy .env.example and fill in your API keys:"
        echo "  cp $SERVER_DIR/.env.example $SERVER_DIR/.env"
        exit 1
    fi

    # Validate API keys
    log "Checking API keys..."
    source "$SERVER_DIR/.env" 2>/dev/null || true

    [ -n "$ANTHROPIC_API_KEY" ] && ok "Anthropic API key" || warn "ANTHROPIC_API_KEY missing (stub will be used)"
    [ -n "$DEEPGRAM_API_KEY" ] && ok "Deepgram API key" || warn "DEEPGRAM_API_KEY missing (stub will be used)"
    [ -n "$PICOVOICE_ACCESS_KEY" ] && ok "Picovoice access key" || warn "PICOVOICE_ACCESS_KEY missing (use J key for wake)"
    if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
        [ -f "$SERVER_DIR/$GOOGLE_APPLICATION_CREDENTIALS" ] && ok "Google Cloud credentials" || err "Google credentials file not found: $GOOGLE_APPLICATION_CREDENTIALS"
    else
        warn "GOOGLE_APPLICATION_CREDENTIALS missing (browser TTS fallback)"
    fi
    echo ""

    # Start server
    log "Starting FastAPI server on port $SERVER_PORT..."
    cd "$SERVER_DIR"
    ./venv/bin/uvicorn main:app --reload --port $SERVER_PORT --log-level info > "$PROJECT_DIR/.server.log" 2>&1 &
    echo $! > "$SERVER_PID_FILE"
    ok "Server PID $(cat "$SERVER_PID_FILE")"

    # Start client file server
    log "Starting client on port $CLIENT_PORT..."
    cd "$CLIENT_DIR"
    python3 -m http.server $CLIENT_PORT > "$PROJECT_DIR/.client.log" 2>&1 &
    echo $! > "$CLIENT_PID_FILE"
    ok "Client PID $(cat "$CLIENT_PID_FILE")"

    # Wait for server to be ready
    echo ""
    log "Waiting for server..."
    for i in $(seq 1 10); do
        if curl -s http://localhost:$SERVER_PORT/health > /dev/null 2>&1; then
            ok "Server ready"
            break
        fi
        sleep 0.5
    done

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  JARVIS is running${NC}"
    echo -e "${GREEN}  Open: http://localhost:$CLIENT_PORT${NC}"
    echo -e "${GREEN}  API:  http://localhost:$SERVER_PORT/health${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Press J to activate (or say \"Jarvis\" with Picovoice key)"
    echo "  Press Escape to interrupt"
    echo ""
    echo "  Logs: tail -f .server.log"
    echo "  Stop: ./dev.sh stop"
}

show_status() {
    log "Service status:"
    if [ -f "$SERVER_PID_FILE" ] && kill -0 "$(cat "$SERVER_PID_FILE")" 2>/dev/null; then
        ok "Server running (PID $(cat "$SERVER_PID_FILE")) on port $SERVER_PORT"
    else
        err "Server not running"
    fi
    if [ -f "$CLIENT_PID_FILE" ] && kill -0 "$(cat "$CLIENT_PID_FILE")" 2>/dev/null; then
        ok "Client running (PID $(cat "$CLIENT_PID_FILE")) on port $CLIENT_PORT"
    else
        err "Client not running"
    fi
}

case "${1:-start}" in
    start)
        stop_services 2>/dev/null
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        start_services
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 [start|stop|restart|status]"
        exit 1
        ;;
esac
