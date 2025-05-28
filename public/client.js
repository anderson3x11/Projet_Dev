// === public/client.js ===
let socket;
let myTurn = false;
let myMark;
let cells = [];
let playerName;
let opponentName;

// Récupération des éléments du DOM
const status = document.getElementById('status');
const board = document.getElementById('board');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('nameInput');
const setupPanel = document.getElementById('setupPanel');
const gamePanel = document.getElementById('gamePanel');
const turnIndicator = document.getElementById('turnIndicator');
const yourInfo = document.getElementById('yourInfo');
const opponentInfo = document.getElementById('opponentInfo');
const queueInfo = document.getElementById('queueInfo');

// Masquer initialement le panneau de jeu
gamePanel.style.display = 'none';

function updateTurnStatus() {
  turnIndicator.textContent = myTurn ? 'Your turn!' : "Opponent's turn";
  turnIndicator.style.color = myTurn ? '#4CAF50' : '#f44336';
  
  // Mise en évidence du joueur actif
  const yourCard = document.querySelector('.player-card.you');
  const opponentCard = document.querySelector('.player-card.opponent');
  yourCard.classList.toggle('active', myTurn);
  opponentCard.classList.toggle('active', !myTurn);
}

function updatePlayerInfo() {
  yourInfo.innerHTML = `
    <div>${playerName}</div>
    <div style="font-size: 1.2em; margin-top: 5px; font-weight: bold; color: ${myMark === 'X' ? '#2196F3' : '#f44336'}">${myMark || '?'}</div>
  `;
  
  opponentInfo.innerHTML = opponentName ? `
    <div>${opponentName}</div>
    <div style="font-size: 1.2em; margin-top: 5px; font-weight: bold; color: ${myMark === 'X' ? '#f44336' : '#2196F3'}">${myMark === 'X' ? 'O' : 'X'}</div>
  ` : 'Waiting...';
}

joinBtn.onclick = () => {
  if (!nameInput.value) {
    alert('Please enter your name first!');
    return;
  }
  
  playerName = nameInput.value;
  setupPanel.style.display = 'none';
  gamePanel.style.display = 'block';
  updatePlayerInfo();
  
  socket = new WebSocket(`ws://${location.host}`);
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'set_name', name: playerName }));
  };

  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    console.log('Received message:', msg.type);

    if (msg.type === 'waiting') {
      status.textContent = 'Waiting for opponent...';
      queueInfo.textContent = '';
    }

    if (msg.type === 'start') {
      myMark = msg.mark;
      myTurn = myMark === 'X';
      opponentName = msg.opponent;
      updatePlayerInfo();
      renderBoard();
      queueInfo.textContent = '';
      updateTurnStatus();
    }

    if (msg.type === 'move') {
      placeMark(msg.index, msg.mark);
      myTurn = msg.turn === myMark;
      updateTurnStatus();
    }

    if (msg.type === 'turn_update') {
      myTurn = msg.turn === myMark;
      updateTurnStatus();
    }

    if (msg.type === 'game_over') {
      if (msg.winner === null) {
        status.innerHTML = '<span class="draw">Game ended in a draw!</span>';
      } else if (msg.winner === myMark) {
        status.innerHTML = '<span class="winner">You win! 🎉</span>';
      } else {
        status.innerHTML = '<span class="loser">You lose!</span>';
      }
      turnIndicator.textContent = '';
    }

    if (msg.type === 'continue_prompt') {
      showContinuePrompt();
    }

    if (msg.type === 'queue_position') {
      if (msg.position === 0) {
        queueInfo.textContent = 'You are next in line!';
      } else {
        queueInfo.textContent = `You are #${msg.position} in the queue`;
      }
    }

    if (msg.type === 'queue_joined') {
      status.textContent = 'Game in progress';
      queueInfo.textContent = `You are #${msg.position} in the queue - waiting for your turn`;
    }

    if (msg.type === 'waiting_for_opponent') {
      status.textContent = 'Waiting for new opponent...';
      opponentName = null;
      updatePlayerInfo();
      clearBoard();
      myTurn = false;
      updateTurnStatus();
    }

    if (msg.type === 'opponent_left') {
      status.textContent = 'Opponent left. Waiting for new opponent...';
      opponentName = null;
      updatePlayerInfo();
      myTurn = false;
      updateTurnStatus();
    }
  };

  socket.onerror = error => {
    console.error('WebSocket error:', error);
    status.textContent = 'Connection error. Please refresh the page.';
  };
};

function renderBoard() {
  board.innerHTML = '';
  cells = [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.onclick = () => {
      if (!cell.textContent && myTurn) {
        socket.send(JSON.stringify({ type: 'move', index: i }));
      }
    };
    board.appendChild(cell);
    cells.push(cell);
  }
}

function clearBoard() {
  cells.forEach(cell => {
    cell.textContent = '';
    cell.classList.remove('taken', 'X', 'O');
  });
}

function placeMark(index, mark) {
  const cell = cells[index];
  if (!cell.textContent) {
    cell.textContent = mark;
    cell.classList.add('taken', mark);
  }
}

function showContinuePrompt() {
  const existingPrompt = document.querySelector('.continue-prompt');
  if (existingPrompt) {
    existingPrompt.remove();
  }

  const container = document.createElement('div');
  container.classList.add('continue-prompt');
  
  const message = document.createElement('p');
  message.textContent = 'Do you want to continue playing?';
  
  const continueBtn = document.createElement('button');
  continueBtn.textContent = 'Continue';
  continueBtn.onclick = () => {
    continueBtn.disabled = true;
    leaveBtn.disabled = true;
    socket.send(JSON.stringify({ type: 'continue_choice', continue: true }));
    container.remove();
  };
  
  const leaveBtn = document.createElement('button');
  leaveBtn.textContent = 'Leave';
  leaveBtn.onclick = () => {
    continueBtn.disabled = true;
    leaveBtn.disabled = true;
    socket.send(JSON.stringify({ type: 'continue_choice', continue: false }));
    container.remove();
  };
  
  container.appendChild(message);
  container.appendChild(continueBtn);
  container.appendChild(leaveBtn);
  document.body.appendChild(container);
}

// Mise à jour des styles pour la fenêtre de continuation
const style = document.createElement('style');
style.textContent = `
  .continue-prompt {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border: 2px solid #333;
    border-radius: 8px;
    text-align: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 1000;
  }
  .continue-prompt button {
    margin: 10px;
    padding: 8px 20px;
    cursor: pointer;
    border: none;
    border-radius: 4px;
    background: #4CAF50;
    color: white;
    font-size: 14px;
  }
  .continue-prompt button:disabled {
    background: #ccc;
    cursor: default;
  }
  .continue-prompt button:last-child {
    background: #f44336;
  }
  .continue-prompt button:last-child:disabled {
    background: #ccc;
  }
`;
document.head.appendChild(style);
