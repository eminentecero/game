const socket = io();

let currentRoom = null;
let me = null;

const $ = (id) => document.getElementById(id);
const entry = $('entry');
const roomSection = $('room');
const nicknameInput = $('nickname');
const roomCodeInput = $('roomCode');
const entryMessage = $('entryMessage');
const roomMessage = $('roomMessage');

function getCodeFromPath() {
  const match = location.pathname.match(/\/room\/([A-Z0-9]+)/i);
  return match ? match[1].toUpperCase() : '';
}

function setMessage(target, text) {
  target.textContent = text || '';
}

function showRoom() {
  entry.classList.add('hidden');
  roomSection.classList.remove('hidden');
}

function updateRoom(room) {
  currentRoom = room;
  showRoom();
  $('roomTitle').textContent = room.code;
  $('category').value = room.category;

  const isHost = me && me.isHost;
  $('hostControls').classList.toggle('hidden', !isHost);
  $('startGame').classList.toggle('hidden', room.status !== 'waiting');
  $('resetGame').classList.toggle('hidden', room.status === 'waiting');
  $('category').disabled = room.status !== 'waiting';

  renderPlayers(room.players);
  renderVoteArea();
  renderResult();
}

function updateMe(info) {
  me = info;
  if (!me) return;
  if (currentRoom) updateRoom(currentRoom);
  renderMyCard();
  renderVoteArea();
}

function renderMyCard() {
  const title = $('myStatus');
  const detail = $('myDetail');
  if (!currentRoom || !me) return;

  if (currentRoom.status === 'waiting') {
    title.textContent = `${me.nickname}님, 대기 중입니다.`;
    detail.textContent = me.isHost ? '카테고리를 고르고 게임 시작 버튼을 눌러 주세요.' : '방장이 게임을 시작하면 제시어가 표시됩니다.';
    return;
  }

  if (me.role === 'liar') {
    title.textContent = '당신은 라이어입니다.';
    detail.textContent = '다른 사람의 설명을 듣고 제시어를 추리하세요. 너무 티 나지 않게 말하는 게 핵심!';
  } else {
    title.textContent = `제시어: ${me.word}`;
    detail.textContent = '라이어가 눈치채지 못하게, 너무 직접적이지 않게 설명해 보세요.';
  }
}

function renderPlayers(players) {
  const list = $('players');
  list.innerHTML = '';
  players.forEach(player => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="player-name">${escapeHtml(player.nickname)}</span>${player.isHost ? '<span class="badge">방장</span>' : ''}${player.id === socket.id ? '<span class="badge">나</span>' : ''}`;
    list.appendChild(li);
  });
}

function renderVoteArea() {
  const area = $('voteArea');
  if (!currentRoom || !me) return;

  if (currentRoom.status === 'waiting') {
    area.textContent = '게임이 시작되면 투표할 수 있어요.';
    return;
  }

  if (currentRoom.status === 'ended') {
    area.textContent = '투표가 종료되었습니다.';
    return;
  }

  area.innerHTML = '';
  currentRoom.players.forEach(player => {
    const card = document.createElement('div');
    const voteCount = Object.values(currentRoom.votes || {}).filter(id => id === player.id).length;
    const alreadyVoted = Boolean(currentRoom.votes?.[socket.id]);
    card.className = 'vote-card';
    card.innerHTML = `<span>${escapeHtml(player.nickname)} <span class="badge">${voteCount}표</span></span>`;
    const button = document.createElement('button');
    button.textContent = alreadyVoted ? '투표 완료' : '투표';
    button.disabled = alreadyVoted;
    button.addEventListener('click', () => vote(player.id));
    card.appendChild(button);
    area.appendChild(card);
  });
}

function renderResult() {
  const resultBox = $('result');
  if (!currentRoom || currentRoom.status !== 'ended' || !currentRoom.result) {
    resultBox.classList.add('hidden');
    resultBox.innerHTML = '';
    return;
  }
  const r = currentRoom.result;
  resultBox.classList.remove('hidden');
  const selectedText = r.tie ? '최다 득표자가 여러 명이라 지목 실패!' : `최종 지목: <strong>${escapeHtml(r.selectedNickname || '없음')}</strong>`;
  const verdict = r.success ? '시민팀 성공! 라이어를 맞혔어요.' : '라이어 승리! 라이어를 잡지 못했어요.';
  resultBox.innerHTML = `
    <h3>결과 공개</h3>
    <p>${selectedText}</p>
    <p>라이어는 <strong>${escapeHtml(r.liarNickname)}</strong>였습니다.</p>
    <p>제시어는 <strong>${escapeHtml(r.word)}</strong>였습니다.</p>
    <p><strong>${verdict}</strong></p>
  `;
}

function createRoom() {
  setMessage(entryMessage, '');
  socket.emit('room:create', { nickname: nicknameInput.value }, (res) => {
    if (!res.ok) return setMessage(entryMessage, res.message);
    history.pushState(null, '', `/room/${res.code}`);
  });
}

function joinRoom() {
  setMessage(entryMessage, '');
  const code = (roomCodeInput.value || getCodeFromPath()).toUpperCase();
  socket.emit('room:join', { code, nickname: nicknameInput.value }, (res) => {
    if (!res.ok) return setMessage(entryMessage, res.message);
    history.pushState(null, '', `/room/${res.code}`);
  });
}

function startGame() {
  socket.emit('game:start', (res) => {
    if (!res.ok) setMessage(roomMessage, res.message);
  });
}

function vote(targetId) {
  socket.emit('game:vote', { targetId }, (res) => {
    if (!res.ok) setMessage(roomMessage, res.message);
  });
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

$('createRoom').addEventListener('click', createRoom);
$('joinRoom').addEventListener('click', joinRoom);
$('startGame').addEventListener('click', startGame);
$('resetGame').addEventListener('click', () => socket.emit('game:reset'));
$('category').addEventListener('change', (e) => socket.emit('game:setCategory', { category: e.target.value }));
$('copyLink').addEventListener('click', async () => {
  const link = `${location.origin}/room/${currentRoom.code}`;
  await navigator.clipboard.writeText(link);
  setMessage(roomMessage, '초대 링크를 복사했어요.');
});

socket.on('room:update', updateRoom);
socket.on('me:update', updateMe);

const initialCode = getCodeFromPath();
if (initialCode) {
  roomCodeInput.value = initialCode;
  setMessage(entryMessage, '닉네임을 입력한 뒤 입장해 주세요.');
}
