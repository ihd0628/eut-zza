import type { FastifyPluginAsync } from "fastify";
import type { Difficulty } from "../domain/beatmap.js";
import {
  getSong,
  getSongRanking,
  listSongs,
  SongNotFoundError,
} from "../services/song-service.js";
import type { LeaderboardService } from "../services/leaderboard-service.js";

type SongRoutesOptions = {
  leaderboardService: LeaderboardService;
};

type SongParams = {
  id: string;
};

// URL의 id는 양의 정수 형태의 문자열만 허용한다.
// 이 규칙은 HTTP 요청 입력을 검증하므로 Route 계층에 둔다.
const songParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: {
      type: "string",
      pattern: "^[1-9][0-9]*$",
      maxLength: 18,
    },
  },
} as const;

type SongRankingQuerystring = {
  difficulty: Difficulty;
};

const songRankingQuerystringSchema = {
  type: "object",
  additionalProperties: false,
  required: ["difficulty"],
  properties: {
    difficulty: {
      type: "string",
      enum: ["easy", "normal", "hard"],
    },
  },
} as const;

// Fastify Plugin은 전달받은 Fastify 인스턴스에 곡 관련 Route를 등록한다.
export const songRoutes: FastifyPluginAsync<SongRoutesOptions> = async (
  server,
  { leaderboardService },
) => {
  server.get("/songs", async () => {
    const songs = await listSongs();

    return {
      songs,
    };
  });

  server.get<{ Params: SongParams }>(
    "/songs/:id",
    {
      schema: {
        params: songParamsSchema,
      },
    },
    async (request, reply) => {
      try {
        const song = await getSong(request.params.id);

        return {
          song,
        };
      } catch (error: unknown) {
        if (error instanceof SongNotFoundError) {
          return reply.code(404).send({
            error: "Song Not Found",
          });
        }

        // Route가 처리 방법을 모르는 오류는 Fastify의 오류 처리 흐름으로 보낸다.
        throw error;
      }
    },
  );

  server.get<{
    Params: SongParams;
    Querystring: SongRankingQuerystring;
  }>(
    "/songs/:id/ranking",
    {
      schema: {
        params: songParamsSchema,
        querystring: songRankingQuerystringSchema,
      },
    },
    async (request, reply) => {
      try {
        const ranking = await getSongRanking(
          request.params.id,
          request.query.difficulty,
          leaderboardService,
        );

        return {
          songId: request.params.id,
          difficulty: request.query.difficulty,
          ranking,
        };
      } catch (error: unknown) {
        if (error instanceof SongNotFoundError) {
          return reply.code(404).send({
            error: "Song Not Found",
          });
        }

        throw error;
      }
    },
  );
};
