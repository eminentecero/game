const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const WORD_BANKS = {
  situation: [
    "휴대폰 배터리가 1%일 때",
    "단톡방 헷갈려서 말실수 했을 때",
    "지하철을 반대로 탔을 때",
    "이어폰 한쪽을 잃어버렸는데 주머니에 있을 때",
    "비밀번호가 기억 안 날 때",
    "발표자로 갑자기 내가 지목됐을 때",
    "라이어게임에서 내가 라이어일 때",
    "라이어게임에서 내가 라이어로 몰렸을 때",
    "첫 출근하는 날",
    "엘리베이터 문 닫히는 순간 아는 사람을 봤을 때",
    "유리문인 줄 모르고 얼굴 박을 뻔했을 때",
    "아는 척했는데 모르는 사람일 때",
    "인사했는데 못 본 척당했을 때",
    "웃으면 안 되는 상황에서 웃음 터질 때",
    "선생님이 '이거 아는 사람?'했는데 눈 마주쳤을 때",
    "자기 직전에 바퀴벌레를 보았을 때",
    "고백각인 줄 알았는데 부탁이었을 때",
  ],
  animal: [
    "고양이", "강아지", "펭귄", "돌고래", "코끼리", "토끼", "사자", "기린",
    "햄스터", "판다", "오리너구리", "해파리", "플라밍고", "상어", "카멜레온", "치타",
  ],
  place: [
    "도서관", "영화관", "놀이공원", "한강", "공항", "찜질방", "카페", "노래방",
    "수영장", "미술관", "보드게임 카페", "학교", "하이디라오", "기차역", "병원", "은행",
    "PC방", "동물원", "지하철역", "방탈출카페",
  ],
  food: ["된장찌개", "떡볶이", "비빔밥", "라면", "샌드위치", "초밥", "햄버거", "훠궈"],
  job: [
    "교사", "경찰관", "사육사", "상담사", "군의관", "개발자", "해커", "스트리머",
    "아나운서", "영화감독", "셰프", "요가 강사", "통역사",
  ],
  movie: [
    "기생충", "명량", "극한직업", "올드보이", "엽기적인 그녀", "타짜", "아가씨", "곡성",
    "아저씨", "라라랜드", "타이타닉", "아바타", "겨울왕국", "인사이드 아웃", "토이 스토리",
    "알라딘", "어벤져스", "맘마미아", "레미제라블", "파묘",
  ],
};

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function assignYangWords(players) {
  const submissions = players.map((p) => p.yangSubmission?.trim()).filter(Boolean);
  if (submissions.length !== players.length) return null;

  for (let attempt = 0; attempt < 300; attempt++) {
    const shuffled = shuffle(submissions);
    const valid = players.every((p, idx) => shuffled[idx] !== p.yangSubmission);
    if (valid) {
      players.forEach((p, idx) => {
        p.yangWord = shuffled[idx];
      });
      return true;
    }
  }
  return false;
}

function getPublicRoom(room) {
  const base = {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    gameType: room.gameType,
    category: room.category,
    foolMode: room.foolMode,
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.id === room.hostId,
      connected: p.connected,
      hasYangSubmission: Boolean(p.yangSubmission),
      yangSolved: Boolean(p.yangSolved),
    })),
    votes: room.votes,
    result: room.result,
  };

  if (room.gameType === "yang" && room.status !== "waiting") {
    base.yangBoard = room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      word: p.yangWord,
    }));
  }

  return base;
}

function emitRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("room:update", getPublicRoom(room));
}

