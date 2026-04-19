"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchCandidates, fetchTeams } from "@/lib/fetchers";
import { supabaseBrowser } from "@/lib/supabase";
import type { Candidate, Team } from "@/lib/types";

type AuthState = {
  authenticated: boolean;
  teamCode: string;
  teamName: string;
};

export function TeamEntryForm() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [teamCode, setTeamCode] = useState("A");
  const [password, setPassword] = useState("");
  const [validBallots, setValidBallots] = useState(0);
  const [invalidBallots, setInvalidBallots] = useState(0);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [auth, setAuth] = useState<AuthState>({ authenticated: false, teamCode: "", teamName: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const [teamRows, candidateRows] = await Promise.all([fetchTeams(), fetchCandidates()]);
        setTeams(teamRows);
        setCandidates(candidateRows);
        if (teamRows.length > 0) setTeamCode(teamRows[0].code);
        const initialVotes: Record<number, number> = {};
        candidateRows.forEach((c) => {
          initialVotes[c.id] = 0;
        });
        setVotes(initialVotes);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "초기 데이터를 불러오지 못했습니다.");
      }
    };

    void run();
  }, []);

  const totalCandidateVotes = useMemo(
    () => Object.values(votes).reduce((acc, cur) => acc + (Number.isFinite(cur) ? cur : 0), 0),
    [votes]
  );

  async function handleAuth() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/team-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamCode, password })
      });

      const json = (await res.json()) as { ok: boolean; message?: string; teamName?: string };

      if (!res.ok || !json.ok) {
        setMessage(json.message ?? "인증 실패");
        setLoading(false);
        return;
      }

      setAuth({ authenticated: true, teamCode, teamName: json.teamName ?? teamCode });
      setMessage(`${json.teamName ?? teamCode} 인증 완료`);

      const team = teams.find((t) => t.code === teamCode);
      if (team) {
        await loadTeamDraft(team.id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "인증 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setPassword("");
    }
  }

  async function loadTeamDraft(teamId: number) {
    const [resultRes, voteRes] = await Promise.all([
      supabaseBrowser
        .from("team_results")
        .select("valid_ballots, invalid_ballots")
        .eq("team_id", teamId)
        .eq("election_id", 1)
        .maybeSingle(),
      supabaseBrowser
        .from("team_candidate_votes")
        .select("candidate_id, votes")
        .eq("team_id", teamId)
        .eq("election_id", 1)
    ]);

    if (resultRes.data) {
      setValidBallots(resultRes.data.valid_ballots ?? 0);
      setInvalidBallots(resultRes.data.invalid_ballots ?? 0);
    }

    if (voteRes.data) {
      const next: Record<number, number> = { ...votes };
      voteRes.data.forEach((row) => {
        next[row.candidate_id] = row.votes;
      });
      setVotes(next);
    }
  }

  async function handleSubmit() {
    if (!auth.authenticated) {
      setMessage("먼저 팀 인증을 진행하세요.");
      return;
    }

    const willSubmit = window.confirm("입력값을 제출하시겠습니까? 제출 즉시 전체 대시보드에 반영됩니다.");
    if (!willSubmit) return;

    setLoading(true);
    setMessage(null);

    try {
      const payload = {
        teamCode: auth.teamCode,
        validBallots,
        invalidBallots,
        votes: candidates.map((c) => ({
          candidateId: c.id,
          votes: votes[c.id] ?? 0
        }))
      };

      const res = await fetch("/api/team-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = (await res.json()) as { ok: boolean; message?: string };

      if (!res.ok || !json.ok) {
        setMessage(json.message ?? "제출 실패");
        return;
      }

      setMessage("저장 완료: 실시간 대시보드에 반영되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl bg-white p-6 shadow">
      <h2 className="text-xl font-semibold text-primary">팀별 입력</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block">팀(조)</span>
          <select
            className="w-full rounded border px-3 py-2"
            value={teamCode}
            onChange={(e) => setTeamCode(e.target.value)}
            disabled={auth.authenticated}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.code}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block">팀 비밀번호</span>
          <input
            type="password"
            className="w-full rounded border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={auth.authenticated}
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            className="w-full rounded bg-primary px-3 py-2 font-medium text-white disabled:opacity-60"
            onClick={handleAuth}
            disabled={loading || auth.authenticated}
          >
            {auth.authenticated ? `인증됨 (${auth.teamName})` : "팀 인증"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumericField label="유효 투표수" value={validBallots} onChange={setValidBallots} disabled={!auth.authenticated} />
        <NumericField label="무효 투표수" value={invalidBallots} onChange={setInvalidBallots} disabled={!auth.authenticated} />
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-12 gap-2 border-b bg-slate-50 px-3 py-2 text-sm font-medium">
          <div className="col-span-2">기호</div>
          <div className="col-span-6">후보명</div>
          <div className="col-span-4">득표수</div>
        </div>
        <div className="max-h-[420px] overflow-auto px-3 py-2">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="grid grid-cols-12 items-center gap-2 border-b py-2 text-sm last:border-b-0">
              <div className="col-span-2">{candidate.ballot_no}</div>
              <div className="col-span-6">{candidate.name}</div>
              <div className="col-span-4">
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={0}
                  className="w-full rounded border px-2 py-1"
                  value={votes[candidate.id] ?? 0}
                  onChange={(e) => {
                    const next = Math.max(0, Number(e.target.value || 0));
                    setVotes((prev) => ({ ...prev, [candidate.id]: next }));
                  }}
                  disabled={!auth.authenticated}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
        후보 득표 입력 합계: <strong>{totalCandidateVotes.toLocaleString()}</strong>
      </div>

      {message && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">{message}</p>}

      <button
        type="button"
        className="w-full rounded bg-accent px-4 py-3 font-semibold text-white disabled:opacity-60"
        onClick={handleSubmit}
        disabled={!auth.authenticated || loading}
      >
        {loading ? "처리 중..." : "입력값 저장"}
      </button>
    </section>
  );
}

function NumericField({
  label,
  value,
  onChange,
  disabled
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        className="w-full rounded border px-3 py-2"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value || 0)))}
        disabled={disabled}
      />
    </label>
  );
}
