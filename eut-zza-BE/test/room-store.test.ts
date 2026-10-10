import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidGameProgressError,
  RoomAudioNotPreparedError,
  RoomBeatmapChangedError,
  RoomBeatmapNotSelectedError,
  RoomFullError,
  RoomHostRequiredError,
  RoomNotEnoughParticipantsError,
  RoomNotFoundError,
  RoomNotWaitingError,
  RoomParticipantNotFoundError,
  RoomParticipantsNotReadyError,
  RoomSelectionLockedError,
  UserAlreadyInRoomError,
} from "../src/domain/room.js";
import { RoomStore } from "../src/services/room-service.js";

test("방을 만들면 생성자가 방장이자 첫 참가자가 된다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");

  assert.equal(room.hostUserId, "host");
  assert.equal(room.status, "waiting");
  assert.equal(room.selectedBeatmapId, null);
  assert.equal(room.participants[0]?.isReady, false);
  assert.equal(room.participants[0]?.preparedBeatmapId, null);
  assert.equal(room.currentGame, null);
  assert.deepEqual(room.participants.map(({ userId }) => userId), ["host"]);
  assert.deepEqual(store.listRooms(), [room]);
});

test("자동 매칭은 2~4명의 고유 사용자를 정원 내 한 방으로 만든다", () => {
  for (const count of [2, 3, 4]) {
    const store = new RoomStore();
    const userIds = Array.from({ length: count }, (_, index) => `user-${index + 1}`);
    const room = store.createMatchedRoom(userIds);

    assert.equal(room.hostUserId, "user-1");
    assert.deepEqual(room.participants.map(({ userId }) => userId), userIds);
  }

  const store = new RoomStore();
  assert.throws(() => store.createMatchedRoom(["one"]));
  assert.throws(() => store.createMatchedRoom(["same", "same"]));
  assert.throws(() => store.createMatchedRoom(["1", "2", "3", "4", "5"]));
});

test("방장만 채보를 선택하고, 선택 전에는 준비할 수 없다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  store.joinRoom(room.id, "guest");

  assert.throws(() => store.setReady(room.id, "guest", "1", true), RoomBeatmapNotSelectedError);
  assert.throws(() => store.selectBeatmap(room.id, "guest", "1"), RoomHostRequiredError);
  assert.equal(store.selectBeatmap(room.id, "host", "1").selectedBeatmapId, "1");
});

test("일부만 준비했다면 채보를 변경해도 기존 준비 상태를 유지한다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  store.joinRoom(room.id, "guest");
  store.selectBeatmap(room.id, "host", "1");
  store.setReady(room.id, "guest", "1", true);

  const updated = store.selectBeatmap(room.id, "host", "2");

  assert.equal(updated.selectedBeatmapId, "2");
  assert.equal(updated.participants.find(({ userId }) => userId === "guest")?.isReady, true);
  assert.throws(() => store.setReady(room.id, "host", "1", true), RoomBeatmapChangedError);
});

test("전원 준비하면 채보 변경을 막고, 준비 취소나 새 참가자 입장 후 다시 허용한다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  store.joinRoom(room.id, "guest");
  store.selectBeatmap(room.id, "host", "1");
  store.setReady(room.id, "host", "1", true);
  store.setReady(room.id, "guest", "1", true);

  assert.throws(() => store.selectBeatmap(room.id, "host", "2"), RoomSelectionLockedError);
  assert.equal(store.selectBeatmap(room.id, "host", "1").selectedBeatmapId, "1");

  store.setReady(room.id, "guest", "1", false);
  store.selectBeatmap(room.id, "host", "2");
  store.setReady(room.id, "guest", "2", true);
  assert.throws(() => store.selectBeatmap(room.id, "host", "3"), RoomSelectionLockedError);

  const joined = store.joinRoom(room.id, "new-guest");
  assert.equal(joined.participants.at(-1)?.isReady, false);
  assert.equal(store.selectBeatmap(room.id, "host", "3").selectedBeatmapId, "3");
});

test("방장이 퇴장하면 가장 먼저 입장한 남은 참가자가 방장이 된다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  store.joinRoom(room.id, "guest-1");
  store.joinRoom(room.id, "guest-2");

  const updated = store.leaveRoom(room.id, "host");

  assert.equal(updated?.hostUserId, "guest-1");
  assert.deepEqual(updated?.participants.map(({ userId }) => userId), ["guest-1", "guest-2"]);
  assert.equal(store.findRoomByUserId("host"), undefined);
  assert.equal(store.findRoomByUserId("guest-2")?.id, room.id);
});

test("마지막 참가자가 퇴장하면 방을 삭제한다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");

  assert.equal(store.leaveRoom(room.id, "host"), null);
  assert.equal(store.getRoom(room.id), undefined);
  assert.deepEqual(store.listRooms(), []);
  assert.throws(() => store.leaveRoom(room.id, "host"), RoomNotFoundError);
});

