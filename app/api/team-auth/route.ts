import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ELECTION_ID } from "@/lib/excel-rules";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signTeamSession } from "@/lib/team-auth";

const schema = z.object({
  teamCode: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("verify_team_password", {
      p_election_id: ELECTION_ID,
      p_team_code: body.teamCode.toUpperCase(),
      p_password: body.password
    });

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    const row = Array.isArray(data) ? data[0] : null;

    if (!row) {
      return NextResponse.json({ ok: false, message: "팀 코드 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const token = signTeamSession({
      electionId: ELECTION_ID,
      teamId: row.team_id,
      teamCode: body.teamCode.toUpperCase()
    });

    const res = NextResponse.json({ ok: true, teamId: row.team_id, teamName: row.team_name });
    res.cookies.set("team_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/"
    });

    return res;
  } catch (error) {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
}
