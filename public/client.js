// === public/client.js ===
let socket;
let myTurn = false;
let myMark;
let cells = [];
let playerName;
let opponentName;
let myStats = null;
let opponentStats = null;

// Récupération des éléments du DOM
const status = document.getElementById('status');
const board = document.getElementById('board');
const setupPanel = document.getElementById('setupPanel');
const gamePanel = document.getElementById('gamePanel');
const turnIndicator = document.getElementById('turnIndicator');
const yourInfo = document.getElementById('yourInfo');
const opponentInfo = document.getElementById('opponentInfo');
const queueInfo = document.getElementById('queueInfo');

// Éléments d'authentification
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const registerUsername = document.getElementById('registerUsername');
const registerPassword = document.getElementById('registerPassword');
const confirmPassword = document.getElementById('confirmPassword');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Éléments des statistiques
const yourGames = document.getElementById('yourGames');
const yourWins = document.getElementById('yourWins');
const yourWinRate = document.getElementById('yourWinRate');
const opponentGames = document.getElementById('opponentGames');
const opponentWins = document.getElementById('opponentWins');
const opponentWinRate = document.getElementById('opponentWinRate');

// Éléments du classement
const showRankingsBtn = document.getElementById('showRankingsBtn');
const rankingsModal = document.getElementById('rankingsModal');
const closeBtn = document.querySelector('.close');
const rankingsBody = document.getElementById('rankingsBody');

// Masquer initialement le panneau de jeu
gamePanel.style.display = 'none';

// Afficher/masquer les formulaires d'authentification
showRegisterBtn.onclick = (e) => {
  e.preventDefault();
  loginForm.style.display = 'none';
  registerForm.style.display = 'block';
};

showLoginBtn.onclick = (e) => {
  e.preventDefault();
  registerForm.style.display = 'none';
  loginForm.style.display = 'block';
};

// Gestion de l'inscription
registerBtn.onclick = async () => {
  if (!registerUsername.value || !registerPassword.value) {
    alert('Veuillez remplir tous les champs');
    return;
  }

  if (registerPassword.value !== confirmPassword.value) {
    alert('Les mots de passe ne correspondent pas');
    return;
  }

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: registerUsername.value,
        password: registerPassword.value
      })
    });

    const data = await response.json();
    if (data.success) {
      alert('Inscription réussie ! Veuillez vous connecter.');
      registerForm.style.display = 'none';
      loginForm.style.display = 'block';
      registerUsername.value = '';
      registerPassword.value = '';
      confirmPassword.value = '';
    } else {
      alert(data.error);
    }
  } catch (error) {
    alert('L\'inscription a échoué. Veuillez réessayer.');
  }
};

// Gestion de la connexion
loginBtn.onclick = async () => {
  if (!loginUsername.value || !loginPassword.value) {
    alert('Veuillez remplir tous les champs');
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUsername.value,
        password: loginPassword.value
      })
    });

    const data = await response.json();
    if (data.success) {
      playerName = data.player.username;
      myStats = data.player;
      setupPanel.style.display = 'none';
      gamePanel.style.display = 'block';
      updatePlayerInfo();
      updateStats(myStats);
      connectToGame();
    } else {
      alert(data.error);
    }
  } catch (error) {
    alert('La connexion a échoué. Veuillez réessayer.');
  }
};

// Gestion de la déconnexion
logoutBtn.onclick = () => {
  if (socket) {
    socket.close();
  }
  resetGame();
  setupPanel.style.display = 'block';
  gamePanel.style.display = 'none';
  loginUsername.value = '';
  loginPassword.value = '';
};

function resetGame() {
  myTurn = false;
  myMark = null;
  cells = [];
  playerName = null;
  opponentName = null;
  myStats = null;
  opponentStats = null;
  board.innerHTML = '';
  status.textContent = '';
  queueInfo.textContent = '';
  turnIndicator.textContent = '';
  updatePlayerInfo();
  updateStats(null);
  updateStats(null, true);
}

