// === public/client.js ===
let socket;
let myTurn = false;
let myMark;
let cells = [];
let playerName;
let opponentName;
let myStats = null;
let opponentStats = null;
let isPlayingBot = false;
let currentServer = null;

// Server connection elements
const serverPanel = document.getElementById('serverPanel');
const serverList = document.getElementById('serverList');
const serverAddress = document.getElementById('serverAddress');
const connectBtn = document.getElementById('connectBtn');

// Récupération des éléments du DOM
const status = document.getElementById('status');
const board = document.getElementById('board');
const setupPanel = document.getElementById('setupPanel');
const gamePanel = document.getElementById('gamePanel');
const turnIndicator = document.getElementById('turnIndicator');
const yourInfo = document.getElementById('yourInfo');
const opponentInfo = document.getElementById('opponentInfo');
const queueInfo = document.getElementById('queueInfo');
const gameModeSelection = document.getElementById('gameModeSelection');
const findMatchBtn = document.getElementById('findMatchBtn');
const playBotBtn = document.getElementById('playBotBtn');

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

// Initialize server discovery
async function discoverServer() {
  try {
    const response = await fetch('/api/server-info');
    const serverInfo = await response.json();
    
    serverList.innerHTML = '';
    
    // Add localhost
    addServerToList('localhost:' + serverInfo.port, true);
    
    // Add network addresses
    serverInfo.addresses.forEach(addr => {
      addServerToList(addr + ':' + serverInfo.port);
    });
  } catch (error) {
    console.error('Error discovering server:', error);
  }
}

function addServerToList(address, isLocal = false) {
  const serverItem = document.createElement('div');
  serverItem.className = 'server-item' + (isLocal ? ' local' : '');
  serverItem.innerHTML = `
    <span class="address">${address}</span>
    <span>${isLocal ? 'Local' : 'Network'}</span>
  `;
  serverItem.onclick = () => connectToServer(address);
  serverList.appendChild(serverItem);
}

function connectToServer(address) {
  if (socket) {
    socket.close();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsAddress = `${protocol}//${address}`;
  
  try {
    socket = new WebSocket(wsAddress);
    
    socket.onopen = () => {
      console.log('Connected to server:', address);
      currentServer = address;
      serverPanel.style.display = 'none';
      setupPanel.style.display = 'block';
      status.textContent = ''; // Clear any error messages
    };
    
    socket.onclose = () => {
      console.log('Disconnected from server');
      if (currentServer === address) {
        // Only show connection error if we're not in an active game
        if (!isPlayingBot && !opponentName) {
          status.textContent = 'Connection lost. Attempting to reconnect...';
          // Attempt to reconnect after a delay
          setTimeout(() => {
            if (!socket || socket.readyState !== WebSocket.OPEN) {
              connectToServer(address);
            }
          }, 3000);
        }
      }
    };
    
    setupWebSocketHandlers();
  } catch (error) {
    console.error('Error connecting to server:', error);
    status.textContent = 'Connection error. Click Find Match to try again.';
  }
}

// Manual connection handler
connectBtn.onclick = () => {
  const address = serverAddress.value.trim();
  if (address) {
    connectToServer(address);
  } else {
    alert('Please enter a server address');
  }
};

// Start server discovery
discoverServer();

// Authentication handlers
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
      gameModeSelection.style.display = 'flex';
      board.style.display = 'none';
      updatePlayerInfo();
      updateStats(myStats);
      // Only send the name to the server, don't start matchmaking yet
      if (socket) {
        socket.send(JSON.stringify({ 
          type: 'set_name', 
          name: playerName,
          autoMatch: false // Add flag to prevent auto-matching
        }));
      }
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
  serverPanel.style.display = 'block';
  setupPanel.style.display = 'none';
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

// Move existing WebSocket event handlers to a separate function
function setupWebSocketHandlers() {
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    console.log('Message received:', msg.type);

    // Clear connection error message if we receive any message
    if (status.textContent.includes('Connection error') || 
        status.textContent.includes('Connection lost')) {
      status.textContent = '';
    }

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

      // Request opponent's stats
      socket.send(JSON.stringify({
        type: 'request_stats',
        username: opponentName
      }));
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
    console.error('WebSocket error:', error);
    if (!isPlayingBot && !opponentName) {
      status.textContent = 'Connection error. Click Find Match to try again.';
    }
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
  
  // Add stat labels and values structure
  elements.games.innerHTML = `<span class="stat-label">Games:</span> <span class="stat-value total-games">${stats.total_games}</span>`;
  elements.wins.innerHTML = `<span class="stat-label">Wins:</span> <span class="stat-value wins">${stats.wins}</span>`;
  
  // Calculate win rate and determine prestige class
  const winRate = stats.winrate * 100;
  let prestigeClass = 'winrate-novice';
  
  if (winRate >= 85) prestigeClass = 'winrate-grandmaster';
  else if (winRate >= 75) prestigeClass = 'winrate-master';
  else if (winRate >= 65) prestigeClass = 'winrate-expert';
  else if (winRate >= 55) prestigeClass = 'winrate-advanced';
  else if (winRate >= 45) prestigeClass = 'winrate-intermediate';
  
  elements.winRate.innerHTML = `<span class="stat-label">Win Rate:</span> <span class="stat-value win-rate ${prestigeClass}">${winRate.toFixed(1)}%</span>`;
  
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
    cell.onclick = () => handleCellClick(i);
    board.appendChild(cell);
    cells.push(cell);
  }
}

