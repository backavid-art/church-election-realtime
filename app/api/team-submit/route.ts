import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ELECTION_ID } from "@/lib/excel-rules";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyTeamSession } from "@/lib/team-auth";

const payloadSchema = z.object({
  teamCode: z.string().min(1),
  validBallots: z.number().int().nonnegative(),
  invalidBallots: z.number().int().nonnegative(),
  votes: z.array(
    z.object({
      candidateId: z.number().int().positive(),
      votes: z.number().int().nonnegative()
    })
  )
});

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("team_session")?.value;

    if (!token) {
      return NextResponse.json({ ok: false, message: "인증 세션이 없습니다." }, { status: 401 });
    }

    const session = verifyTeamSession(token);

    if (!session) {
      return NextResponse.json({ ok: false, message: "세션이 만료되었습니다." }, { status: 401 });
    }

    const body = payloadSchema.parse(await req.json());
    const normalizedCode = body.teamCode.toUpperCase();

    if (normalizedCode !== session.teamCode) {
      return NextResponse.json({ ok: false, message: "본인 팀 데이터만 수정할 수 있습니다." }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc("upsert_team_result", {
      p_election_id: ELECTION_ID,
      p_team_code: normalizedCode,
      p_valid_ballots: body.validBallots,
      p_invalid_ballots: body.invalidBallots,
      p_votes: body.votes.map((v) => ({
        candidate_id: v.candidateId,
        votes: v.votes
      })),
      p_updated_by: `team-${normalizedCode}`
    });

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: "제출 데이터 형식이 잘못되었습니다." }, { status: 400 });
  }
}
