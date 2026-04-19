import jwt from "jsonwebtoken";

const secret = process.env.TEAM_AUTH_JWT_SECRET;

if (!secret) {
  throw new Error("Missing TEAM_AUTH_JWT_SECRET");
}

type TeamSession = {
  electionId: number;
  teamId: number;
  teamCode: string;
};

export function signTeamSession(payload: TeamSession): string {
  return jwt.sign(payload, secret!, { expiresIn: "8h" });
}

export function verifyTeamSession(token: string): TeamSession | null {
  try {
    return jwt.verify(token, secret!) as TeamSession;
  } catch {
    return null;
  }
}