function getMyInfo(room, socketId) {
  const player = room.players.find((p) => p.id === socketId);
  if (!player) return null;

  const gameIsVisible = room.status === "playing" || room.status === "ended";
  const isPlayingFoolMode = room.gameType === "liar" && room.foolMode && room.status === "playing";

  if (room.gameType === "yang") {
    return {
      id: player.id,
      nickname: player.nickname,
      isHost: player.id === room.hostId,
      role: null,
      word: null,
      yangSubmission: player.yangSubmission || "",
      yangWord: gameIsVisible ? player.yangWord : null,
      yangGuess: player.yangGuess || "",
      yangSolved: Boolean(player.yangSolved),
      yangGuessResult: player.yangGuessResult || null,
    };
  }

  return {
    id: player.id,
    nickname: player.nickname,
    isHost: player.id === room.hostId,
    role: gameIsVisible ? (isPlayingFoolMode ? "normal" : player.role) : null,
    word: gameIsVisible
      ? room.foolMode
        ? player.role === "liar"
          ? room.liarWord
          : room.word
        : player.role === "liar"
        ? null
        : room.word
      : null,
    liarHint:
      gameIsVisible && !room.foolMode && player.role === "liar"
        ? "당신은 라이어입니다. 다른 사람들의 설명을 듣고 제시어를 추리하세요."
        : null,
  };
}

function emitPrivateInfo(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  room.players.forEach((player) => io.to(player.id).emit("me:update", getMyInfo(room, player.id)));
}

app.get("/healthz", (req, res) => {
  res.status(200).json({ ok: true, service: "gyosaeng-ttini-arcade" });
});

app.use(express.static(path.join(__dirname, "public")));

