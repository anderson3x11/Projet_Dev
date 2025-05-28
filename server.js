// === server.js ===
// Run with: node server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

server.listen(8080, () => {
  console.log('Server running on http://localhost:8080');
});

let waitingPlayer = null;
const games = new Map();

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    const data = JSON.parse(message);

    if (data.type === 'set_name') {
      ws.playerName = data.name;
      console.log(`${data.name} connected.`);

      if (!waitingPlayer) {
        waitingPlayer = ws;
        ws.send(JSON.stringify({ type: 'waiting' }));
      } else {
        // Start game
        const player1 = waitingPlayer;
        const player2 = ws;
        const gameId = Date.now();

        games.set(gameId, { player1, player2 });
        player1.opponent = player2;
        player2.opponent = player1;
        player1.gameId = gameId;
        player2.gameId = gameId;

        player1.send(JSON.stringify({ type: 'start', mark: 'X', opponent: player2.playerName }));
        player2.send(JSON.stringify({ type: 'start', mark: 'O', opponent: player1.playerName }));

        waitingPlayer = null;
      }
    }

    if (data.type === 'move' && ws.opponent) {
      ws.opponent.send(JSON.stringify({ type: 'move', index: data.index }));
    }
  });

  ws.on('close', () => {
    if (waitingPlayer === ws) waitingPlayer = null;
    if (ws.opponent) {
      ws.opponent.send(JSON.stringify({ type: 'opponent_left' }));
      ws.opponent.opponent = null;
    }
    const gameId = ws.gameId;
    if (gameId) games.delete(gameId);
  });
});