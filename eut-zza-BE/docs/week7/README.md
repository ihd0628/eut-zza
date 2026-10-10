# Week 7 — Network Latency와 Redis

Week 7에서 학습하고 구현한 내용의 목차다.

- [네트워크 지연과 시각 동기화](./network-latency-and-clock-sync.md)
- [서버의 최종 결정권과 Trust Boundary](./server-authority-client-trust-and-prediction.md)
- [Redis 기초, 생명주기와 원자성](./redis-fundamentals-lifecycle-and-atomicity.md)
- [Redis Leaderboard, 자동 매칭과 결과 멱등성 구현](./leaderboard-matchmaking-and-idempotency.md)

이번 주 구현의 핵심 저장소 역할은 다음과 같다.

```text
PostgreSQL
└── 유실되면 안 되는 경기와 점수의 원본

Redis
├── 자동 매칭 대기열과 짧은 사용자 상태
└── PostgreSQL에서 다시 만들 수 있는 랭킹 캐시

Node.js RoomStore
└── 현재 단일 서버 프로세스 안의 방 상태
```
