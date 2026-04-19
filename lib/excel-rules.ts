export const ELECTION_ID = 1;
export const PASS_THRESHOLD = 0.666;

export type CandidateScore = {
  candidateId: number;
  ballotNo: number;
  name: string;
  votes: number;
  voteRate: number;
};

// Excel의 RANK()와 동일한 Competition Ranking (1, 2, 2, 4)
export function rankLikeExcel(scores: CandidateScore[]): Array<CandidateScore & { rank: number; elected: boolean }> {
  const sorted = [...scores].sort((a, b) => {
    if (b.voteRate !== a.voteRate) return b.voteRate - a.voteRate;
    return a.ballotNo - b.ballotNo;
  });

  let lastRate: number | null = null;
  let lastRank = 0;

  return sorted.map((item, idx) => {
    if (lastRate === null || item.voteRate < lastRate) {
      lastRank = idx + 1;
      lastRate = item.voteRate;
    }

    return {
      ...item,
      rank: lastRank,
      elected: item.voteRate >= PASS_THRESHOLD
    };
  });
}

export function percent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}
