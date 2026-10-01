import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

// Without this Next prerenders the GET at build time and serves that frozen
// store forever, never reflecting a later extraction run.
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getStore();
  if (!store) {
    return NextResponse.json({ ok: false, error: "No comparison store yet. Run extraction first." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, store });
}
