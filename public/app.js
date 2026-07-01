const socket = io();

let currentRoom = null;
let me = null;
let selectedGameType = "liar";
let showResultWord = false;

const $ = (id) => document.getElementById(id);
const entry = $("entry");
const roomSection = $("room");
const home = $("home");
const nicknameInput = $("nickname");
const roomCodeInput = $("roomCode");
const entryMessage = $("entryMessage");
const roomMessage = $("roomMessage");
const yangMessage = $("yangMessage");
const yangGuessMessage = $("yangGuessMessage");

const GAME_META = {
  liar: {
    title: "라이어 게임 입장",
    label: "라이어 게임",
    desc: "한 명만 정답을 모르는 게임. 일반 모드와 바보 라이어 모드를 지원해요.",
  },
  yang: {
    title: "양세찬 게임 입장",
    label: "양세찬 게임",
    desc: "내 제시어만 나만 모르는 게임. 각자 제시어를 입력한 뒤 무작위로 배정돼요.",
  },
};

function getCodeFromPath() {
  const match = location.pathname.match(/\/room\/([A-Z0-9]+)/i);
  return match ? match[1].toUpperCase() : "";
}

function setMessage(target, text) {
  if (target) target.textContent = text || "";
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectGame(gameType) {
  selectedGameType = gameType === "yang" ? "yang" : "liar";
  const meta = GAME_META[selectedGameType];
  $("selectedGameTitle").textContent = meta.title;
  $("selectedGameDesc").textContent = meta.desc;

  document.querySelectorAll("[data-game-card]").forEach((card) => {
    card.classList.toggle("selected", card.dataset.gameCard === selectedGameType);
  });
}

function showArcadeHome() {
  home.classList.remove("hidden");
  entry.classList.add("hidden");
  roomSection.classList.add("hidden");
}

function showEntryOnly(gameType = selectedGameType) {
  selectGame(gameType);
  home.classList.add("hidden");
  entry.classList.remove("hidden");
  roomSection.classList.add("hidden");
  setMessage(entryMessage, "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showRoom() {
  home.classList.add("hidden");
  entry.classList.add("hidden");
  roomSection.classList.remove("hidden");
}

function updateRoom(room) {
  const wasEnded = currentRoom?.status === "ended";
  const isNowEnded = room.status === "ended";

  if (!isNowEnded || !wasEnded) showResultWord = false;

  currentRoom = room;
  showRoom();

  const isLiarGame = room.gameType !== "yang";
  $("roomTitle").textContent = room.code;
  $("roomGameLabel").textContent = GAME_META[room.gameType]?.label || "게임방";

  $("liarSettings").classList.toggle("hidden", !isLiarGame);
  $("yangSettings").classList.toggle("hidden", isLiarGame);
  $("yangSubmission").classList.toggle("hidden", isLiarGame || room.status !== "waiting");
  $("yangGuessBox").classList.toggle("hidden", isLiarGame || room.status !== "playing");
  $("votePanel").classList.toggle("hidden", !isLiarGame);
  $("yangBoard").classList.toggle("hidden", isLiarGame || room.status === "waiting");
  $("finishYangGame").classList.toggle("hidden", isLiarGame || room.status !== "playing");

  if (isLiarGame) {
    $("category").value = room.category;
    $("category").disabled = room.status !== "waiting";
    $("foolMode").checked = Boolean(room.foolMode);
    $("foolMode").disabled = room.status !== "waiting";
  }

  const isHost = me && me.isHost;
  $("hostControls").classList.toggle("hidden", !isHost);
  $("startGame").classList.toggle("hidden", room.status !== "waiting");
  $("resetGame").classList.toggle("hidden", room.status === "waiting");

  renderPlayers(room.players);
  renderVoteArea();
  renderYangBoard();
  renderResult();
}

function updateMe(info) {
  me = info;
  if (!me) return;
  if (currentRoom) updateRoom(currentRoom);
  renderMyCard();
  renderVoteArea();
  renderYangBoard();
  if ($("yangWordInput") && currentRoom?.gameType === "yang" && currentRoom.status === "waiting") {
    $("yangWordInput").value = me.yangSubmission || "";
  }

  if ($("yangGuessInput") && currentRoom?.gameType === "yang" && currentRoom.status === "playing") {
    $("yangGuessInput").disabled = Boolean(me.yangSolved);
    $("submitYangGuess").disabled = Boolean(me.yangSolved);
    if (me.yangSolved) {
      $("yangGuessInput").value = me.yangGuess || "";
      setMessage(yangGuessMessage, "정답입니다! 이제 다른 사람이 맞히는 걸 지켜보세요.");
    } else if (me.yangGuessResult === "wrong") {
      setMessage(yangGuessMessage, `마지막 추측 “${me.yangGuess}”은(는) 아니에요.`);
    } else {
      setMessage(yangGuessMessage, "");
    }
  }
}

function renderMyCard() {
  const card = $("myCard");
  const title = $("myStatus");
  const detail = $("myDetail");
  if (!currentRoom || !me) return;

  card.classList.remove("liar-card", "civilian-card", "yang-card");

  if (currentRoom.status === "waiting") {
    title.textContent = `${me.nickname}님, 대기 중입니다.`;
    if (currentRoom.gameType === "yang") {
      detail.textContent = "제시어를 입력하고 기다려 주세요. 모든 사람이 제출하면 방장이 시작할 수 있어요.";
    } else {
      detail.textContent = me.isHost
        ? "카테고리와 모드를 고른 뒤 게임 시작 버튼을 눌러 주세요."
        : "방장이 게임을 시작하면 제시어가 표시됩니다.";
    }
    return;
  }

  if (currentRoom.gameType === "yang") {
    card.classList.add("yang-card");
    title.textContent = me.yangSolved ? `정답 확인: ${me.yangGuess}` : "내 제시어는 비공개!";
    detail.textContent = me.yangSolved
      ? "정답을 맞혔어요. 다른 플레이어가 계속 추리할 수 있도록 힌트를 조절해 주세요."
      : "다른 사람들에게 질문하면서 내 머리 위 제시어를 맞혀 보세요.";
    return;
  }

  if (me.role === "liar") {
    card.classList.add("liar-card");
    title.textContent = "당신은 라이어입니다.";
    detail.textContent = "다른 사람의 설명을 듣고 제시어를 추리하세요. 너무 티 나지 않게 말하는 게 핵심!";
  } else {
    card.classList.add("civilian-card");
    title.textContent = `제시어: ${me.word}`;
    detail.textContent = currentRoom.foolMode
      ? "모든 사람에게 제시어가 표시됩니다. 단, 누군가는 같은 카테고리의 다른 단어를 받았을 수 있어요."
      : "라이어가 눈치채지 못하게, 너무 직접적이지 않게 설명해 보세요.";
  }
}

function renderPlayers(players) {
  const list = $("players");
  list.innerHTML = "";
  players.forEach((player) => {
    const li = document.createElement("li");
    let readyBadge = "";
    if (currentRoom?.gameType === "yang" && currentRoom.status === "waiting") {
      readyBadge = player.hasYangSubmission ? '<span class="badge ready">제출</span>' : '<span class="badge">미제출</span>';
    } else if (currentRoom?.gameType === "yang" && currentRoom.status === "playing") {
      readyBadge = player.yangSolved ? '<span class="badge ready">정답</span>' : '<span class="badge">추리 중</span>';
    }
    li.innerHTML = `<span class="player-name">${escapeHtml(player.nickname)}</span><span>${
      player.isHost ? '<span class="badge">방장</span>' : ""
    }${player.id === socket.id ? '<span class="badge me">나</span>' : ""}${readyBadge}</span>`;
    list.appendChild(li);
  });
}

function renderVoteArea() {
  const area = $("voteArea");
  if (!currentRoom || !me || currentRoom.gameType !== "liar") return;

  if (currentRoom.status === "waiting") {
    area.textContent = "게임이 시작되면 투표할 수 있어요.";
    return;
  }
  if (currentRoom.status === "ended") {
    area.textContent = "투표가 종료되었습니다.";
    return;
  }

  area.innerHTML = "";
  currentRoom.players.forEach((player) => {
    const card = document.createElement("div");
    const voteCount = Object.values(currentRoom.votes || {}).filter((id) => id === player.id).length;
    const alreadyVoted = Boolean(currentRoom.votes?.[socket.id]);
    card.className = "vote-card";
    card.innerHTML = `<span>${escapeHtml(player.nickname)} <span class="badge">${voteCount}표</span></span>`;
    const button = document.createElement("button");
    button.textContent = alreadyVoted ? "투표 완료" : "투표";
    button.disabled = alreadyVoted;
    button.addEventListener("click", () => vote(player.id));
    card.appendChild(button);
    area.appendChild(card);
  });
}

function renderYangBoard() {
  const list = $("yangBoardList");
  if (!list || !currentRoom || currentRoom.gameType !== "yang" || currentRoom.status === "waiting") return;

  list.innerHTML = "";
  (currentRoom.yangBoard || []).forEach((item) => {
    const isMine = item.id === socket.id;
    const card = document.createElement("div");
    card.className = `yang-board-card${isMine ? " mine" : ""}`;
    const playerState = currentRoom.players.find((p) => p.id === item.id);
    const solvedBadge = playerState?.yangSolved ? ' <span class="badge ready">정답</span>' : "";
    card.innerHTML = `
      <span class="player-name">${escapeHtml(item.nickname)}${isMine ? ' <span class="badge me">나</span>' : ""}${solvedBadge}</span>
      <span class="word">${isMine ? "???" : escapeHtml(item.word)}</span>
    `;
    list.appendChild(card);
  });
}

function renderResult() {
  const resultBox = $("result");
  if (!currentRoom || currentRoom.status !== "ended") {
    resultBox.classList.add("hidden");
    resultBox.innerHTML = "";
    return;
  }

  if (currentRoom.gameType === "yang") {
    resultBox.classList.remove("hidden");
    resultBox.innerHTML = `
      <h3>게임 종료</h3>
      <p>양세찬 게임이 종료되었습니다. 다시 하려면 방장이 대기방으로 돌려 주세요.</p>
    `;
    return;
  }

  if (!currentRoom.result) {
    resultBox.classList.add("hidden");
    resultBox.innerHTML = "";
    return;
  }

  const r = currentRoom.result;
  resultBox.classList.remove("hidden");

  const selectedText = r.tie
    ? "최다 득표자가 여러 명이라 지목 실패!"
    : `최종 지목: <strong>${escapeHtml(r.selectedNickname || "없음")}</strong>`;
  const verdict = r.success ? "시민팀 성공! 라이어를 맞혔어요." : "라이어 승리! 라이어를 잡지 못했어요.";
  const isLiar = me?.role === "liar";

  let wordHtml = "";
  if (isLiar && !showResultWord) {
    wordHtml = `
      <p>제시어는 아직 공개되지 않았습니다.</p>
      <button id="showResultWord" type="button">제시어 보기</button>
    `;
  } else if (r.foolMode) {
    wordHtml = `
      <p>시민 제시어는 <strong>${escapeHtml(r.word)}</strong>였습니다.</p>
      <p>바보 라이어 제시어는 <strong>${escapeHtml(r.liarWord)}</strong>였습니다.</p>
    `;
  } else {
    wordHtml = `<p>제시어는 <strong>${escapeHtml(r.word)}</strong>였습니다.</p>`;
  }

  resultBox.innerHTML = `
    <h3>결과 공개</h3>
    <p>${selectedText}</p>
    <p>라이어는 <strong>${escapeHtml(r.liarNickname)}</strong>였습니다.</p>
    ${wordHtml}
    <p class="verdict"><strong>${verdict}</strong></p>
  `;

  const showButton = $("showResultWord");
  if (showButton) {
    showButton.addEventListener("click", () => {
      showResultWord = true;
      renderResult();
    });
  }
}

function createRoom() {
  setMessage(entryMessage, "");
  socket.emit("room:create", { nickname: nicknameInput.value, gameType: selectedGameType }, (res) => {
    if (!res.ok) return setMessage(entryMessage, res.message);
    history.pushState(null, "", `/room/${res.code}`);
  });
}

function joinRoom() {
  setMessage(entryMessage, "");
  const code = (roomCodeInput.value || getCodeFromPath()).toUpperCase();
  socket.emit("room:join", { code, nickname: nicknameInput.value }, (res) => {
    if (!res.ok) return setMessage(entryMessage, res.message);
    history.pushState(null, "", `/room/${res.code}`);
  });
}

function startGame() {
  socket.emit("game:start", (res) => {
    if (!res.ok) setMessage(roomMessage, res.message);
  });
}

function vote(targetId) {
  socket.emit("game:vote", { targetId }, (res) => {
    if (!res.ok) setMessage(roomMessage, res.message);
  });
}

function submitYangWord() {
  setMessage(yangMessage, "");
  socket.emit("yang:setSubmission", { word: $("yangWordInput").value }, (res) => {
    if (!res.ok) return setMessage(yangMessage, res.message);
    setMessage(yangMessage, "제시어를 제출했어요.");
  });
}

function submitYangGuess() {
  setMessage(yangGuessMessage, "");
  socket.emit("yang:guess", { guess: $("yangGuessInput").value }, (res) => {
    if (!res.ok) return setMessage(yangGuessMessage, res.message);
    setMessage(yangGuessMessage, res.message);
    if (res.correct) {
      $("yangGuessInput").disabled = true;
      $("submitYangGuess").disabled = true;
    }
  });
}


document.querySelectorAll("[data-select-game]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    showEntryOnly(button.dataset.selectGame);
  });
});
document.querySelectorAll("[data-game-card]").forEach((card) => {
  card.addEventListener("click", () => showEntryOnly(card.dataset.gameCard));
});
$("backToArcade").addEventListener("click", showArcadeHome);

