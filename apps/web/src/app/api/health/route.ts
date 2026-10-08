import { db, sql } from "@repo/db";

export async function GET() {
  try {
    await sql`select 1`.execute(db);
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error(error);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
