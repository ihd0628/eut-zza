import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RoomBeatmapChangedError,
  RoomBeatmapNotSelectedError,
  RoomFullError,
  RoomHostRequiredError,
  RoomNotFoundError,
  RoomParticipantNotFoundError,
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
  assert.deepEqual(room.participants.map(({ userId }) => userId), ["host"]);
  assert.deepEqual(store.listRooms(), [room]);
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

  room.participants.push({ userId: "intruder", joinedAt: "now" });

  assert.deepEqual(store.listRooms()[0]?.participants.map(({ userId }) => userId), [
    "host",
  ]);
});
