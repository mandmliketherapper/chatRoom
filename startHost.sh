#!/bin/bash

set -e

# --- Requirements ---
if ! command -v cloudflared &> /dev/null; then
  echo "Error: cloudflared not installed or not in PATH."
  exit 1
fi
if ! command -v node &> /dev/null; then
  echo "Error: Node.js not installed or not in PATH."
  exit 1
fi

# --- Start signaling server ---
if [ -f "server.js" ]; then
  echo "Starting signaling server..."
  node server.js > server.log 2>&1 &
  SERVER_PID=$!
  echo "Server PID: $SERVER_PID"
  sleep 2
fi

# --- Start Cloudflared tunnel ---
echo "Starting Cloudflared tunnel..."
cloudflared tunnel --url http://localhost:8080 > cloudflared.log 2>&1 & CLOUDFLARED_PID=$!

echo "Waiting for Cloudflared tunnel to initialize (this may take a few seconds)..."
TUNNEL_URL=""

for i in {1..30}; do
  if ! ps -p $CLOUDFLARED_PID > /dev/null; then
    echo "Cloudflared process exited unexpectedly. Check cloudflared.log for errors."
    break
  fi

  LINE=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' cloudflared.log | tail -n 1)
  if [[ -n "$LINE" ]]; then
    TUNNEL_URL="$LINE"
    break
  fi

  echo "Waiting for tunnel URL... ($i/30)"
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "Failed to detect tunnel URL after 30s. Check cloudflared.log for details."
  kill $CLOUDFLARED_PID 2>/dev/null || true
  [ ! -z "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

echo "Tunnel URL detected: $TUNNEL_URL"

if [ -z "$TUNNEL_URL" ]; then
  echo "Failed to detect real Cloudflared tunnel URL. Check cloudflared.log."
  kill $CLOUDFLARED_PID
  [ ! -z "$SERVER_PID" ] && kill $SERVER_PID
  exit 1
fi

echo "Tunnel created: $TUNNEL_URL"

# --- Prompt for info ---
read -p "Enter your username: " USERNAME
read -p "Enter a room name: " ROOM

# --- Start peer as host ---
echo "Starting peer.js as host..."
node peer.js "$TUNNEL_URL" "$USERNAME" "$ROOM"

# --- Cleanup ---
echo "Shutting down background processes..."
kill $CLOUDFLARED_PID || true
[ ! -z "$SERVER_PID" ] && kill $SERVER_PID || true

