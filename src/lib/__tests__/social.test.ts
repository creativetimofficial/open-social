import { openDb, useDb } from "@agent-starters/kit/db"
import type { AgentEvent } from "@agent-starters/kit/events"
import { SourceLedger } from "@agent-starters/kit/tools/types"
import { beforeEach, describe, expect, it } from "vitest"

import { agentProfile, broker } from "@/lib/agent"
import { POST, tomorrowAt10 } from "@/lib/demo"
import { sampleStudio, socialStudio, threadParts } from "@/lib/studio"

beforeEach(() => useDb(openDb(":memory:")))

const ctx = (events: AgentEvent[] = []) => ({
  agent: agentProfile(),
  runId: "run-1",
  threadId: null,
  initiator: "lite" as const,
  signal: new AbortController().signal,
  emit: (e: AgentEvent) => events.push(e),
  sources: new SourceLedger(),
  toolCalls: { count: 0 },
})

describe("scheduling on the sample studio", () => {
  it("asks first, schedules nothing when declined, and drafts when approved", async () => {
    const channels = await broker.runTool("social_channels", {}, "c1", ctx())
    expect(channels.content).toContain("Autonomy: copilot")

    const post = { text: POST, channels: ["x", "bluesky"], publish_at: tomorrowAt10() }
    const events: AgentEvent[] = []
    const declined = await broker.runTool("social_schedule", post, "c2", ctx(events), async () => "denied")
    expect(declined.ok).toBe(false)
    expect(events.some((e) => e.type === "approval_required")).toBe(true)
    expect(await sampleStudio.listScheduled()).toHaveLength(0)

    const approved = await broker.runTool("social_schedule", post, "c3", ctx(), async () => "approved")
    expect(approved.ok).toBe(true)
    expect(approved.content).toContain("Mode: copilot")
    const queue = await sampleStudio.listScheduled()
    expect(queue.map((e) => [e.channel, e.status])).toEqual([
      ["x", "draft"],
      ["bluesky", "draft"],
    ])

    const cancelled = await broker.runTool("social_cancel", { id: queue[0].id }, "c4", ctx(), async () => "approved")
    expect(cancelled.ok).toBe(true)
    expect((await sampleStudio.listScheduled("cancelled")).map((e) => e.id)).toEqual([queue[0].id])
  })

  it("refuses a channel that is not connected and a time in the past", async () => {
    const unknown = await broker.runTool("social_schedule", { text: "Hi", channels: ["tiktok"] }, "c5", ctx(), async () => "approved")
    expect(unknown.ok).toBe(false)
    expect(unknown.content).toMatch(/no 'tiktok' channel/)

    const past = await broker.runTool("social_schedule", { text: "Hi", channels: ["x"], publish_at: "2020-01-01T10:00:00Z" }, "c6", ctx(), async () => "approved")
    expect(past.ok).toBe(false)
    expect(past.content).toMatch(/in the past/)
  })

  it("has no publish-now tool", () => {
    expect(broker.tools.map((t) => t.name)).not.toContain("publish_now")
    expect(agentProfile().tools["social.schedule"]).toBe("approve")
  })

  it("keeps the demo post within both sample channels' limits", () => {
    expect(threadParts(POST, 280)).toBe(1)
    expect(threadParts("x".repeat(600), 280)).toBe(3)
  })
})

describe("Social Studio REST client", () => {
  const studio = (status: number, body: unknown, seen: { url?: string; auth?: string; body?: string }[] = []) =>
    socialStudio("https://studio.example/tools", "sk-cf-test", (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") ?? undefined, body: String(init?.body) })
      return Response.json(body, { status })
    }) as typeof fetch)

  it("calls the tool door with the key and returns the result", async () => {
    const seen: { url?: string; auth?: string; body?: string }[] = []
    const result = await studio(200, { result: { ok: true, mode: "autopilot", entries: [], note: "Armed." } }, seen).schedule({ text: "Hello", channels: ["x"] })
    expect(result.mode).toBe("autopilot")
    expect(seen[0]).toEqual({ url: "https://studio.example/tools/schedule_publish", auth: "Bearer sk-cf-test", body: JSON.stringify({ text: "Hello", channels: ["x"] }) })
  })

  it("surfaces Social Studio's own refusal, scope included", async () => {
    await expect(studio(403, { error: "This key lacks the social:draft scope.", code: "insufficient_scope", resolution: "Add it at /dashboard/api-keys." }).listChannels()).rejects.toThrow(
      "Social Studio: This key lacks the social:draft scope. Add it at /dashboard/api-keys."
    )
    await expect(studio(401, { error: "Unauthorized" }).listChannels()).rejects.toThrow(/Check SOCIAL_API_KEY/)
  })
})
