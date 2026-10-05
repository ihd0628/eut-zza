import type WebSocket from "ws";
import type { Room } from "../domain/room.js";
import { RoomStore } from "./room-service.js";

export const ROOM_RECONNECT_GRACE_MS = 10_000;
export const ROOM_HEARTBEAT_INTERVAL_MS = 30_000;

type RoomEvent =
  | { type: "room_updated"; room: Room }
  | { type: "room_deleted"; roomId: string };

// 방 참가 정보(RoomStore)와 브라우저 연결(WebSocket)은 서로 다른 상태다.
// 새로고침으로 연결만 잠깐 교체될 때는 참가 정보를 유지한다.
export class RoomPresence {
  private readonly connections = new Map<string, Map<string, Set<WebSocket>>>();
  private readonly departureTimers = new Map<string, NodeJS.Timeout>();
  private readonly awaitingPong = new WeakSet<WebSocket>();
  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor(
    private readonly roomStore: RoomStore,
    private readonly graceMs = ROOM_RECONNECT_GRACE_MS,
    heartbeatMs = ROOM_HEARTBEAT_INTERVAL_MS,
  ) {
    this.heartbeatTimer = setInterval(() => this.checkConnections(), heartbeatMs);
    this.heartbeatTimer.unref();
  }

  private checkConnections(): void {
    for (const roomConnections of this.connections.values()) {
      for (const userConnections of roomConnections.values()) {
        for (const socket of userConnections) {
          // 직전 Ping에 Pong이 없으면 끊어진 연결로 보고 즉시 종료한다.
          // close 이벤트가 발생하면 기존의 10초 재접속 유예가 시작된다.
          if (socket.readyState !== socket.OPEN || this.awaitingPong.has(socket)) {
            socket.terminate();
            continue;
          }

          this.awaitingPong.add(socket);
          socket.ping();
        }
      }
    }
  }

  private timerKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  private cancelDeparture(roomId: string, userId: string): void {
    const key = this.timerKey(roomId, userId);
    const timer = this.departureTimers.get(key);

    if (timer !== undefined) {
      clearTimeout(timer);
      this.departureTimers.delete(key);
    }
  }

  private scheduleDeparture(roomId: string, userId: string): void {
    this.cancelDeparture(roomId, userId);

    const key = this.timerKey(roomId, userId);
    const timer = setTimeout(() => {
      this.departureTimers.delete(key);

      if (this.roomStore.getRoom(roomId)?.participants.some(
        (participant) => participant.userId === userId,
      )) {
        this.leaveRoom(roomId, userId);
      }
    }, this.graceMs);

    timer.unref();
    this.departureTimers.set(key, timer);
  }

  // HTTP 입장 뒤 대기실 WS가 끝내 열리지 않은 경우에도 유령 참가자가 남지 않게 한다.
  expectConnection(roomId: string, userId: string): void {
    if (!this.hasConnection(roomId, userId)) {
      this.scheduleDeparture(roomId, userId);
    }
  }

  attach(roomId: string, userId: string, socket: WebSocket): void {
    this.cancelDeparture(roomId, userId);

    let roomConnections = this.connections.get(roomId);
    if (roomConnections === undefined) {
      roomConnections = new Map();
      this.connections.set(roomId, roomConnections);
    }

    let userConnections = roomConnections.get(userId);
    if (userConnections === undefined) {
      userConnections = new Set();
      roomConnections.set(userId, userConnections);
    }

    userConnections.add(socket);
    // 브라우저는 WebSocket 프로토콜의 Ping에 자동으로 Pong을 보낸다.
    socket.on("pong", () => this.awaitingPong.delete(socket));
    socket.on("close", () => {
      this.awaitingPong.delete(socket);
      const currentConnections = this.connections.get(roomId)?.get(userId);
      currentConnections?.delete(socket);

      if (currentConnections?.size === 0) {
        this.connections.get(roomId)?.delete(userId);
        if (this.connections.get(roomId)?.size === 0) {
          this.connections.delete(roomId);
        }

        if (this.roomStore.getRoom(roomId)?.participants.some(
          (participant) => participant.userId === userId,
        )) {
          this.scheduleDeparture(roomId, userId);
        }
      }
    });
  }

  private hasConnection(roomId: string, userId: string): boolean {
    return (this.connections.get(roomId)?.get(userId)?.size ?? 0) > 0;
  }

  broadcastRoom(roomId: string): void {
    const room = this.roomStore.getRoom(roomId);
    const event: RoomEvent = room === undefined
      ? { type: "room_deleted", roomId }
      : { type: "room_updated", room };

    for (const userConnections of this.connections.get(roomId)?.values() ?? []) {
      for (const socket of userConnections) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      }
    }
  }

  leaveRoom(roomId: string, userId: string): Room | null {
    const room = this.roomStore.leaveRoom(roomId, userId);
    this.cancelDeparture(roomId, userId);

    // 퇴장한 참가자가 오래된 WebSocket으로 방 상태를 받지 못하게 한다.
    for (const socket of this.connections.get(roomId)?.get(userId) ?? []) {
      socket.close(1000, "Left room");
    }
    this.connections.get(roomId)?.delete(userId);
    if (this.connections.get(roomId)?.size === 0) {
      this.connections.delete(roomId);
    }

    this.broadcastRoom(roomId);
    return room;
  }

  leaveUser(userId: string): void {
    const room = this.roomStore.findRoomByUserId(userId);
    if (room !== undefined) {
      this.leaveRoom(room.id, userId);
    }
  }

  dispose(): void {
    clearInterval(this.heartbeatTimer);
    for (const timer of this.departureTimers.values()) {
      clearTimeout(timer);
    }
    this.departureTimers.clear();
    this.connections.clear();
  }
}