$("createRoom").addEventListener("click", createRoom);
$("joinRoom").addEventListener("click", joinRoom);
$("startGame").addEventListener("click", startGame);
$("resetGame").addEventListener("click", () => socket.emit("game:reset"));
$("finishYangGame").addEventListener("click", () => socket.emit("yang:finish"));
$("submitYangWord").addEventListener("click", submitYangWord);
$("yangWordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitYangWord();
});
$("submitYangGuess").addEventListener("click", submitYangGuess);
$("yangGuessInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitYangGuess();
});
$("category").addEventListener("change", (e) => socket.emit("game:setCategory", { category: e.target.value }));
$("foolMode").addEventListener("change", (e) => socket.emit("game:setFoolMode", { enabled: e.target.checked }));
$("copyLink").addEventListener("click", async () => {
  const link = `${location.origin}/room/${currentRoom.code}`;
  await navigator.clipboard.writeText(link);
  setMessage(roomMessage, "초대 링크를 복사했어요.");
});
$("backHome").addEventListener("click", () => {
  history.pushState(null, "", "/");
  currentRoom = null;
  me = null;
  showArcadeHome();
});

socket.on("room:update", updateRoom);
socket.on("me:update", updateMe);

selectGame("liar");
showArcadeHome();
const initialCode = getCodeFromPath();
if (initialCode) {
  roomCodeInput.value = initialCode;
  home.classList.add("hidden");
  entry.classList.remove("hidden");
  roomSection.classList.add("hidden");
  setMessage(entryMessage, "닉네임을 입력한 뒤 입장해 주세요.");
}
