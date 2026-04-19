# Excel 기반 실시간 개표 현황판

## 핵심 파일
- `app/page.tsx`: 5초 폴링 UI
- `app/api/results/route.ts`: 결과 API
- `lib/parseElectionWorkbook.ts`: 엑셀 파서
- `types/election.ts`: 타입 정의
- `system/data/election.xlsx`: 원본 파일 위치

## 실행
1. `cp .env.example .env.local`
2. Microsoft Graph 실시간 연동 사용 시 아래 4개 설정
   - `MS_TENANT_ID`
   - `MS_CLIENT_ID`
   - `MS_CLIENT_SECRET`
   - `MS_ONEDRIVE_SHARE_URL` (예: `https://1drv.ms/...`)
3. (선택) 기존 공개 링크 방식은 `ONEDRIVE_EXCEL_URL` 사용
4. `npm install`
5. `npm run dev`
6. 브라우저에서 `/` 접속

## 데이터 소스 우선순위
1. `MS_*` Graph 인증 방식 (`MS_ONEDRIVE_SHARE_URL`)
2. `ONEDRIVE_EXCEL_URL` (익명 공개 링크 방식)
3. `ELECTION_EXCEL_LOCAL_PATH` (로컬 파일 fallback)

`ALLOW_LOCAL_FALLBACK`:
- 기본값: `false` (원격 실패 시 오류 반환)
- 로컬 테스트 시에만 `true`로 설정 (원격 실패 시 로컬 전환)

참고:
- Graph 인증 방식은 익명 링크가 막혀 있어도 동작합니다.
- OneDrive 개인(MSA) 계정은 앱 전용(client_credentials) 제한이 있을 수 있어, 조직 계정(Entra ID) 구성이 권장됩니다.

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
