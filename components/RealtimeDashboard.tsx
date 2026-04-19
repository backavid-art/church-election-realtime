"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { percent, rankLikeExcel } from "@/lib/excel-rules";
import { fetchCandidateTotals, fetchSummary } from "@/lib/fetchers";
import { supabaseBrowser } from "@/lib/supabase";
import type { CandidateTotalRow, ElectionSummaryRow } from "@/lib/types";

type DashboardState = {
  loading: boolean;
  summary: ElectionSummaryRow | null;
  rows: CandidateTotalRow[];
  error: string | null;
};

const pieColors = ["#154c79", "#cf5c36", "#2f855a", "#dd6b20", "#3182ce", "#718096"];

export function RealtimeDashboard() {
  const [state, setState] = useState<DashboardState>({
    loading: true,
    summary: null,
    rows: [],
    error: null
  });

  const load = useCallback(async () => {
    try {
      const [summary, rows] = await Promise.all([fetchSummary(), fetchCandidateTotals()]);
      setState({ loading: false, summary, rows, error: null });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "대시보드 조회 중 오류가 발생했습니다."
      }));
    }
  }, []);

  useEffect(() => {
    void load();

    const channel = supabaseBrowser
      .channel("election-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "team_results" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_candidate_votes" }, () => {
        void load();
      })
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [load]);

  const rankedRows = useMemo(() => {
    return rankLikeExcel(
      state.rows.map((row) => ({
        candidateId: row.candidate_id,
        ballotNo: row.ballot_no,
        name: row.name,
        votes: row.votes,
        voteRate: Number(row.vote_rate ?? 0)
      }))
    );
  }, [state.rows]);

  const top10 = useMemo(() => rankedRows.slice(0, 10), [rankedRows]);

  const electedCount = rankedRows.filter((x) => x.elected).length;

  if (state.loading) {
    return <section className="rounded-xl bg-white p-6 shadow">대시보드를 불러오는 중...</section>;
  }

  return (
    <section className="space-y-4 rounded-xl bg-white p-6 shadow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-primary">실시간 득표 현황</h2>
        <p className="text-sm text-slate-500">Supabase Realtime 구독 중</p>
      </div>

      {state.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="총 투표자수" value={state.summary?.total_voters ?? 0} />
        <MetricCard label="유효 투표수" value={state.summary?.total_valid_ballots ?? 0} />
        <MetricCard label="무효 투표수" value={state.summary?.total_invalid_ballots ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-80 rounded-lg border p-3">
          <h3 className="mb-2 text-sm font-medium">상위 10명 득표수</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top10} margin={{ top: 8, right: 10, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={55} />
              <YAxis />
              <Tooltip formatter={(value: number) => [`${value}표`, "득표수"]} />
              <Legend />
              <Bar dataKey="votes" name="득표수" fill="#154c79" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="h-80 rounded-lg border p-3">
          <h3 className="mb-2 text-sm font-medium">득표율 비중 (상위 6명)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={top10.slice(0, 6)} dataKey="votes" nameKey="name" outerRadius={95} label>
                {top10.slice(0, 6).map((entry, idx) => (
                  <Cell key={entry.candidateId} fill={pieColors[idx % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => [`${value}표`, "득표수"]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-3 py-2">순위</th>
              <th className="px-3 py-2">기호</th>
              <th className="px-3 py-2">후보</th>
              <th className="px-3 py-2">득표수</th>
              <th className="px-3 py-2">득표율</th>
              <th className="px-3 py-2">당선</th>
            </tr>
          </thead>
          <tbody>
            {rankedRows.map((row) => (
              <tr key={row.candidateId} className="border-t">
                <td className="px-3 py-2">{row.rank}</td>
                <td className="px-3 py-2">{row.ballotNo}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.votes}</td>
                <td className="px-3 py-2">{percent(row.voteRate)}</td>
                <td className="px-3 py-2">{row.elected ? "당선" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        동점 처리: Excel과 동일하게 `RANK()` 규칙(공동순위, 다음 순위 건너뜀)으로 계산합니다. 현재 당선자 수: {electedCount}명
      </p>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-slate-50 px-3 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-primary">{value.toLocaleString()}</p>
    </div>
  );
}
