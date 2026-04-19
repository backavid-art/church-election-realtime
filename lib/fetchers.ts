import { ELECTION_ID } from "@/lib/excel-rules";
import { supabaseBrowser } from "@/lib/supabase";
import type { Candidate, CandidateTotalRow, ElectionSummaryRow, Team } from "@/lib/types";

export async function fetchTeams(): Promise<Team[]> {
  const { data, error } = await supabaseBrowser
    .from("teams")
    .select("id, code, name, sort_order")
    .eq("election_id", ELECTION_ID)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Team[];
}

export async function fetchCandidates(): Promise<Candidate[]> {
  const { data, error } = await supabaseBrowser
    .from("candidates")
    .select("id, ballot_no, name")
    .eq("election_id", ELECTION_ID)
    .eq("is_active", true)
    .order("ballot_no", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Candidate[];
}

export async function fetchSummary(): Promise<ElectionSummaryRow | null> {
  const { data, error } = await supabaseBrowser
    .from("election_summary")
    .select("election_id, total_valid_ballots, total_invalid_ballots, total_voters")
    .eq("election_id", ELECTION_ID)
    .maybeSingle();

  if (error) throw error;
  return (data as ElectionSummaryRow) ?? null;
}

export async function fetchCandidateTotals(): Promise<CandidateTotalRow[]> {
  const { data, error } = await supabaseBrowser
    .from("election_candidate_totals")
    .select("candidate_id, ballot_no, name, votes, total_voters, vote_rate, vote_rank, is_elected")
    .eq("election_id", ELECTION_ID)
    .order("vote_rank", { ascending: true })
    .order("ballot_no", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CandidateTotalRow[];
}
