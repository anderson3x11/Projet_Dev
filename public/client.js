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

    if (msg.type === 'start') {
      myMark = msg.mark;
      myTurn = myMark === 'X';
      status.textContent = `Game started vs ${msg.opponent}. You are ${myMark}`;
      renderBoard();
    }

    if (msg.type === 'move') {
      placeMark(msg.index, myMark === 'X' ? 'O' : 'X');
      myTurn = true;
      status.textContent = 'Your turn';
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