function connectToGame() {
  socket = new WebSocket(`ws://${location.host}`);
  
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'set_name', name: playerName }));
  };

  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    console.log('Message reçu:', msg.type);

    if (msg.type === 'stats_update') {
      if (msg.stats.username === playerName) {
        updateStats(msg.stats);
      } else if (msg.stats.username === opponentName) {
        updateStats(msg.stats, true);
      }
    }

    if (msg.type === 'waiting') {
      status.textContent = 'En attente d\'un adversaire...';
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
        status.innerHTML = '<span class="draw">La partie se termine sur un match nul !</span>';
      } else if (msg.winner === myMark) {
        status.innerHTML = '<span class="winner">Vous avez gagné ! 🎉</span>';
      } else {
        status.innerHTML = '<span class="loser">Vous avez perdu !</span>';
      }
      turnIndicator.textContent = '';
    }

    if (msg.type === 'continue_prompt') {
      showContinuePrompt();
    }

    if (msg.type === 'queue_position') {
      if (msg.position === 0) {
        queueInfo.textContent = 'Vous êtes le prochain !';
      } else {
        queueInfo.textContent = `Vous êtes #${msg.position} dans la file d'attente`;
      }
    }

    if (msg.type === 'queue_joined') {
      status.textContent = 'Partie en cours';
      queueInfo.textContent = `Vous êtes #${msg.position} dans la file d'attente - en attente de votre tour`;
    }

    if (msg.type === 'waiting_for_opponent') {
      status.textContent = 'En attente d\'un nouvel adversaire...';
      opponentName = null;
      updatePlayerInfo();
      clearBoard();
      myTurn = false;
      updateTurnStatus();
    }

    if (msg.type === 'opponent_left') {
      status.textContent = 'L\'adversaire a quitté. En attente d\'un nouvel adversaire...';
      opponentName = null;
      updatePlayerInfo();
      myTurn = false;
      updateTurnStatus();
    }
  };

  socket.onerror = error => {
    console.error('Erreur WebSocket:', error);
    status.textContent = 'Erreur de connexion. Veuillez rafraîchir la page.';
  };
}

function updateStats(stats, isOpponent = false) {
  if (!stats) {
    const elements = isOpponent ? 
      { games: opponentGames, wins: opponentWins, winRate: opponentWinRate } :
      { games: yourGames, wins: yourWins, winRate: yourWinRate };
    
    elements.games.textContent = '0';
    elements.wins.textContent = '0';
    elements.winRate.textContent = '0%';
    return;
  }
  
  const elements = isOpponent ? 
    { games: opponentGames, wins: opponentWins, winRate: opponentWinRate } :
    { games: yourGames, wins: yourWins, winRate: yourWinRate };
  
  elements.games.textContent = stats.total_games;
  elements.wins.textContent = stats.wins;
  elements.winRate.textContent = `${(stats.winrate * 100).toFixed(1)}%`;
  
  if (isOpponent) {
    opponentStats = stats;
  } else {
    myStats = stats;
  }
}

function updateTurnStatus() {
  turnIndicator.textContent = myTurn ? 'C\'est votre tour !' : 'Tour de l\'adversaire';
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
  ` : 'En attente...';
}

async function updateRankings() {
  try {
    const response = await fetch('/api/rankings');
    const rankings = await response.json();
    
    rankingsBody.innerHTML = rankings.map((player, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${player.username}</td>
        <td>${player.total_games}</td>
        <td>${player.wins}</td>
        <td>${(player.winrate * 100).toFixed(1)}%</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur lors de la récupération du classement:', error);
  }
}

// Contrôles du modal de classement
showRankingsBtn.onclick = () => {
  updateRankings();
  rankingsModal.style.display = 'block';
};

closeBtn.onclick = () => {
  rankingsModal.style.display = 'none';
};

window.onclick = (event) => {
  if (event.target === rankingsModal) {
    rankingsModal.style.display = 'none';
  }
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
  message.textContent = 'Voulez-vous continuer à jouer ?';
  
  const continueBtn = document.createElement('button');
  continueBtn.textContent = 'Continuer';
  continueBtn.onclick = () => {
    continueBtn.disabled = true;
    leaveBtn.disabled = true;
    socket.send(JSON.stringify({ type: 'continue_choice', continue: true }));
    container.remove();
  };
  
  const leaveBtn = document.createElement('button');
  leaveBtn.textContent = 'Quitter';
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