function handleCellClick(index) {
  // Check if cell is already taken or it's not player's turn
  if (cells[index].textContent || !myTurn) {
    return;
  }

  if (isPlayingBot) {
    // Handle bot game move
    placeMark(index, myMark);
  } else {
    // Handle multiplayer game move
    socket.send(JSON.stringify({ type: 'move', index: index }));
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

    if (isPlayingBot) {
      // Check if game is over after player's move
      const boardState = getBoardState();
      const winner = checkWinner(boardState);
      
      if (winner || isBoardFull()) {
        handleGameOver();
      } else {
        // Bot's turn
        myTurn = false;
        updateTurnStatus();
        setTimeout(makeBotMove, 1000);
      }
    }
  }
}

function getBoardState() {
  return cells.map(cell => cell.textContent || null);
}

function isBoardFull() {
  return getBoardState().every(cell => cell !== null);
}

function makeBotMove() {
  if (!isPlayingBot || myTurn) return;  // Add myTurn check to prevent multiple bot moves

  const board = getBoardState();
  const availableMoves = board.reduce((moves, cell, index) => {
    if (cell === null) moves.push(index);
    return moves;
  }, []);

  // Simple bot strategy for normal difficulty
  let moveIndex;

  // First, check if bot can win
  moveIndex = findWinningMove(board, 'O');
  
  // Then, block player's winning move
  if (moveIndex === -1) {
    moveIndex = findWinningMove(board, 'X');
  }
  
  // If no winning moves, try to take center
  if (moveIndex === -1 && board[4] === null) {
    moveIndex = 4;
  }
  
  // If center taken, try corners
  if (moveIndex === -1) {
    const corners = [0, 2, 6, 8].filter(i => board[i] === null);
    if (corners.length > 0) {
      moveIndex = corners[Math.floor(Math.random() * corners.length)];
    }
  }
  
  // If no special moves, take random available spot
  if (moveIndex === -1 && availableMoves.length > 0) {
    moveIndex = availableMoves[Math.floor(Math.random() * availableMoves.length)];
  }

  if (moveIndex !== -1) {
    placeMark(moveIndex, 'O');
    myTurn = true;  // Give turn back to player
    updateTurnStatus();
    
    // Check if game is over after bot's move
    const boardState = getBoardState();
    const winner = checkWinner(boardState);
    
    if (winner || isBoardFull()) {
      handleGameOver();
    }
  }
}

function findWinningMove(board, mark) {
  const wins = [
    [0,1,2], [3,4,5], [6,7,8], // Rows
    [0,3,6], [1,4,7], [2,5,8], // Columns
    [0,4,8], [2,4,6] // Diagonals
  ];

  for (const [a, b, c] of wins) {
    const line = [board[a], board[b], board[c]];
    const markCount = line.filter(cell => cell === mark).length;
    const nullCount = line.filter(cell => cell === null).length;
    
    if (markCount === 2 && nullCount === 1) {
      const emptyIndex = [a, b, c][line.indexOf(null)];
      return emptyIndex;
    }
  }
  
  return -1;
}

function handleGameOver() {
  const board = getBoardState();
  const winner = checkWinner(board);
  
  if (winner) {
    if (winner === myMark) {
      status.innerHTML = '<span class="winner">Vous avez gagné ! 🎉</span>';
    } else {
      status.innerHTML = '<span class="loser">Le Bot a gagné !</span>';
    }
  } else if (isBoardFull()) {
    status.innerHTML = '<span class="draw">Match nul !</span>';
  }

  // Update stats
  if (winner === myMark) {
    updatePlayerStats('win');
  } else if (winner === 'O') {
    updatePlayerStats('loss');
  } else {
    updatePlayerStats('draw');
  }

  // Show rematch UI
  showRematchUI();
}

