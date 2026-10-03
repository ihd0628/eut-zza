import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type WebSocket from "ws";
import { RoomPresence } from "../src/services/room-presence.js";
import { RoomStore } from "../src/services/room-service.js";

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  messages: string[] = [];

  send(message: string): void { this.messages.push(message); }
  close(): void {
    this.readyState = 3;
    this.emit("close");
  }
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

test("새로고침으로 소켓을 교체하면 재접속 유예 안에 참가를 유지한다", async () => {
  const store = new RoomStore();
  const presence = new RoomPresence(store, 30);
  const room = store.createRoom("host");
  const first = new FakeSocket();
  presence.attach(room.id, "host", first as unknown as WebSocket);

  first.close();
  await wait(5);
  const second = new FakeSocket();
  presence.attach(room.id, "host", second as unknown as WebSocket);
  await wait(40);

  assert.equal(store.getRoom(room.id)?.hostUserId, "host");
  presence.dispose();
});

test("재접속하지 않으면 유예 시간 뒤 퇴장하고 방장을 승계한다", async () => {
  const store = new RoomStore();
  const presence = new RoomPresence(store, 20);
  const room = store.createRoom("host");
  store.joinRoom(room.id, "guest");
  const hostSocket = new FakeSocket();
  const guestSocket = new FakeSocket();
  presence.attach(room.id, "host", hostSocket as unknown as WebSocket);
  presence.attach(room.id, "guest", guestSocket as unknown as WebSocket);

  hostSocket.close();
  await wait(40);

  assert.equal(store.getRoom(room.id)?.hostUserId, "guest");
  assert.equal(JSON.parse(guestSocket.messages.at(-1) ?? "{}").type, "room_updated");
  presence.dispose();
});

test("여러 탭 중 하나만 닫으면 참가를 유지한다", async () => {
  const store = new RoomStore();
  const presence = new RoomPresence(store, 20);
  const room = store.createRoom("host");
  const first = new FakeSocket();
  const second = new FakeSocket();
  presence.attach(room.id, "host", first as unknown as WebSocket);
  presence.attach(room.id, "host", second as unknown as WebSocket);

  first.close();
  await wait(40);

  assert.equal(store.getRoom(room.id)?.hostUserId, "host");
  presence.dispose();
});
