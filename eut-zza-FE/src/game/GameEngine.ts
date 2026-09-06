/**
 * 게임 엔진의 진입점이자 조정자 역할을 담당한다.
 *
 * React는 canvas 태그를 화면에 배치하고 메뉴·점수 패널 같은 UI를 담당한다.
 * 이 파일의 GameEngine은 React와 독립적으로 게임의 실시간 동작을 관리한다.
 *
 * 이후 이 파일에는 다음 기능이 들어간다.
 * - GameLoop과 InputManager 생성 및 연결
 * - 게임 시작, 일시 정지, 재개, 종료
 * - 현재 게임 상태(GameState) 보관
 * - 매 프레임 게임 상태 갱신(update)과 Canvas 렌더링(render) 호출
 * - Week 2부터 음악 시간, 노트, 판정, 점수 계산 모듈 연결
 *
 * 이 파일에는 React 컴포넌트, JSX, useState를 넣지 않는다.
 */

import { AudioManager } from "./AudioManager";
import { CanvasRenderer } from "./CanvasRenderer";
import { GameLoop } from "./GameLoop";
import { InputManager } from "./InputManager";
import {
  calculateJudgment,
  findClosestHittableNote,
  isNoteMissed,
} from "./Judgment";
import type { GameInputEvent, GameKey, LaneIndex, Note } from "./types";

const KEY_TO_LANE_INDEX: Record<GameKey, LaneIndex> = {
  D: 0,
  F: 1,
  J: 2,
  K: 3,
};

export class GameEngine {
  private readonly gameLoop: GameLoop;
  private readonly inputManager: InputManager;
  private readonly renderer: CanvasRenderer;
  private readonly notes: Note[];
  private readonly audioManager: AudioManager;
  private readonly audioUrl: string;
  private readonly judgedNoteIds = new Set<string>();
  private readonly notesByLane: Record<LaneIndex, readonly Note[]>;
  private readonly noteRenderLookaheadMs: number;
  private readonly renderNotes: Note[] = [];
  private nextMissNoteIndex = 0;
  private renderEndNoteIndex = 0;

  constructor(canvas: HTMLCanvasElement, notes: Note[], audioUrl: string) {
    this.audioManager = new AudioManager();
    this.renderer = new CanvasRenderer(canvas);
    this.noteRenderLookaheadMs = this.renderer.getNoteRenderLookaheadMs();
    this.audioUrl = audioUrl;

    this.gameLoop = new GameLoop(this.handleFrame);
    this.inputManager = new InputManager(this.handleInput);

    const sortedNotes = [...notes].sort(
      (firstNote, secondNote) => firstNote.hitTimeMs - secondNote.hitTimeMs,
    );

    this.notes = sortedNotes;

    const notesByLane: Record<LaneIndex, Note[]> = {
      0: [],
      1: [],
      2: [],
      3: [],
    };

    for (const note of sortedNotes) {
      notesByLane[note.laneIndex].push(note);
    }

    this.notesByLane = notesByLane;
  }

  async start(): Promise<void> {
    // 먼저 AudioContext를 running 상태로 만들고
    // 게임 시간 0의 기준을 저장한다.
    await this.audioManager.start(this.audioUrl);

    // 오디오 clock이 준비된 뒤 입력과 화면 갱신을 시작한다.
    this.inputManager.attach();
    this.gameLoop.start();
  }
  stop() {
    // 화면 갱신과 입력 중단
    this.gameLoop.stop();
    this.inputManager.detach();
  }
  async dispose(): Promise<void> {
    // stop() 실행
    // AudioContext까지 완전히 종료
    this.stop();
    await this.audioManager.close();
  }

  private updateMissedNotes(currentTimeMs: number): void {
    while (this.nextMissNoteIndex < this.notes.length) {
      const note = this.notes[this.nextMissNoteIndex];

      // 입력으로 이미 판정한 노트는 자동 MISS 대상으로 다시 볼 필요가 없다.
      if (this.judgedNoteIds.has(note.id)) {
        this.nextMissNoteIndex += 1;
        continue;
      }

      // 현재 노트가 아직 MISS가 아니라면, 시간순으로 뒤에 있는 노트들도
      // 아직 MISS가 아니므로 이번 프레임의 검사를 끝낸다.
      if (!isNoteMissed(note, currentTimeMs)) {
        break;
      }

      // MISS 판정이 가능하면 기록하고 로그를 남긴다.
      this.judgedNoteIds.add(note.id);
      this.nextMissNoteIndex += 1;

      console.log("[Judgment] MISS", {
        noteId: note.id,
        currentTimeMs,
        hitTimeMs: note.hitTimeMs,
      });
    }
  }

  private collectRenderNotes(currentTimeMs: number): readonly Note[] {
    const latestVisibleHitTimeMs =
      currentTimeMs + this.noteRenderLookaheadMs;

    // 음악 시간이 앞으로 진행되는 동안 새로 화면 범위에 들어온 노트만 찾는다.
    // renderEndNoteIndex는 뒤로 돌아가지 않으므로 각 노트는 여기서 한 번만 통과한다.
    while (this.renderEndNoteIndex < this.notes.length) {
      const note = this.notes[this.renderEndNoteIndex];

      if (note.hitTimeMs > latestVisibleHitTimeMs) {
        break;
      }

      this.renderEndNoteIndex += 1;
    }

    // 같은 배열을 매 프레임 재사용해 새로운 배열 생성을 피한다.
    this.renderNotes.length = 0;

    // nextMissNoteIndex 앞은 모두 판정이 끝났고,
    // renderEndNoteIndex 뒤는 아직 화면에 들어오지 않은 노트다.
    for (
      let noteIndex = this.nextMissNoteIndex;
      noteIndex < this.renderEndNoteIndex;
      noteIndex += 1
    ) {
      const note = this.notes[noteIndex];

      if (!this.judgedNoteIds.has(note.id)) {
        this.renderNotes.push(note);
      }
    }

    return this.renderNotes;
  }

  private handleFrame = () => {
    // requestAnimationFrame timestamp가 아니라
    // AudioContext clock을 현재 게임 시간으로 사용한다.
    const currentTimeMs = this.audioManager.getCurrentTimeMs();

    this.updateMissedNotes(currentTimeMs);

    const visibleNotes = this.collectRenderNotes(currentTimeMs);

    this.renderer.render(visibleNotes, currentTimeMs);
  };
  private handleInput = (event: GameInputEvent) => {
    // 키를 누르는 순간에만 판정한다.
    // keyup은 현재 판정에 사용하지 않는다.
    if (event.type !== "down") {
      return;
    }

    const laneIndex = KEY_TO_LANE_INDEX[event.key];

    // event.timestamp는 performance.now() 기준 시간이므로
    // Note.hitTimeMs와 직접 비교하지 않는다.
    const inputTimeMs = this.audioManager.getCurrentTimeMs();

    const closestNote = findClosestHittableNote(
      this.notesByLane[laneIndex],
      inputTimeMs,
      this.judgedNoteIds,
    );

    if (closestNote === null) {
      console.log("[Judgment] 판정 가능한 노트 없음", {
        key: event.key,
        inputTimeMs,
      });

      return;
    }

    const timingOffsetMs = inputTimeMs - closestNote.hitTimeMs;

    const judgment = calculateJudgment(timingOffsetMs);

    // 같은 노트를 다시 판정하지 못하도록 기록한다.
    this.judgedNoteIds.add(closestNote.id);

    console.log("[Judgment]", {
      noteId: closestNote.id,
      key: event.key,
      judgment,
      timingOffsetMs,
    });
  };
}