test("참가하지 않은 사용자는 방에서 퇴장할 수 없다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  assert.throws(() => store.leaveRoom(room.id, "stranger"), RoomParticipantNotFoundError);
});

test("같은 방 재입장은 참가자를 중복 추가하지 않는다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");

  store.joinRoom(room.id, "guest");
  const retriedRoom = store.joinRoom(room.id, "guest");

  assert.deepEqual(retriedRoom.participants.map(({ userId }) => userId), [
    "host",
    "guest",
  ]);
});

test("한 사용자가 동시에 여러 방에 들어갈 수 없다", () => {
  const store = new RoomStore();
  const firstRoom = store.createRoom("host-1");
  const secondRoom = store.createRoom("host-2");

  store.joinRoom(firstRoom.id, "guest");

  assert.throws(() => store.joinRoom(secondRoom.id, "guest"), UserAlreadyInRoomError);
  assert.throws(() => store.createRoom("guest"), UserAlreadyInRoomError);
});

test("없는 방 입장은 실패한다", () => {
  const store = new RoomStore();

  assert.throws(() => store.joinRoom("missing", "guest"), RoomNotFoundError);
});

test("동시 입장 요청에도 방 정원은 방장을 포함해 4명이다", async () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  const attempts = Array.from({ length: 10 }, (_, index) => `guest-${index}`);

  const results = await Promise.all(
    attempts.map(async (userId) => {
      try {
        store.joinRoom(room.id, userId);
        return "joined";
      } catch (error: unknown) {
        assert.ok(error instanceof RoomFullError);
        return "full";
      }
    }),
  );

  assert.equal(results.filter((result) => result === "joined").length, 3);
  assert.equal(results.filter((result) => result === "full").length, 7);
  assert.equal(store.listRooms()[0]?.participants.length, 4);
});

test("반환된 방 정보를 수정해도 내부 방 상태는 변하지 않는다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");

  room.participants.push({
    userId: "intruder",
    joinedAt: "now",
    isReady: false,
    preparedBeatmapId: null,
  });

  assert.deepEqual(store.listRooms()[0]?.participants.map(({ userId }) => userId), [
    "host",
  ]);
});

test("현재 선택된 채보의 음원을 준비한 참가자만 준비 채보를 기록한다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  store.selectBeatmap(room.id, "host", "1");

  assert.throws(
    () => store.markAudioPrepared(room.id, "host", "2"),
    RoomBeatmapChangedError,
  );
  assert.equal(
    store.markAudioPrepared(room.id, "host", "1").participants[0]?.preparedBeatmapId,
    "1",
  );
  assert.equal(store.clearAudioPrepared(room.id, "host")?.participants[0]?.preparedBeatmapId, null);
});

test("2명 이상이 준비 의사와 음원 준비를 모두 완료해야 시작을 잠근다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  store.selectBeatmap(room.id, "host", "1");
  store.setReady(room.id, "host", "1", true);
  store.markAudioPrepared(room.id, "host", "1");

  assert.throws(() => store.beginStart(room.id, "host"), RoomNotEnoughParticipantsError);

  store.joinRoom(room.id, "guest");
  assert.throws(() => store.beginStart(room.id, "host"), RoomParticipantsNotReadyError);
  store.setReady(room.id, "guest", "1", true);
  assert.throws(() => store.beginStart(room.id, "host"), RoomAudioNotPreparedError);
  store.markAudioPrepared(room.id, "guest", "1");

  assert.equal(store.beginStart(room.id, "host").status, "starting");
  assert.throws(() => store.beginStart(room.id, "host"), RoomNotWaitingError);
});

test("시작 완료 시 모든 참가자가 같은 경기와 각자의 참가 ID를 받는다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  store.joinRoom(room.id, "guest");
  store.selectBeatmap(room.id, "host", "1");

  for (const userId of ["host", "guest"]) {
    store.setReady(room.id, userId, "1", true);
    store.markAudioPrepared(room.id, userId, "1");
  }

  store.beginStart(room.id, "host");
  const started = store.completeStart(room.id, {
    gameSessionId: "10",
    beatmapId: "1",
    startAtServerMs: 1_000_000,
    resultDeadlineAtServerMs: 1_070_000,
    players: [
      { userId: "host", gamePlayerId: "20", score: 0, combo: 0, resultStatus: "playing" },
      { userId: "guest", gamePlayerId: "21", score: 0, combo: 0, resultStatus: "playing" },
    ],
    results: null,
  });

  assert.equal(started.status, "playing");
  assert.equal(started.currentGame?.gameSessionId, "10");
  assert.deepEqual(started.currentGame?.players.map(({ gamePlayerId }) => gamePlayerId), [
    "20",
    "21",
  ]);
});

