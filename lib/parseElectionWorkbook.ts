import path from "node:path";
import { readFileSync, statSync } from "node:fs";
import * as XLSX from "xlsx";

import type { CandidateResult, ElectionResultsResponse, GroupResult, GroupRow } from "@/types/election";

const SUMMARY_SHEET_CANDIDATES = ["장로 개표 집계표", "장로 1차 선거 개표 집계표"];
const GROUP_SHEET = "조별합계표";
const DEFAULT_LOCAL_FILE_PATH = path.join(process.cwd(), "system/data/election.xlsx");
const REQUEST_TIMEOUT_MS = 15000;

type WorkbookSource = {
  buffer: Buffer;
  modifiedAt: Date;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  const normalized = value.replace(/[% ,]/g, "").trim();
  if (!normalized) return 0;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;

  if (value.includes("%")) return parsed / 100;
  return parsed;
}

function toString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function parseCandidates(sheet: XLSX.WorkSheet): CandidateResult[] {
  const rows: CandidateResult[] = [];

  for (let row = 11; row <= 59; row += 1) {
    const l = sheet[`L${row}`]?.v;
    const m = sheet[`M${row}`]?.v;
    const n = sheet[`N${row}`]?.v;
    const o = sheet[`O${row}`]?.v;
    const p = sheet[`P${row}`]?.v;
    const q = sheet[`Q${row}`]?.v;

    // 패턴 A: L=rank, M=name, N=total, O=votes, P=rate, Q=status
    const nameA = toString(m);
    const rankA = toNumber(l);

    // 패턴 B: M=rank, N=name, O=total, P=votes, Q=rate (status는 계산)
    const nameB = toString(n);
    const rankB = toNumber(m);

    let rowResult: CandidateResult | null = null;

    if (nameA) {
      const voteRate = toNumber(p);
      rowResult = {
        rank: rankA || row,
        name: nameA,
        totalBallots: toNumber(n),
        votes: toNumber(o),
        voteRate,
        status: toString(q) || (voteRate >= 0.666 ? "당선" : "-")
      };
    } else if (nameB) {
      const voteRate = toNumber(q);
      rowResult = {
        rank: rankB || row,
        name: nameB,
        totalBallots: toNumber(o),
        votes: toNumber(p),
        voteRate,
        status: voteRate >= 0.666 ? "당선" : "-"
      };
    }

    if (rowResult) {
      rows.push(rowResult);
    }
  }

  rows.sort((a, b) => {
    if (b.voteRate !== a.voteRate) return b.voteRate - a.voteRate;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.rank - b.rank;
  });

  return rows;
}

function parseGroups(sheet: XLSX.WorkSheet): GroupResult[] {
  const rows: GroupRow[] = [];

  for (let row = 4; row <= 59; row += 1) {
    const name = toString(sheet[`B${row}`]?.v);
    if (!name) continue;

    rows.push({
      name,
      a: toNumber(sheet[`C${row}`]?.v),
      b: toNumber(sheet[`D${row}`]?.v),
      c: toNumber(sheet[`E${row}`]?.v),
      d: toNumber(sheet[`F${row}`]?.v),
      total: toNumber(sheet[`G${row}`]?.v)
    });
  }

  return [
    { name: "A조", rows },
    { name: "B조", rows },
    { name: "C조", rows },
    { name: "D조", rows }
  ];
}

function withDownloadFlag(urlString: string): string {
  const url = new URL(urlString);
  url.searchParams.set("download", "1");
  return url.toString();
}

function buildCandidateUrls(urlString: string): string[] {
  const normalized = urlString.trim();
  if (!normalized) return [];

  const urls = [normalized];
  try {
    urls.push(withDownloadFlag(normalized));
  } catch {
    return [normalized];
  }

  return Array.from(new Set(urls));
}

async function fetchWorkbookFromUrl(urlString: string): Promise<WorkbookSource> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(urlString, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*"
      }
    });

    if (!response.ok) {
      throw new Error(`원격 엑셀 요청 실패 (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      modifiedAt: new Date()
    };
  } finally {
    clearTimeout(timer);
  }
}

function isWorkbookBuffer(buffer: Buffer): boolean {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return Array.isArray(workbook.SheetNames) && workbook.SheetNames.length > 0;
  } catch {
    return false;
  }
}

async function loadWorkbookSource(filePath: string, remoteUrl?: string): Promise<WorkbookSource> {
  if (remoteUrl) {
    const candidates = buildCandidateUrls(remoteUrl);
    let lastError: Error | null = null;

    for (const candidateUrl of candidates) {
      try {
        const source = await fetchWorkbookFromUrl(candidateUrl);
        if (!isWorkbookBuffer(source.buffer)) {
          throw new Error("원격 응답이 엑셀 파일 형식이 아닙니다.");
        }

        return source;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("원격 엑셀 조회 실패");
      }
    }

    if (lastError) {
      const allowLocalFallback =
        process.env.ALLOW_LOCAL_FALLBACK === "true" ||
        (process.env.NODE_ENV !== "production" && process.env.ALLOW_LOCAL_FALLBACK !== "false");

      if (!allowLocalFallback) {
        throw new Error(
          `OneDrive 원격 엑셀을 읽지 못했습니다. 링크 공유 권한(익명 다운로드 허용)을 확인하세요: ${lastError.message}`
        );
      }

      // 원격 조회가 모두 실패하면 로컬 파일로 폴백한다.
      console.warn(`[election] OneDrive URL fetch failed. fallback to local file: ${lastError.message}`);
    }
  }

  const workbookBuffer = readFileSync(filePath);
  return {
    buffer: workbookBuffer,
    modifiedAt: statSync(filePath).mtime
  };
}

export async function parseElectionWorkbook(
  filePath = process.env.ELECTION_EXCEL_LOCAL_PATH || DEFAULT_LOCAL_FILE_PATH
): Promise<ElectionResultsResponse> {
  const remoteUrl = process.env.ONEDRIVE_EXCEL_URL;
  const source = await loadWorkbookSource(filePath, remoteUrl);
  const workbook = XLSX.read(source.buffer, { type: "buffer" });

  const summarySheetName = SUMMARY_SHEET_CANDIDATES.find((name) => Boolean(workbook.Sheets[name]));
  const summarySheet = summarySheetName ? workbook.Sheets[summarySheetName] : undefined;
  const groupSheet = workbook.Sheets[GROUP_SHEET];

  if (!summarySheet) {
    throw new Error(`시트를 찾을 수 없습니다: ${SUMMARY_SHEET_CANDIDATES.join(", ")}`);
  }

  if (!groupSheet) {
    throw new Error(`시트를 찾을 수 없습니다: ${GROUP_SHEET}`);
  }

  const totalVoters = toNumber(summarySheet.B4?.v);
  const invalidVotes = toNumber(summarySheet.B5?.v);
  const validVotes = toNumber(summarySheet.B6?.v);

  const candidates = parseCandidates(summarySheet);
  const groups = parseGroups(groupSheet);

  return {
    summary: {
      totalVoters,
      invalidVotes,
      validVotes,
      updatedAt: source.modifiedAt.toISOString()
    },
    candidates,
    groups
  };
}