function showRematchUI() {
  // Remove existing rematch UI if it exists
  const existingRematch = document.querySelector('.rematch-ui');
  if (existingRematch) {
    existingRematch.remove();
  }

  // Create rematch UI
  const rematchUI = document.createElement('div');
  rematchUI.className = 'rematch-ui';
  
  const message = document.createElement('p');
  message.textContent = 'Voulez-vous jouer une autre partie ?';
  
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'rematch-buttons';
  
  const playAgainBtn = document.createElement('button');
  playAgainBtn.textContent = 'Rejouer';
  playAgainBtn.className = 'rematch-button play-again';
  playAgainBtn.onclick = () => {
    rematchUI.remove();
    resetBotGame();
  };
  
  const exitBtn = document.createElement('button');
  exitBtn.textContent = 'Quitter';
  exitBtn.className = 'rematch-button exit';
  exitBtn.onclick = () => {
    rematchUI.remove();
    resetGame();
    gameModeSelection.style.display = 'flex';
    board.style.display = 'none';
  };
  
  buttonContainer.appendChild(playAgainBtn);
  buttonContainer.appendChild(exitBtn);
  rematchUI.appendChild(message);
  rematchUI.appendChild(buttonContainer);
  
  // Add the rematch UI below the board
  board.parentNode.insertBefore(rematchUI, board.nextSibling);
}

// Add styles for rematch UI
const rematchStyles = document.createElement('style');
rematchStyles.textContent = `
  .rematch-ui {
    text-align: center;
    margin-top: 20px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .rematch-ui p {
    font-size: 18px;
    margin-bottom: 15px;
    color: #333;
  }

  .rematch-buttons {
    display: flex;
    justify-content: center;
    gap: 15px;
  }

  .rematch-button {
    padding: 10px 25px;
    font-size: 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-weight: 600;
  }

  .rematch-button.play-again {
    background: #4CAF50;
    color: white;
  }

  .rematch-button.play-again:hover {
    background: #388E3C;
    transform: translateY(-2px);
  }

  .rematch-button.exit {
    background: #f44336;
    color: white;
  }

  .rematch-button.exit:hover {
    background: #d32f2f;
    transform: translateY(-2px);
  }

  .rematch-button:active {
    transform: translateY(0);
  }
`;
document.head.appendChild(rematchStyles);

function resetBotGame() {
  clearBoard();
  myTurn = true;
  myMark = 'X';
  updateTurnStatus();
  status.textContent = 'Partie contre le Bot';
}

async function updatePlayerStats(result) {
  try {
    await fetch('/api/update-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: playerName,
        result: result
      })
    });
    
    const response = await fetch(`/api/stats/${playerName}`);
    const stats = await response.json();
    updateStats(stats);
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

// Game mode selection handlers
findMatchBtn.onclick = () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log('Reconnecting to server...');
    const currentAddr = currentServer || window.location.host;
    connectToServer(currentAddr);
    // Wait for connection before sending find_match
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'set_name', name: playerName, autoMatch: false }));
      socket.send(JSON.stringify({ type: 'find_match' }));
    };
  } else {
    socket.send(JSON.stringify({ type: 'find_match' }));
  }
  isPlayingBot = false;
  gameModeSelection.style.display = 'none';
  board.style.display = 'grid';
  status.textContent = 'Recherche d\'un adversaire...';
};

playBotBtn.onclick = () => {
  isPlayingBot = true;
  gameModeSelection.style.display = 'none';
  board.style.display = 'grid';
  opponentName = 'Bot';
  myMark = 'X';  // Player always starts as X against bot
  myTurn = true;
  updatePlayerInfo();
  renderBoard();
  updateTurnStatus();
  status.textContent = 'Partie contre le Bot';
  
  // Set up bot stats
  const botStats = {
    username: 'Bot',
    total_games: 999,
    wins: 650,
    losses: 300,
    draws: 49,
    winrate: 0.65
  };
  updateStats(botStats, true);
};

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

// Add checkWinner function if it doesn't exist
function checkWinner(board) {
  const wins = [
    [0,1,2], [3,4,5], [6,7,8], // Rows
    [0,3,6], [1,4,7], [2,5,8], // Columns
    [0,4,8], [2,4,6] // Diagonals
  ];
  
  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return null;
}
