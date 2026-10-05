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
  pings = 0;
  terminations = 0;

  constructor(private readonly repliesToPing = true) { super(); }

  send(message: string): void { this.messages.push(message); }
  ping(): void {
    this.pings += 1;
    if (this.repliesToPing) this.emit("pong");
  }
  terminate(): void {
    this.terminations += 1;
    this.close();
  }
  close(): void {
    this.readyState = 3;
    this.emit("close");
  }
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
    await wait(5);
  }
  assert.ok(condition(), "조건이 제한 시간 안에 충족되지 않았다");
};

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

test("Pong을 보내는 소켓은 heartbeat 검사 후에도 방에 남는다", async () => {
  const store = new RoomStore();
  const presence = new RoomPresence(store, 20, 10);
  const room = store.createRoom("host");
  const socket = new FakeSocket();
  presence.attach(room.id, "host", socket as unknown as WebSocket);

  await waitFor(() => socket.pings >= 2);

  assert.equal(socket.terminations, 0);
  assert.equal(store.getRoom(room.id)?.hostUserId, "host");
  presence.dispose();
});

test("Pong이 없으면 소켓을 종료하고 유예 시간 뒤 참가자를 제거한다", async () => {
  const store = new RoomStore();
  const presence = new RoomPresence(store, 20, 10);
  const room = store.createRoom("host");
  const socket = new FakeSocket(false);
  presence.attach(room.id, "host", socket as unknown as WebSocket);

  await waitFor(() => socket.terminations === 1);
  assert.equal(store.getRoom(room.id)?.hostUserId, "host");

  await waitFor(() => store.getRoom(room.id) === undefined);
  presence.dispose();
});

test("한 사용자의 소켓 중 하나만 Pong이 없어도 다른 연결이 살아 있으면 퇴장하지 않는다", async () => {
  const store = new RoomStore();
  const presence = new RoomPresence(store, 20, 10);
  const room = store.createRoom("host");
  const brokenSocket = new FakeSocket(false);
  const healthySocket = new FakeSocket();
  presence.attach(room.id, "host", brokenSocket as unknown as WebSocket);
  presence.attach(room.id, "host", healthySocket as unknown as WebSocket);

  await waitFor(() => brokenSocket.terminations === 1);
  await wait(30);

  assert.equal(healthySocket.terminations, 0);
  assert.equal(store.getRoom(room.id)?.hostUserId, "host");
  presence.dispose();
});
