// === public/client.js ===
let socket;
let myTurn = false;
let myMark;
let cells = [];

const status = document.getElementById('status');
const board = document.getElementById('board');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('nameInput');

joinBtn.onclick = () => {
  socket = new WebSocket(`ws://${location.host}`);
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'set_name', name: nameInput.value }));
  };

  socket.onmessage = event => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'waiting') {
      status.textContent = 'Waiting for opponent...';
    }

    if (msg.type === 'start' || msg.type === 'rematch_start') {
      myMark = msg.mark;
      myTurn = myMark === 'X';
      status.textContent = `Game started. You are ${myMark}`;
      renderBoard();
    }

    if (msg.type === 'move') {
      placeMark(msg.index, msg.mark);
      myTurn = msg.mark !== myMark;
      status.textContent = myTurn ? 'Your turn' : 'Waiting for opponent...';
    }

    if (msg.type === 'game_over') {
      if (msg.winner === null) {
        status.textContent = 'Draw!';
      } else if (msg.winner === myMark) {
        status.textContent = 'You win!';
      } else {
        status.textContent = 'You lose!';
      }
      showRematchButton();
    }

    if (msg.type === 'opponent_left') {
      status.textContent = 'Opponent left. Refresh to start again.';
      myTurn = false;
    }
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
        placeMark(i, myMark);
        socket.send(JSON.stringify({ type: 'move', index: i }));
        myTurn = false;
        status.textContent = 'Waiting for opponent...';
      }
    };
    board.appendChild(cell);
    cells.push(cell);
  }
}

function placeMark(index, mark) {
  const cell = cells[index];
  if (!cell.textContent) {
    cell.textContent = mark;
    cell.classList.add('taken');
  }
}

function showRematchButton() {
  const btn = document.createElement('button');
  btn.textContent = 'Rematch';
  btn.onclick = () => {
    socket.send(JSON.stringify({ type: 'rematch' }));
    status.textContent = 'Waiting for opponent to accept rematch...';
    btn.remove();
  };
  document.body.appendChild(btn);
}
