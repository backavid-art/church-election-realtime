# Excel 기반 실시간 개표 현황판

## 핵심 파일
- `app/page.tsx`: 5초 폴링 UI
- `app/api/results/route.ts`: 결과 API
- `lib/parseElectionWorkbook.ts`: 엑셀 파서
- `types/election.ts`: 타입 정의
- `system/data/election.xlsx`: 원본 파일 위치

## 실행
1. `cp .env.example .env.local`
2. `.env.local`에 `ONEDRIVE_EXCEL_URL`을 설정 (예: `https://1drv.ms/...`)
3. `npm install`
4. `npm run dev`
5. 브라우저에서 `/` 접속

## 데이터 소스 우선순위
1. `ONEDRIVE_EXCEL_URL` (원격 OneDrive 링크)
2. `ELECTION_EXCEL_LOCAL_PATH` (로컬 파일 fallback)

`ALLOW_LOCAL_FALLBACK`:
- 개발 환경 기본값: `true` (원격 실패 시 로컬 전환)
- 프로덕션 기본값: `false` (원격 실패 시 오류 반환)

프로덕션에서 실시간 반영이 필요하면 OneDrive 링크가 익명 다운로드 가능해야 합니다.

## 파싱 기준
- 요약: `장로 개표 집계표` 또는 `장로 1차 선거 개표 집계표`의 `B4:B6`
- 후보: `L11:Q59` 우선, 파일 형식 차이를 위해 `M11:Q59`도 자동 보정
- 조별: `조별합계표!B4:G59`

## API
`GET /api/results`

```json
{
  "summary": {
    "totalVoters": 0,
    "invalidVotes": 0,
    "validVotes": 0,
    "updatedAt": "2026-04-15T03:00:00.000Z"
  },
  "candidates": [
    {
      "rank": 1,
      "name": "홍길동",
      "totalBallots": 100,
      "votes": 72,
      "voteRate": 0.72,
      "status": "당선"
    }
  ],
  "groups": []
}
```
