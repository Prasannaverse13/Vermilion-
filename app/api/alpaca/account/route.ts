import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccountSummary } from "@/lib/alpaca/server";

/**
 * GET /api/alpaca/account
 * Returns the Alpaca paper account summary. Used by the chat
 * sources panel to show live equity / cash / buying power.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const acct = await getAccountSummary();
    return NextResponse.json({ ok: true, ...acct });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
