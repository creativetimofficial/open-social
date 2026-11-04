import { activeStudio, StudioError } from "@/lib/studio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/queue: the Content Calendar entries, for the Calendar tab. */
export async function GET() {
  try {
    const studio = activeStudio()
    return Response.json({ entries: await studio.listScheduled(), sample: studio.kind === "sample" })
  } catch (err) {
    return Response.json({ entries: [], error: err instanceof Error ? err.message : String(err) }, { status: err instanceof StudioError ? 200 : 502 })
  }
}
