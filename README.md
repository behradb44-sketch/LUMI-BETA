# LUMI — REBORN

A fresh 2D multiplayer browser adventure built from scratch with a Node.js + WebSocket server and a canvas client. No database is required: rooms, players and world state live in server memory.

## Deploy to Render
- Create one **Web Service** from this repository.
- Build: `npm install`
- Start: `npm start`
- The server listens on `0.0.0.0` and `PORT`.
- The same service serves the game and accepts WebSocket connections.

## Design
The game centers on **World Memory**: players cooperate to discover Memory Shards and activate city beacons. Completing a shared objective changes the world phase for everyone currently in the room.

The multiplayer layer uses WebSockets, with server-authoritative player state, room membership, snapshots, heartbeat, reconnect-friendly client logic and link-based room joining.
