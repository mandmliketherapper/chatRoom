#!/bin/bash

if [ ! -f package.json ]; then
    echo "Initializing npm project..."
    npm init -y
fi

echo "Installing Node dependencies..."
npm install ws node-pre-gyp wrtc uuid cloudflared

echo "All dependencies installed!"

