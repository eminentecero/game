const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const WORD_BANKS = {
  everyday: ['사과', '커피', '우산', '치킨', '지하철', '학교', '편의점', '핸드폰', '라면', '에어컨'],
  animal: ['고양이', '강아지', '펭귄', '돌고래', '코끼리', '토끼', '사자', '기린', '햄스터', '판다'],
  place: ['도서관', '영화관', '놀이공원', '한강', '공항', '찜질방', '카페', '노래방', '수영장', '미술관'],
  food: ['떡볶이', '김밥', '초밥', '파스타', '피자', '샌드위치', '빙수', '마라탕', '된장찌개', '케이크']
};

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getPublicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    category: room.category,
    players: room.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.id === room.hostId,
      connected: p.connected
    })),
    votes: room.votes,
    result: room.result
  };
}

function emitRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit('room:update', getPublicRoom(room));
}

function getMyInfo(room, socketId) {
  const player = room.players.find(p => p.id === socketId);
  if (!player) return null;

  return {
    id: player.id,
    nickname: player.nickname,
    isHost: player.id === room.hostId,
    role: room.status === 'playing' || room.status === 'ended' ? player.role : null,
    word: room.status === 'playing' || room.status === 'ended' ? (player.role === 'liar' ? null : room.word) : null,
    liarHint: room.status === 'playing' || room.status === 'ended' ? (player.role === 'liar' ? '당신은 라이어입니다. 다른 사람들의 설명을 듣고 제시어를 추리하세요.' : null) : null
  };
}

function emitPrivateInfo(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.players.forEach(player => {
    io.to(player.id).emit('me:update', getMyInfo(room, player.id));
  });
}

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, service: 'liar-game-online' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/room/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('room:create', ({ nickname }, callback) => {
    const cleanName = String(nickname || '').trim().slice(0, 12);
    if (!cleanName) return callback?.({ ok: false, message: '닉네임을 입력해 주세요.' });

    let code;
    do { code = makeRoomCode(); } while (rooms.has(code));

    const room = {
      code,
      hostId: socket.id,
      status: 'waiting',
      category: 'everyday',
      word: null,
      players: [{ id: socket.id, nickname: cleanName, role: null, connected: true }],
      votes: {},
      result: null
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    callback?.({ ok: true, code });
    emitRoom(code);
    emitPrivateInfo(code);
  });

  socket.on('room:join', ({ code, nickname }, callback) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const cleanName = String(nickname || '').trim().slice(0, 12);
    const room = rooms.get(roomCode);

    if (!room) return callback?.({ ok: false, message: '존재하지 않는 방입니다.' });
    if (!cleanName) return callback?.({ ok: false, message: '닉네임을 입력해 주세요.' });
    if (room.status !== 'waiting') return callback?.({ ok: false, message: '이미 게임이 시작된 방입니다.' });
    if (room.players.length >= 10) return callback?.({ ok: false, message: '최대 10명까지만 입장할 수 있습니다.' });
    if (room.players.some(p => p.nickname === cleanName)) return callback?.({ ok: false, message: '이미 사용 중인 닉네임입니다.' });

    room.players.push({ id: socket.id, nickname: cleanName, role: null, connected: true });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    callback?.({ ok: true, code: roomCode });
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on('game:setCategory', ({ category }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id || room.status !== 'waiting') return;
    if (!WORD_BANKS[category]) return;
    room.category = category;
    emitRoom(roomCode);
  });

  socket.on('game:start', (callback) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return callback?.({ ok: false, message: '방을 찾을 수 없습니다.' });
    if (room.hostId !== socket.id) return callback?.({ ok: false, message: '방장만 시작할 수 있습니다.' });
    if (room.players.length < 3) return callback?.({ ok: false, message: '최소 3명 이상 필요합니다.' });

    const words = WORD_BANKS[room.category] || WORD_BANKS.everyday;
    room.word = words[Math.floor(Math.random() * words.length)];
    room.status = 'playing';
    room.votes = {};
    room.result = null;

    const liarIndex = Math.floor(Math.random() * room.players.length);
    room.players.forEach((p, idx) => {
      p.role = idx === liarIndex ? 'liar' : 'normal';
    });

    callback?.({ ok: true });
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on('game:vote', ({ targetId }, callback) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') return callback?.({ ok: false, message: '투표할 수 없는 상태입니다.' });
    const voter = room.players.find(p => p.id === socket.id);
    const target = room.players.find(p => p.id === targetId);
    if (!voter || !target) return callback?.({ ok: false, message: '대상을 찾을 수 없습니다.' });

    room.votes[socket.id] = targetId;

    if (Object.keys(room.votes).length === room.players.length) {
      const counts = {};
      Object.values(room.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topVotes = sorted.filter(([, count]) => count === sorted[0][1]);
      const liar = room.players.find(p => p.role === 'liar');
      const selectedId = topVotes.length === 1 ? topVotes[0][0] : null;

      room.status = 'ended';
      room.result = {
        liarId: liar.id,
        liarNickname: liar.nickname,
        word: room.word,
        selectedId,
        selectedNickname: selectedId ? room.players.find(p => p.id === selectedId)?.nickname : null,
        success: selectedId === liar.id,
        tie: topVotes.length > 1,
        counts
      };
    }

    callback?.({ ok: true });
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on('game:reset', () => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) return;
    room.status = 'waiting';
    room.word = null;
    room.votes = {};
    room.result = null;
    room.players.forEach(p => p.role = null);
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);
    delete room.votes[socket.id];
    Object.keys(room.votes).forEach(voterId => {
      if (room.votes[voterId] === socket.id) delete room.votes[voterId];
    });

    if (room.players.length === 0) {
      rooms.delete(roomCode);
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
    }

    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Liar game server running on port ${PORT}`);
});
