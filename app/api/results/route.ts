import { NextResponse } from "next/server";

import { parseElectionWorkbook } from "@/lib/parseElectionWorkbook";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const results = await parseElectionWorkbook();
    return NextResponse.json(results, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "결과를 읽는 중 오류가 발생했습니다."
      },
      { status: 500 }
    );
  }
}