test("완료된 경기에서 대기실로 돌아가면 참가자는 유지하고 준비 상태만 초기화한다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  store.joinRoom(room.id, "guest");
  store.selectBeatmap(room.id, "host", "1");
  for (const userId of ["host", "guest"]) {
    store.setReady(room.id, userId, "1", true);
    store.markAudioPrepared(room.id, userId, "1");
  }
  store.beginStart(room.id, "host");
  store.completeStart(room.id, {
    gameSessionId: "10",
    beatmapId: "1",
    startAtServerMs: 1_000_000,
    resultDeadlineAtServerMs: 1_070_000,
    players: [
      { userId: "host", gamePlayerId: "20", score: 1_000, combo: 1, resultStatus: "playing" },
      { userId: "guest", gamePlayerId: "21", score: 700, combo: 1, resultStatus: "playing" },
    ],
    results: null,
  });
  store.applyMultiplayerResultState(room.id, {
    gameSessionId: "10",
    status: "completed",
    players: [
      {
        userId: "host",
        email: "host@example.com",
        gamePlayerId: "20",
        resultStatus: "submitted",
        score: 1_000,
        perfectCount: 1,
        greatCount: 0,
        goodCount: 0,
        missCount: 0,
        maxCombo: 1,
        rank: 1,
        isWinner: true,
      },
      {
        userId: "guest",
        email: "guest@example.com",
        gamePlayerId: "21",
        resultStatus: "submitted",
        score: 700,
        perfectCount: 0,
        greatCount: 1,
        goodCount: 0,
        missCount: 0,
        maxCombo: 1,
        rank: 2,
        isWinner: false,
      },
    ],
  });

  const returned = store.returnToLobby(room.id, "host", "10");
  const retried = store.returnToLobby(room.id, "guest", "10");

  assert.equal(returned.status, "waiting");
  assert.equal(returned.currentGame, null);
  assert.equal(returned.lastCompletedGameSessionId, "10");
  assert.equal(returned.selectedBeatmapId, "1");
  assert.deepEqual(returned.participants.map(({ userId }) => userId), ["host", "guest"]);
  assert.ok(returned.participants.every(
    ({ isReady, preparedBeatmapId }) => !isReady && preparedBeatmapId === null,
  ));
  assert.deepEqual(retried, returned);
});

test("2명·3명·4명 방 모두 하나의 경기로 시작할 수 있다", () => {
  for (const participantCount of [2, 3, 4]) {
    const store = new RoomStore();
    const room = store.createRoom("user-1");
    const userIds = Array.from(
      { length: participantCount },
      (_, index) => `user-${index + 1}`,
    );
    for (const userId of userIds.slice(1)) store.joinRoom(room.id, userId);
    store.selectBeatmap(room.id, "user-1", "1");
    for (const userId of userIds) {
      store.setReady(room.id, userId, "1", true);
      store.markAudioPrepared(room.id, userId, "1");
    }

    store.beginStart(room.id, "user-1");
    const started = store.completeStart(room.id, {
      gameSessionId: `game-${participantCount}`,
      beatmapId: "1",
      startAtServerMs: 1_000_000,
      resultDeadlineAtServerMs: 1_070_000,
      players: userIds.map((userId, index) => ({
        userId,
        gamePlayerId: `player-${index + 1}`,
        score: 0,
        combo: 0,
        resultStatus: "playing",
      })),
      results: null,
    });

    assert.equal(started.currentGame?.players.length, participantCount);
    assert.equal(new Set(started.currentGame?.players.map(({ gamePlayerId }) => gamePlayerId)).size, participantCount);
  }
});

test("진행 중인 본인 점수와 콤보만 단조롭게 갱신한다", () => {
  const store = new RoomStore();
  const room = store.createRoom("host");
  store.joinRoom(room.id, "guest");
  store.selectBeatmap(room.id, "host", "1");
  for (const userId of ["host", "guest"]) {
    store.setReady(room.id, userId, "1", true);
    store.markAudioPrepared(room.id, userId, "1");
  }
  store.beginStart(room.id, "host");
  store.completeStart(room.id, {
    gameSessionId: "10",
    beatmapId: "1",
    startAtServerMs: 1_000_000,
    resultDeadlineAtServerMs: 1_070_000,
    players: [
      { userId: "host", gamePlayerId: "20", score: 0, combo: 0, resultStatus: "playing" },
      { userId: "guest", gamePlayerId: "21", score: 0, combo: 0, resultStatus: "playing" },
    ],
    results: null,
  });

  const updated = store.updateGameProgress(room.id, "guest", "10", 1_000, 1);
  assert.deepEqual(
    updated.currentGame?.players.find(({ userId }) => userId === "guest"),
    { userId: "guest", gamePlayerId: "21", score: 1_000, combo: 1, resultStatus: "playing" },
  );
  assert.throws(
    () => store.updateGameProgress(room.id, "guest", "10", 500, 2),
    InvalidGameProgressError,
  );
});
