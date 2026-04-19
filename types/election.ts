export type ElectionSummary = {
  totalVoters: number;
  invalidVotes: number;
  validVotes: number;
  updatedAt: string;
};

export type CandidateResult = {
  rank: number;
  name: string;
  totalBallots: number;
  votes: number;
  voteRate: number;
  status: string;
};

export type GroupRow = {
  name: string;
  a: number;
  b: number;
  c: number;
  d: number;
  total: number;
};

export type GroupResult = {
  name: "A조" | "B조" | "C조" | "D조";
  rows: GroupRow[];
};

export type ElectionResultsResponse = {
  summary: ElectionSummary;
  candidates: CandidateResult[];
  groups: GroupResult[];
};
