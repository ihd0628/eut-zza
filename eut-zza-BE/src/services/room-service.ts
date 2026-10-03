import { randomUUID } from "node:crypto";
import {
  ROOM_CAPACITY,
  RoomBeatmapChangedError,
  RoomBeatmapNotSelectedError,
  RoomFullError,
  RoomHostRequiredError,
  RoomNotFoundError,
  RoomNotJoinableError,
  RoomNotWaitingError,
  RoomParticipantNotFoundError,
  RoomSelectionLockedError,
  UserAlreadyInRoomError,
  type Room,
} from "../domain/room.js";

// 내부 배열을 호출자에게 직접 넘기면 서버의 정원 규칙을 우회해 변경할 수 있다.
const snapshotRoom = (room: Room): Room => ({
  ...room,
  participants: room.participants.map((participant) => ({ ...participant })),
});

// 현재는 Fastify 서버 한 대의 RAM에만 존재한다. 서버 재시작 시 방은 사라진다.
export class RoomStore {
  private readonly rooms = new Map<string, Room>();

  listRooms(): Room[] {
    return Array.from(this.rooms.values(), snapshotRoom);
  }

  getRoom(roomId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    return room === undefined ? undefined : snapshotRoom(room);
  }

  findRoomByUserId(userId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.participants.some((participant) => participant.userId === userId)) {
        return snapshotRoom(room);
      }
    }

    return undefined;
  }

  createRoom(userId: string): Room {
    this.ensureUserIsNotInAnotherRoom(userId);

    const createdAt = new Date().toISOString();
    const room: Room = {
      id: randomUUID(),
      hostUserId: userId,
      status: "waiting",
      selectedBeatmapId: null,
      participants: [{ userId, joinedAt: createdAt, isReady: false }],
      createdAt,
    };

    this.rooms.set(room.id, room);
    return snapshotRoom(room);
  }

  joinRoom(roomId: string, userId: string): Room {
    const room = this.rooms.get(roomId);

    if (room === undefined) {
      throw new RoomNotFoundError();
    }

    // 네트워크 재시도 등으로 같은 사용자가 다시 요청해도 중복 참가시키지 않는다.
    if (room.participants.some((participant) => participant.userId === userId)) {
      return snapshotRoom(room);
    }

    this.ensureUserIsNotInAnotherRoom(userId);

    if (room.status !== "waiting") {
      throw new RoomNotJoinableError();
    }

    if (room.participants.length >= ROOM_CAPACITY) {
      throw new RoomFullError();
    }

    // 정원 검사와 추가 사이에 await가 없으므로 단일 Node.js 프로세스 안에서는
    // 다른 요청의 joinRoom()이 이 두 작업 사이에 끼어들 수 없다.
    room.participants.push({ userId, joinedAt: new Date().toISOString(), isReady: false });

    return snapshotRoom(room);
  }

  selectBeatmap(roomId: string, userId: string, beatmapId: string): Room {
    const room = this.rooms.get(roomId);
    if (room === undefined) throw new RoomNotFoundError();
    if (room.hostUserId !== userId) throw new RoomHostRequiredError();
    if (room.status !== "waiting") throw new RoomNotWaitingError();

    // 같은 채보 재선택은 상태 변경이 아니므로 전원 준비 상태에서도 허용한다.
    if (room.selectedBeatmapId !== beatmapId) {
      if (room.participants.every((participant) => participant.isReady)) {
        throw new RoomSelectionLockedError();
      }

      // 일부 참가자가 준비했더라도 사용자가 정한 규칙에 따라 준비 상태는 유지한다.
      room.selectedBeatmapId = beatmapId;
    }

    return snapshotRoom(room);
  }

  setReady(roomId: string, userId: string, beatmapId: string, ready: boolean): Room {
    const room = this.rooms.get(roomId);
    if (room === undefined) throw new RoomNotFoundError();
    if (room.status !== "waiting") throw new RoomNotWaitingError();

    const participant = room.participants.find((entry) => entry.userId === userId);
    if (participant === undefined) throw new RoomParticipantNotFoundError();
    if (room.selectedBeatmapId === null) throw new RoomBeatmapNotSelectedError();
    if (room.selectedBeatmapId !== beatmapId) throw new RoomBeatmapChangedError();

    participant.isReady = ready;
    return snapshotRoom(room);
  }

  leaveRoom(roomId: string, userId: string): Room | null {
    const room = this.rooms.get(roomId);

    if (room === undefined) {
      throw new RoomNotFoundError();
    }

    const participantIndex = room.participants.findIndex(
      (participant) => participant.userId === userId,
    );

    if (participantIndex === -1) {
      throw new RoomParticipantNotFoundError();
    }

    // 입장 순서를 보존하는 배열이므로, 방장이 나가면 첫 번째 남은 참가자가 승계한다.
    room.participants.splice(participantIndex, 1);

    if (room.participants.length === 0) {
      this.rooms.delete(roomId);
      return null;
    }

    if (room.hostUserId === userId) {
      room.hostUserId = room.participants[0]!.userId;
    }

    return snapshotRoom(room);
  }

  private ensureUserIsNotInAnotherRoom(userId: string): void {
    for (const room of this.rooms.values()) {
      if (room.participants.some((participant) => participant.userId === userId)) {
        throw new UserAlreadyInRoomError();
      }
    }
  }
}
