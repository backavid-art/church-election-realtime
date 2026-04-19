"use client";

import { useEffect, useMemo, useState } from "react";

import type { CandidateResult, ElectionResultsResponse } from "@/types/election";

type ApiState = {
  loading: boolean;
  error: string | null;
  data: ElectionResultsResponse | null;
};

export default function Page() {
  const [state, setState] = useState<ApiState>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch("/api/results", { cache: "no-store" });
        if (!res.ok) throw new Error("결과 API 호출 실패");

        const data = (await res.json()) as ElectionResultsResponse;
        if (!cancelled) {
          setState({ loading: false, error: null, data });
        }
      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : "데이터 조회 실패"
          }));
        }
      }
    };

    void fetchData();
    const timer = setInterval(fetchData, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const candidates = useMemo(() => {
    return [...(state.data?.candidates ?? [])].sort((a, b) => {
      if (b.voteRate !== a.voteRate) return b.voteRate - a.voteRate;
      if (b.votes !== a.votes) return b.votes - a.votes;
      return a.rank - b.rank;
    });
  }, [state.data]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-xl bg-primary p-5 text-white shadow">
          <h1 className="text-2xl font-bold">장로 선거 실시간 개표 현황판</h1>
          <p className="mt-1 text-sm text-blue-100">5초 주기 자동 갱신</p>
        </header>

        {state.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}

        <section className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="총투표자" value={state.data?.summary.totalVoters ?? 0} />
          <SummaryCard label="유효투표" value={state.data?.summary.validVotes ?? 0} />
          <SummaryCard label="무효표수" value={state.data?.summary.invalidVotes ?? 0} />
        </section>

        <section className="rounded-xl bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">후보별 집계</h2>
            <p className="text-xs text-slate-500">
              마지막 업데이트: {formatUpdatedAt(state.data?.summary.updatedAt)}
            </p>
          </div>

          {state.loading ? (
            <p className="py-10 text-center text-slate-500">불러오는 중...</p>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    <th className="px-3 py-2">순위</th>
                    <th className="px-3 py-2">이름</th>
                    <th className="px-3 py-2">총투표수</th>
                    <th className="px-3 py-2">득표수</th>
                    <th className="px-3 py-2">득표율</th>
                    <th className="px-3 py-2">당선여부</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <CandidateRow key={`${c.rank}-${c.name}`} candidate={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-primary">{value.toLocaleString()}</p>
    </article>
  );
}

function CandidateRow({ candidate }: { candidate: CandidateResult }) {
  return (
    <tr className="border-t">
      <td className="px-3 py-2">{candidate.rank}</td>
      <td className="px-3 py-2 font-medium">{candidate.name}</td>
      <td className="px-3 py-2">{candidate.totalBallots}</td>
      <td className="px-3 py-2">{candidate.votes}</td>
      <td className="px-3 py-2">{(candidate.voteRate * 100).toFixed(2)}%</td>
      <td className="px-3 py-2">
        {candidate.status === "당선" ? (
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">당선</span>
        ) : (
          <span className="text-slate-400">-</span>
        )}
      </td>
    </tr>
  );
}

function formatUpdatedAt(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(date);
}
