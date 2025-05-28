// === server.js ===
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
        const player1 = waitingPlayer;
        const player2 = ws;
        const gameId = Date.now();

        games.set(gameId, {
          player1,
          player2,
          board: Array(9).fill(null),
          turn: 'X'
        });

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
      const game = games.get(ws.gameId);
      if (!game || game.board[data.index]) return;

      const mark = game.player1 === ws ? 'X' : 'O';
      if (game.turn !== mark) return;

      game.board[data.index] = mark;
      game.turn = mark === 'X' ? 'O' : 'X';

      game.player1.send(JSON.stringify({ type: 'move', index: data.index, mark }));
      game.player2.send(JSON.stringify({ type: 'move', index: data.index, mark }));

      const winner = checkWinner(game.board);
      if (winner || game.board.every(cell => cell !== null)) {
        const result = winner
          ? { type: 'game_over', winner }
          : { type: 'game_over', winner: null };

        game.player1.send(JSON.stringify(result));
        game.player2.send(JSON.stringify(result));
      }
    }

    if (data.type === 'rematch' && ws.opponent) {
      const game = games.get(ws.gameId);
      if (!game) return;

      ws.rematchRequested = true;

      if (ws.opponent.rematchRequested) {
        game.board = Array(9).fill(null);
        game.turn = 'X';
        game.player1.rematchRequested = false;
        game.player2.rematchRequested = false;

        game.player1.send(JSON.stringify({ type: 'rematch_start', mark: 'X' }));
        game.player2.send(JSON.stringify({ type: 'rematch_start', mark: 'O' }));
      }
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

function checkWinner(board) {
  const wins = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];
  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return null;
}