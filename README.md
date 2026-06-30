# 온라인 라이어게임 — 인터넷 배포용

10명 정도가 링크로 접속해서 즐길 수 있는 간단한 웹 기반 라이어게임입니다.

이 버전은 `localhost` 전용이 아니라, Render 같은 Node.js 서버에 올리면 `https://...onrender.com` 형태의 공개 주소로 접속할 수 있게 구성되어 있습니다.

## 기능

- 방 만들기
- 초대 링크 복사
- 닉네임으로 입장
- 최대 10명 입장
- 방장만 게임 시작 가능
- 라이어 1명 자동 랜덤 배정
- 일반 참가자에게만 제시어 공개
- 라이어에게는 라이어 안내만 공개
- 투표
- 결과 공개
- 다시하기

## 프로젝트 구조

```text
liar-game-online/
├─ server.js          # Express + Socket.IO 서버
├─ package.json       # 실행/의존성 설정
├─ render.yaml        # Render 배포 설정
├─ public/
│  ├─ index.html      # 화면
│  ├─ app.js          # 클라이언트 로직
│  └─ style.css       # 디자인
└─ README.md
```

## 로컬 테스트

```bash
npm install
npm start
```

브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:3000
```

## 인터넷에 공개 배포하기: Render 추천

### 1. GitHub 저장소 만들기

1. 이 폴더를 압축 해제합니다.
2. GitHub에서 새 저장소를 만듭니다.
3. 압축을 푼 파일들을 저장소에 업로드합니다.

### 2. Render에서 Web Service 만들기

1. Render에 로그인합니다.
2. `New +` → `Web Service`를 선택합니다.
3. GitHub 저장소를 연결합니다.
4. 아래처럼 설정합니다.

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /healthz
```

이 저장소에는 `render.yaml`이 포함되어 있어서 Render가 설정을 자동으로 읽을 수도 있습니다.

### 3. 배포 완료 후 사용하기

배포가 끝나면 Render가 아래와 비슷한 주소를 만들어 줍니다.

```text
https://liar-game-online.onrender.com
```

이 주소에 접속해서 방을 만들면 초대 링크가 아래처럼 생성됩니다.

```text
https://liar-game-online.onrender.com/room/ABCDE
```

이 링크를 친구들에게 보내면 같은 와이파이가 아니어도 각자 휴대폰/노트북에서 접속할 수 있습니다.

## 중요한 구현 포인트

서버는 Render 같은 플랫폼이 제공하는 `PORT` 환경 변수를 사용하고, 외부 접속이 가능하도록 `0.0.0.0`에 바인딩합니다.

```js
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Liar game server running on port ${PORT}`);
});
```

클라이언트는 특정 localhost 주소에 고정하지 않고 현재 접속한 사이트 주소를 기준으로 Socket.IO에 연결합니다.

```js
const socket = io();
```

그래서 로컬에서는 `localhost:3000`으로, 배포 후에는 Render 주소로 자동 연결됩니다.

## 주의

현재 버전은 DB 없이 서버 메모리에 방 정보를 저장합니다.

- 서버가 재시작되면 방은 사라집니다.
- 무료 서버는 일정 시간 접속이 없으면 잠들 수 있습니다.
- 10명 내외의 가벼운 놀이용으로는 충분합니다.

나중에 방을 오래 유지하고 싶다면 Redis나 Supabase 같은 저장소를 붙이면 됩니다.
