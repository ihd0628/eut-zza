import cors from "@fastify/cors";
import Fastify from "fastify";
import { DatabaseError } from "pg";
import { pool } from "./db.js";

const HOST = "127.0.0.1";
const PORT = 3001;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const FRONTEND_ORIGIN = "http://localhost:5173";

type CredentialsRequestBody = {
  email: string;
  password: string;
};

const credentialsBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: {
      type: "string",
      minLength: 1,
    },
    password: {
      type: "string",
      minLength: 1,
    },
  },
} as const;

const DEMO_USER = {
  id: "user-1",
  email: "test@example.com",
  password: "1234",
};

type Song = {
  id: string;
  title: string;
};

type SongParams = {
  id: string;
};

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

type CreateScoreRequestBody = {
  gamePlayerId: string;
  score: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  maxCombo: number;
};

type Score = CreateScoreRequestBody & {
  id: string;
};

const nonNegativeIntegerSchema = {
  type: "integer",
  minimum: 0,
  maximum: 2_147_483_647,
} as const;

const createScoreBodySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "gamePlayerId",
    "score",
    "perfectCount",
    "greatCount",
    "goodCount",
    "missCount",
    "maxCombo",
  ],
  properties: {
    gamePlayerId: {
      type: "string",
      pattern: "^[1-9][0-9]*$",
      maxLength: 18,
    },
    score: nonNegativeIntegerSchema,
    perfectCount: nonNegativeIntegerSchema,
    greatCount: nonNegativeIntegerSchema,
    goodCount: nonNegativeIntegerSchema,
    missCount: nonNegativeIntegerSchema,
    maxCombo: nonNegativeIntegerSchema,
  },
} as const;

type Difficulty = "easy" | "normal" | "hard";

type SongRankingQuerystring = {
  difficulty: Difficulty;
};

