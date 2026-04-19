export type Team = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
};

export type Candidate = {
  id: number;
  ballot_no: number;
  name: string;
};

export type CandidateTotalRow = {
  candidate_id: number;
  ballot_no: number;
  name: string;
  votes: number;
  total_voters: number;
  vote_rate: number;
  vote_rank: number;
  is_elected: boolean;
};

export type ElectionSummaryRow = {
  election_id: number;
  total_valid_ballots: number;
  total_invalid_ballots: number;
  total_voters: number;
};
