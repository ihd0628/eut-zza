import type { Judgment, Note } from "./types";

const PERFECT_WINDOW_MS = 30;
const GREAT_WINDOW_MS = 70;
const GOOD_WINDOW_MS = 120;

/**
 * 입력 시각과 노트의 판정 시각 차이를 받아 판정 결과를 반환한다.
 *
 * timingOffsetMs가 음수면 이른 입력,
 * 양수면 늦은 입력이다.
 */
export const calculateJudgment = (timingOffsetMs: number): Judgment => {
  // 이른 입력과 늦은 입력을 동일한 기준으로 비교하기 위해
  // 절댓값으로 변환한다.
  const absoluteOffsetMs = Math.abs(timingOffsetMs);

  if (absoluteOffsetMs <= PERFECT_WINDOW_MS) {
    return "PERFECT";
  }

  if (absoluteOffsetMs <= GREAT_WINDOW_MS) {
    return "GREAT";
  }

  if (absoluteOffsetMs <= GOOD_WINDOW_MS) {
    return "GOOD";
  }

  return "MISS";
};

/**
 * hitTimeMs가 targetTimeMs 이상인 첫 노트의 인덱스를 찾는다.
 * notes는 hitTimeMs 오름차순으로 정렬되어 있어야 한다.
 * 조건에 맞는 노트가 없으면 notes.length를 반환한다.
 */
const findFirstNoteIndexAtOrAfter = (
  notes: readonly Note[],
  targetTimeMs: number,
): number => {
  // 탐색할 범위는 left 이상, right 미만이다.
  // right는 실제 노트의 인덱스가 아니라 범위의 끝 경계다.
  let left = 0;
  let right = notes.length;

  while (left < right) {
    const middle = Math.floor((left + right) / 2);

    if (notes[middle].hitTimeMs < targetTimeMs) {
      // 가운데 노트가 너무 이르면 그 앞의 노트들도 모두 너무 이르다.
      // 가운데를 포함한 왼쪽 범위를 제외한다.
      left = middle + 1;
    } else {
      // 가운데 노트는 조건을 만족하지만, 더 앞에도 후보가 있을 수 있다.
      // 첫 번째 후보를 찾기 위해 왼쪽 범위를 계속 확인한다.
      right = middle;
    }
  }

  // left와 right가 만난 위치가 첫 번째 후보의 인덱스다.
  // 빈 배열이면 0, 모든 노트가 목표보다 이르면 notes.length가 된다.
  return left;
};

/** 해당 레인의 시간순으로 정렬된 노트 배열을 받아 가장 가까운 미판정 노트를 찾는다. */
export const findClosestHittableNote = (
  laneNotes: readonly Note[],
  inputTimeMs: number,
  judgedNoteIds: ReadonlySet<string>,
): Note | null => {
  const earliestHittableTimeMs = inputTimeMs - GOOD_WINDOW_MS;
  const latestHittableTimeMs = inputTimeMs + GOOD_WINDOW_MS;

  // 이진 탐색으로 너무 이른 노트들을 한 번에 건너뛴다.
  const startIndex = findFirstNoteIndexAtOrAfter(
    laneNotes,
    earliestHittableTimeMs,
  );

  let closestNote: Note | null = null;
  let closestDistanceMs = Infinity;

  // 시작 인덱스부터 판정 범위 안에 있는 노트만 확인한다.
  for (let noteIndex = startIndex; noteIndex < laneNotes.length; noteIndex += 1) {
    const note = laneNotes[noteIndex];

    // 배열이 시간순이므로 이 노트가 범위를 벗어났다면
    // 뒤의 노트들도 모두 범위를 벗어난다.
    if (note.hitTimeMs > latestHittableTimeMs) {
      break;
    }

    // 이미 처리한 노트는 다시 판정하지 않는다.
    if (judgedNoteIds.has(note.id)) {
      continue;
    }

    const distanceMs = Math.abs(inputTimeMs - note.hitTimeMs);

    if (distanceMs < closestDistanceMs) {
      closestNote = note;
      closestDistanceMs = distanceMs;
    }
  }

  // 판정 범위 안에 미판정 노트가 없었다면 null이다.
  return closestNote;
};

/**
 * 입력 가능 시간이 지나 자동 MISS가 된 노트인지 확인한다.
 *
 * 정확히 120ms 늦은 입력까지는 GOOD이므로,
 * 120ms를 초과했을 때 MISS로 처리한다.
 */
export const isNoteMissed = (note: Note, currentTimeMs: number): boolean => {
  return currentTimeMs - note.hitTimeMs > GOOD_WINDOW_MS;
};