type RankingEntry = {
  userId: string;
  email: string;
  bestScore: number;
  playCount: number;
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

type UserParams = {
  id: string;
};

type UserScoreEntry = {
  scoreId: string;
  gameSessionId: string;
  songTitle: string;
  difficulty: Difficulty;
  score: number;
  maxCombo: number;
};

// 곡 ID와 사용자 ID에 적용할 입력 규칙이 같으므로 재사용한다.
const userParamsSchema = songParamsSchema;

// Fastify 인스턴스 내부에는 Node.js HTTP server와 라우터 등이 들어 있다.
// logger를 켜면 요청과 응답에 대한 구조화된 로그를 확인할 수 있다.
const server = Fastify({
  logger: true,
  bodyLimit: MAX_REQUEST_BODY_BYTES,
});

// Fastify는 기본적으로 application/json뿐 아니라 text/plain도 읽을 수 있다. 하지만 현재 인증 API는 JSON 전용이므로 text/plain 파서를 제거한다.
// 그러면 Content-Type: text/plain 요청은 자동으로 415 Unsupported Media Type이 된다
server.removeContentTypeParser("text/plain");

await server.register(cors, {
  origin: FRONTEND_ORIGIN,
});

// raw 서버에서 method와 pathname을 직접 비교했던 작업을
// Fastify의 get() 메서드가 라우트 등록 형태로 대신한다.
server.get("/health", () => {
  // 객체를 반환하면 Fastify가 JSON 직렬화와 응답 Header 설정,
  // response.end()에 해당하는 응답 완료 작업을 처리한다.
  return {
    status: "ok",
    service: "eut-zza-be",
  };
});

server.get("/songs", async () => {
  const result = await pool.query<Song>(`
    SELECT id, title
    FROM songs
    ORDER BY id
  `);

  return {
    songs: result.rows,
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
    const result = await pool.query<Song>(
      `
    SELECT id, title
    FROM songs
    WHERE id = $1
  `,
      [request.params.id],
    );

    const song = result.rows[0];

    if (song === undefined) {
      return reply.code(404).send({
        error: "Song Not Found",
      });
    }

    return {
      song,
    };
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
    const songResult = await pool.query<Pick<Song, "id">>(
      `
          SELECT id
          FROM songs
          WHERE id = $1
        `,
      [request.params.id],
    );

    if (songResult.rows[0] === undefined) {
      return reply.code(404).send({
        error: "Song Not Found",
      });
    }

    const rankingResult = await pool.query<RankingEntry>(
      `
          SELECT
            u.id AS "userId",
            u.email,
            MAX(sc.score) AS "bestScore",
            COUNT(*)::integer AS "playCount"
          FROM scores AS sc
          JOIN game_players AS gp
            ON gp.id = sc.game_player_id
          JOIN users AS u
            ON u.id = gp.user_id
          JOIN game_sessions AS gs
            ON gs.id = gp.game_session_id
          JOIN beatmaps AS b
            ON b.id = gs.beatmap_id
          WHERE b.song_id = $1
            AND b.difficulty = $2
            AND gs.status = 'completed'
          GROUP BY u.id, u.email
          ORDER BY MAX(sc.score) DESC, u.id ASC
          LIMIT 10
        `,
      [request.params.id, request.query.difficulty],
    );

    return {
      songId: request.params.id,
      difficulty: request.query.difficulty,
      ranking: rankingResult.rows,
    };
  },
);

server.post<{ Body: CreateScoreRequestBody }>(
  "/scores",
  {
    schema: {
      body: createScoreBodySchema,
    },
  },
  async (request, reply) => {
    const body = request.body;

    try {
      const result = await pool.query<Score>(
        `
        INSERT INTO scores (
          game_player_id,
          score,
          perfect_count,
          great_count,
          good_count,
          miss_count,
          max_combo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id,
          game_player_id AS "gamePlayerId",
          score,
          perfect_count AS "perfectCount",
          great_count AS "greatCount",
          good_count AS "goodCount",
          miss_count AS "missCount",
          max_combo AS "maxCombo"
      `,
        [
          body.gamePlayerId,
          body.score,
          body.perfectCount,
          body.greatCount,
          body.goodCount,
          body.missCount,
          body.maxCombo,
        ],
      );

      return reply.code(201).send({
        score: result.rows[0],
      });
    } catch (error: unknown) {
      if (
        error instanceof DatabaseError &&
        error.code === "23505" &&
        error.constraint === "scores_game_player_id_key"
      ) {
        return reply.code(409).send({
          error: "Score already exists for this game player",
        });
      }

      if (
        error instanceof DatabaseError &&
        error.code === "23503" &&
        error.constraint === "scores_game_player_id_fkey"
      ) {
        return reply.code(404).send({
          error: "Game player not found",
        });
      }

      throw error;
    }
  },
);

server.post<{ Body: CredentialsRequestBody }>(
  "/auth/signup",
  {
    schema: {
      body: credentialsBodySchema,
    },
  },
  (request, reply) => {
    return reply.code(201).send({
      user: {
        id: "user-1",
        email: request.body.email,
      },
    });
  },
);

server.get<{ Params: UserParams }>(
  "/users/:id/scores",
  {
    schema: {
      params: userParamsSchema,
    },
  },
  async (request, reply) => {
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE id = $1",
      [request.params.id],
    );

    if (userResult.rows[0] === undefined) {
      return reply.code(404).send({
        error: "User Not Found",
      });
    }

    const scoresResult = await pool.query<UserScoreEntry>(
      `
        SELECT
          sc.id AS "scoreId",
          gs.id AS "gameSessionId",
          so.title AS "songTitle",
          b.difficulty,
          sc.score,
          sc.max_combo AS "maxCombo"
        FROM scores AS sc
        JOIN game_players AS gp
          ON gp.id = sc.game_player_id
        JOIN game_sessions AS gs
          ON gs.id = gp.game_session_id
        JOIN beatmaps AS b
          ON b.id = gs.beatmap_id
        JOIN songs AS so
          ON so.id = b.song_id
        WHERE gp.user_id = $1
          AND gs.status = 'completed'
        ORDER BY gs.ended_at DESC NULLS LAST, sc.id DESC
        LIMIT 20
      `,
      [request.params.id],
    );

    return {
      userId: request.params.id,
      scores: scoresResult.rows,
    };
  },
);

server.post<{ Body: CredentialsRequestBody }>(
  "/auth/login",
  {
    schema: {
      body: credentialsBodySchema,
    },
  },
  (request, reply) => {
    const credentialsMatch =
      request.body.email === DEMO_USER.email &&
      request.body.password === DEMO_USER.password;

    if (!credentialsMatch) {
      return reply.code(401).send({
        error: "Invalid email or password",
      });
    }

    return {
      user: {
        id: DEMO_USER.id,
        email: DEMO_USER.email,
      },
    };
  },
);

const start = async (): Promise<void> => {
  try {
    const address = await server.listen({
      host: HOST,
      port: PORT,
    });

    server.log.info(`Eut-zza Fastify API server: ${address}`);
  } catch (error) {
    server.log.error(error);
    process.exitCode = 1;
  }
};

// start() 내부에서 listen 오류를 처리하므로 반환된 Promise는 의도적으로 기다리지 않는다.
void start();
