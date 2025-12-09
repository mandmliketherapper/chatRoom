import WebSocket from "ws";
import pkg from 'wrtc';
const { RTCPeerConnection } = pkg;

if (process.argv.length < 4) {
  console.error("Usage: node peerTestTest.js ws://<server> <myId> <room>");
  process.exit(1);
}

const serverUrl = process.argv[2];
const myId = process.argv[3];
const roomName = process.argv[4];

const ws = new WebSocket(serverUrl);

// Keep track of peers: { peerId: { pc, dc } }
const peers = {};

let hostId;
let amHost = false;

// --- WebSocket connection ---
ws.on("open", () => {
  console.log(`> Connected to signaling server as ${myId}`);
  ws.send(JSON.stringify({ type: "register", id: myId, room: roomName }));
});

ws.on("message", async (msg) => {
  const data = JSON.parse(msg);


  if (amHost && data.type === "chat") {

    sendChat()
  }

  // Room info
  if (data.type === "info" && data.host) {
    hostId = data.host;
    amHost = myId === hostId;
    console.log(`Room host is: ${hostId} (${amHost ? "You are host" : "You are client"})`);

    if (!amHost) {
      // Clients create connection to host
      await connectToHost(hostId);
    }
    return;
  }

  // New client joined (host only)
  if (amHost && data.type === "new_client") {
    const newClientId = data.clientId;
    console.log(`New client joined: ${newClientId}`);
    await createPeerConnection(newClientId, false); // host waits for offer
    return;
  }

  // Signaling
  if (data.type === "signal" && data.from && data.signal) {
    const { type, sdp, candidate } = data.signal;

    let pc = peers[data.from]?.pc;
    if (!pc) pc = await createPeerConnection(data.from, false);

    try {
      if (type === "offer") {
        await pc.setRemoteDescription({ type, sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({
          type: "signal",
          from: myId,
          target: data.from,
          room: roomName,
          signal: { type: "answer", sdp: answer.sdp }
        }));
      } else if (type === "answer") {
        await pc.setRemoteDescription({ type, sdp });
      } else if (type === "candidate" && candidate) {
        await pc.addIceCandidate(candidate);
      }
    } catch (err) {
      console.error(`[${myId}] Failed to process signal:`, err);
    }
  }
});

// --- Create PeerConnection ---
async function createPeerConnection(peerId, isInitiator) {
  console.log(`[${myId}] Creating PeerConnection with ${peerId}, initiator: ${isInitiator}`);
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  let dc;

  // When a DataChannel is received
  pc.ondatachannel = (event) => {
    console.log(`[${myId}] Received datachannel from ${peerId}`);
    dc = event.channel;
    setupDataChannel(dc, peerId);
    peers[peerId] = { pc, dc };
  };

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: "signal",
        from: myId,
        target: peerId,
        room: roomName,
        signal: { type: "candidate", candidate: event.candidate }
      }));
    }
  };

  if (isInitiator) {
    dc = pc.createDataChannel("chat");
    setupDataChannel(dc, peerId);
    peers[peerId] = { pc, dc };
  }

  return pc;
}

// --- Setup DataChannel ---
function setupDataChannel(dc, peerId) {
  dc.onopen = () => console.log(`Data channel open with ${peerId}`);
  dc.onmessage = (event) => {


      console.log(` ${event.data}`);
      if (hostId === myId) sendChat(`${event.data}`);


  }
  dc.onclose = () => console.log(`Data channel closed with ${peerId}`);
  dc.onerror = (err) => console.error(`Data channel error with ${peerId}:`, err);
}


async function connectToHost(hostId) {
  const pc = await createPeerConnection(hostId, true);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({
    type: "signal",
    from: myId,
    target: hostId,
    room: roomName,
    signal: { type: "offer", sdp: offer.sdp }
  }));
}


function sendChat(message) {
  for (const peerId in peers) {
    const { dc } = peers[peerId];
    if (dc?.readyState === "open") dc.send(message);
  }
}

// Simple REPL for chat
import readline from "readline";
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", (line) => {
  sendChat(`[${myId}] says: ${line}`);
  if (myId === hostId){
    console.log(`[${myId}] says: ${line}`)
  }
});
