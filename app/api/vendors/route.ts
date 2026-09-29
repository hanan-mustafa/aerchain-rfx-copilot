import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export async function GET() {
  const store = await getStore();
  if (!store) {
    return NextResponse.json({ ok: false, error: "No comparison store yet. Run extraction first." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, store });
}