app.get(["/liar", "/yang", "/room/:code"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function getDefaultRoomCode(gameType) {
  return gameType === "yang" ? "YANG" : "LIAR";
}

function createSharedRoom(socket, nickname, gameType) {
  const type = gameType === "yang" ? "yang" : "liar";
  const code = getDefaultRoomCode(type);
  const room = {
    code,
    hostId: socket.id,
    status: "waiting",
    gameType: type,
    category: "animal",
    foolMode: false,
    word: null,
    liarWord: null,
    players: [
      {
        id: socket.id,
        nickname,
        role: null,
        connected: true,
        yangSubmission: "",
        yangWord: null,
        yangSolved: false,
      },
    ],
    votes: {},
    result: null,
  };

  rooms.set(code, room);
  socket.join(code);
  socket.data.roomCode = code;
  return room;
}

function joinSharedRoom(socket, room, nickname) {
  room.players.push({
    id: socket.id,
    nickname,
    role: null,
    connected: true,
    yangSubmission: "",
    yangWord: null,
    yangSolved: false,
  });
  socket.join(room.code);
  socket.data.roomCode = room.code;
}

io.on("connection", (socket) => {
  socket.on("room:enter", ({ nickname, gameType }, callback) => {
    const cleanName = String(nickname || "").trim().slice(0, 12);
    if (!cleanName) return callback?.({ ok: false, message: "닉네임을 입력해 주세요." });

    const type = gameType === "yang" ? "yang" : "liar";
    const code = getDefaultRoomCode(type);
    let room = rooms.get(code);

    if (!room) {
      room = createSharedRoom(socket, cleanName, type);
    } else {
      if (room.status !== "waiting") {
        return callback?.({ ok: false, message: "지금은 게임이 진행 중이에요. 끝난 뒤 다시 입장해 주세요." });
      }
      if (room.players.length >= 10) {
        return callback?.({ ok: false, message: "최대 10명까지만 입장할 수 있습니다." });
      }
      if (room.players.some((p) => p.nickname === cleanName)) {
        return callback?.({ ok: false, message: "이미 사용 중인 닉네임입니다." });
      }
      joinSharedRoom(socket, room, cleanName);
    }

    callback?.({ ok: true, code, gameType: type });
    emitRoom(code);
    emitPrivateInfo(code);
  });

  socket.on("room:create", ({ nickname, gameType }, callback) => {
    const cleanName = String(nickname || "").trim().slice(0, 12);
    if (!cleanName) return callback?.({ ok: false, message: "닉네임을 입력해 주세요." });

    const type = gameType === "yang" ? "yang" : "liar";
    let code;
    do { code = makeRoomCode(); } while (rooms.has(code));

    const room = {
      code,
      hostId: socket.id,
      status: "waiting",
      gameType: type,
      category: "animal",
      foolMode: false,
      word: null,
      liarWord: null,
      players: [
        {
          id: socket.id,
          nickname: cleanName,
          role: null,
          connected: true,
          yangSubmission: "",
          yangWord: null,
          yangGuess: "",
          yangSolved: false,
          yangGuessResult: null,
        },
      ],
      votes: {},
      result: null,
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    callback?.({ ok: true, code, gameType: type });
    emitRoom(code);
    emitPrivateInfo(code);
  });

  socket.on("room:join", ({ code, nickname }, callback) => {
    const roomCode = String(code || "").trim().toUpperCase();
    const cleanName = String(nickname || "").trim().slice(0, 12);
    const room = rooms.get(roomCode);

    if (!room) return callback?.({ ok: false, message: "존재하지 않는 방입니다." });
    if (!cleanName) return callback?.({ ok: false, message: "닉네임을 입력해 주세요." });
    if (room.status !== "waiting") return callback?.({ ok: false, message: "이미 게임이 시작된 방입니다." });
    if (room.players.length >= 10) return callback?.({ ok: false, message: "최대 10명까지만 입장할 수 있습니다." });
    if (room.players.some((p) => p.nickname === cleanName)) return callback?.({ ok: false, message: "이미 사용 중인 닉네임입니다." });

    room.players.push({
      id: socket.id,
      nickname: cleanName,
      role: null,
      connected: true,
      yangSubmission: "",
      yangWord: null,
      yangGuess: "",
      yangSolved: false,
      yangGuessResult: null,
    });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    callback?.({ ok: true, code: roomCode, gameType: room.gameType });
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on("game:setCategory", ({ category }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id || room.status !== "waiting" || room.gameType !== "liar") return;
    if (!WORD_BANKS[category]) return;
    room.category = category;
    emitRoom(roomCode);
  });

  socket.on("game:setFoolMode", ({ enabled }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id || room.status !== "waiting" || room.gameType !== "liar") return;
    room.foolMode = Boolean(enabled);
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on("yang:setSubmission", ({ word }, callback) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.gameType !== "yang" || room.status !== "waiting") {
      return callback?.({ ok: false, message: "지금은 제시어를 입력할 수 없습니다." });
    }
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return callback?.({ ok: false, message: "플레이어를 찾을 수 없습니다." });

    const cleanWord = String(word || "").trim().slice(0, 20);
    if (!cleanWord) return callback?.({ ok: false, message: "제시어를 입력해 주세요." });

    player.yangSubmission = cleanWord;
    callback?.({ ok: true });
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on("game:start", (callback) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return callback?.({ ok: false, message: "방을 찾을 수 없습니다." });
    if (room.hostId !== socket.id) return callback?.({ ok: false, message: "방장만 시작할 수 있습니다." });
    if (room.players.length < 3) return callback?.({ ok: false, message: "최소 3명 이상 필요합니다." });

    if (room.gameType === "yang") {
      const missing = room.players.filter((p) => !p.yangSubmission?.trim()).map((p) => p.nickname);
      if (missing.length > 0) {
        return callback?.({ ok: false, message: `아직 제시어를 입력하지 않은 사람이 있어요: ${missing.join(", ")}` });
      }
      const duplicated = new Set(room.players.map((p) => p.yangSubmission.trim())).size !== room.players.length;
      if (duplicated) {
        return callback?.({ ok: false, message: "양세찬 게임에서는 제시어가 서로 달라야 해요." });
      }
      const assigned = assignYangWords(room.players);
      if (!assigned) return callback?.({ ok: false, message: "제시어 배정에 실패했어요. 단어를 바꿔 다시 시도해 주세요." });
      room.players.forEach((p) => {
        p.yangGuess = "";
        p.yangSolved = false;
        p.yangGuessResult = null;
      });
      room.status = "playing";
      room.votes = {};
      room.result = null;
      callback?.({ ok: true });
      emitRoom(roomCode);
      emitPrivateInfo(roomCode);
      return;
    }

    const words = WORD_BANKS[room.category] || WORD_BANKS.animal;
    if (room.foolMode && words.length < 2) {
      return callback?.({ ok: false, message: "바보 라이어 모드는 카테고리에 단어가 최소 2개 이상 필요합니다." });
    }

    const normalWord = words[Math.floor(Math.random() * words.length)];
    let liarWord = null;
    if (room.foolMode) {
      const liarCandidates = words.filter((word) => word !== normalWord);
      liarWord = liarCandidates[Math.floor(Math.random() * liarCandidates.length)];
    }

    room.word = normalWord;
    room.liarWord = liarWord;
    room.status = "playing";
    room.votes = {};
    room.result = null;

    const liarIndex = Math.floor(Math.random() * room.players.length);
    room.players.forEach((p, idx) => { p.role = idx === liarIndex ? "liar" : "normal"; });

    callback?.({ ok: true });
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on("game:vote", ({ targetId }, callback) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.status !== "playing" || room.gameType !== "liar") {
      return callback?.({ ok: false, message: "투표할 수 없는 상태입니다." });
    }
    const voter = room.players.find((p) => p.id === socket.id);
    const target = room.players.find((p) => p.id === targetId);
    if (!voter || !target) return callback?.({ ok: false, message: "대상을 찾을 수 없습니다." });

    room.votes[socket.id] = targetId;

    if (Object.keys(room.votes).length === room.players.length) {
      const counts = {};
      Object.values(room.votes).forEach((id) => (counts[id] = (counts[id] || 0) + 1));
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topVotes = sorted.filter(([, count]) => count === sorted[0][1]);
      const liar = room.players.find((p) => p.role === "liar");
      const selectedId = topVotes.length === 1 ? topVotes[0][0] : null;

      room.status = "ended";
      room.result = {
        liarId: liar.id,
        liarNickname: liar.nickname,
        word: room.word,
        liarWord: room.liarWord,
        foolMode: room.foolMode,
        selectedId,
        selectedNickname: selectedId ? room.players.find((p) => p.id === selectedId)?.nickname : null,
        success: selectedId === liar.id,
        tie: topVotes.length > 1,
        counts,
      };
    }

    callback?.({ ok: true });
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });


  socket.on("yang:guess", ({ guess }, callback) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.gameType !== "yang" || room.status !== "playing") {
      return callback?.({ ok: false, message: "지금은 정답을 입력할 수 없습니다." });
    }

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return callback?.({ ok: false, message: "플레이어를 찾을 수 없습니다." });

    const cleanGuess = String(guess || "").trim().slice(0, 20);
    if (!cleanGuess) return callback?.({ ok: false, message: "추측한 제시어를 입력해 주세요." });

    const normalize = (value) => String(value || "").trim().replace(/\s+/g, "").toLowerCase();
    const correct = normalize(cleanGuess) === normalize(player.yangWord);

    player.yangGuess = cleanGuess;
    player.yangSolved = correct;
    player.yangGuessResult = correct ? "correct" : "wrong";

    callback?.({
      ok: true,
      correct,
      message: correct ? "정답입니다!" : "아직 아니에요. 다시 질문해 보세요.",
    });
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on("yang:finish", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id || room.gameType !== "yang") return;
    room.status = "ended";
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on("game:reset", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) return;
    room.status = "waiting";
    room.word = null;
    room.liarWord = null;
    room.votes = {};
    room.result = null;
    room.players.forEach((p) => {
      p.role = null;
      p.yangWord = null;
      p.yangGuess = "";
      p.yangSolved = false;
      p.yangGuessResult = null;
      // 제출한 제시어는 다시 하기를 편하게 하려고 유지합니다.
    });
    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);
    delete room.votes[socket.id];
    Object.keys(room.votes).forEach((voterId) => {
      if (room.votes[voterId] === socket.id) delete room.votes[voterId];
    });

    if (room.players.length === 0) {
      rooms.delete(roomCode);
      return;
    }
    if (room.hostId === socket.id) room.hostId = room.players[0].id;

    emitRoom(roomCode);
    emitPrivateInfo(roomCode);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Gyosaeng Ttini Arcade server running on port ${PORT}`);
});
