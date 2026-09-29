import type { BeatmapSummary } from "./beatmap.js";

// Domain은 읏짜에서 사용하는 핵심 데이터의 형태만 표현한다.
// HTTP, Fastify, PostgreSQL 같은 외부 기술에 대해서는 알지 못한다.
export type Song = {
  id: string;
  title: string;
  audioUrl: string;
  beatmaps: BeatmapSummary[];
};
