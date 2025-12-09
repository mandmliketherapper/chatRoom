import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

// rooms = { roomName: { hostId, clients: { id: ws } } }
const rooms = {};

wss.on('connection', ws => {
  console.log('New peer connected');

  ws.on('message', msg => {
    let data;

    try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'register') {
      const { id, room } = data;

      // Create room if first peer
      if (!rooms[room]) rooms[room] = { hostId: id, clients: {} };
      const roomObj = rooms[room];

      // Add client to room
      roomObj.clients[id] = ws;

      // Inform client who host is
      ws.send(JSON.stringify({ type: 'info', host: roomObj.hostId }));

      // If not the host, notify host that a new client joined
      if (id !== roomObj.hostId) {
        const hostWs = roomObj.clients[roomObj.hostId];
        if (hostWs && hostWs.readyState === WebSocket.OPEN) {
          hostWs.send(JSON.stringify({
            type: 'new_client',
            clientId: id
          }));
        }
      }
    }

    else if (data.type === 'signal') {
      const roomObj = rooms[data.room];
      if (!roomObj) return;

      // Determine target WebSocket
      let targetWs = null;

      if (data.target) {
        // Send to specific peer
        targetWs = roomObj.clients[data.target];
      } else {
        // No target? default to host
        targetWs = roomObj.clients[roomObj.hostId];
      }
      console.log("signal message sent");
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        console.log(`Routing signal from ${data.from} to ${data.target || 'host'}:`, data.signal.type);
        targetWs.send(JSON.stringify(data));
      } else {
        console.warn(`Cannot route signal from ${data.from} to ${data.target || 'host'} - websocket not open`);
      }
    }


    else if (data.type === 'chat') {
      const roomObj = rooms[data.room];
      if (!roomObj) return;

      // Host forwards to all other clients
      if (data.from === roomObj.hostId) {
        Object.entries(roomObj.clients).forEach(([peerId, clientWs]) => {
          if (peerId !== data.from && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'chat', from: data.from, message: data.message }));
          }
        });
      } else {
        // Client sends to host only
        const hostWs = roomObj.clients[roomObj.hostId];
        if (hostWs && hostWs.readyState === WebSocket.OPEN) {
          hostWs.send(JSON.stringify({ type: 'chat', from: data.from, message: data.message }));
        }
      }
    }
  });

  ws.on('close', () => {
    // Remove client from rooms
    for (const roomObj of Object.values(rooms)) {
      for (const [id, client] of Object.entries(roomObj.clients)) {
        if (client === ws) delete roomObj.clients[id];

        // If host disconnected, pick a new host (optional)
        if (id === roomObj.hostId && Object.keys(roomObj.clients).length > 0) {
          const newHostId = Object.keys(roomObj.clients)[0];
          roomObj.hostId = newHostId;
          console.log(`Host disconnected, new host is ${newHostId}`);
          // Notify remaining clients
          Object.entries(roomObj.clients).forEach(([peerId, clientWs]) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'info', host: roomObj.hostId }));
            }
          });
        }
      }
    }
  });
});

console.log("Signaling/hub server running on ws://localhost:8080");
