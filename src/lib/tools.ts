import type { ToolDefinition } from "@agent-starters/kit/tools/types"
import { z } from "zod"

import { activeStudio } from "@/lib/studio"

/**
 * The agent's Social Studio tools. Scheduling goes through the broker's
 * approval (social.config.ts), then through Social Studio's own rules: the
 * key's scopes, the channel's limits, the account's copilot/autopilot dial.
 */

const sampleNote = (kind: string) => (kind === "sample" ? "(Sample studio: fictional channels, nothing is posted.)\n" : "")

const socialChannels: ToolDefinition<Record<string, unknown>> = {
  id: "social.channels",
  name: "social_channels",
  description: "List the connected social channels, each with its rules (character limit, threads, media), and the account's autonomy mode (copilot: schedules become drafts the user approves; autopilot: schedules are armed). Call before writing.",
  input: z.object({}).strict(),
  sideEffect: false,
  async execute() {
    const studio = activeStudio()
    const list = await studio.listChannels()
    const lines = list.channels.map(
      (c) =>
        `- ${c.channel} (${c.account}): ${c.agentPostable ? `max ${c.rules.maxChars ?? "no limit"} chars${c.rules.threads ? ", long text becomes a numbered thread" : ""}` : `not schedulable by agents${c.howToPost ? `: ${c.howToPost}` : ""}`}`
    )
    return {
      content: `${sampleNote(studio.kind)}Autonomy: ${list.autonomy}. ${list.autonomyNote}\nChannels:\n${lines.join("\n") || "(none connected)"}`,
      summary: `${list.channels.length} channel(s), ${list.autonomy}`,
    }
  },
}

const socialQueue: ToolDefinition<{ status?: "draft" | "scheduled" | "published" | "failed" }> = {
  id: "social.queue",
  name: "social_queue",
  description: "List upcoming and recent posts on the user's Content Calendar (drafts awaiting approval, scheduled, published, failed), to plan times and avoid duplicates.",
  input: z.object({ status: z.enum(["draft", "scheduled", "published", "failed"]).optional() }),
  sideEffect: false,
  async execute({ status }) {
    const studio = activeStudio()
    const entries = await studio.listScheduled(status)
    const lines = entries.map((e) => `- #${e.id} ${e.status} ${e.publishAt} ${e.channel ?? "?"}: ${e.title ?? ""}${e.error ? ` (error: ${e.error})` : ""}`)
    return { content: `${sampleNote(studio.kind)}${lines.join("\n") || "Nothing on the calendar."}`, summary: `${entries.length} calendar entr${entries.length === 1 ? "y" : "ies"}` }
  },
}

const socialSchedule: ToolDefinition<{ text: string; channels: string[]; publish_at?: string }> = {
  id: "social.schedule",
  name: "social_schedule",
  description:
    "Schedule one post (the same text) to one or more connected channels at publish_at (ISO 8601 with offset; omit for about two minutes from now). Long text is split into a numbered thread on channels that allow threads. Needs the user's approval; in copilot mode it becomes a draft on their Content Calendar.",
  input: z.object({
    text: z.string().trim().min(1).max(5000),
    channels: z.array(z.string().min(1).max(40)).min(1).max(5),
    publish_at: z.iso
      .datetime({ offset: true })
      .optional()
      .refine((v) => !v || Date.parse(v) > Date.now() - 60_000, "publish_at is in the past"),
  }),
  sideEffect: true,
  async execute({ text, channels, publish_at }) {
    const studio = activeStudio()
    const result = await studio.schedule({ text, channels: channels.map((c) => c.toLowerCase()), publishAt: publish_at })
    const lines = result.entries.map((e) => `- #${e.id} ${e.channel} (${e.account}) ${e.status} at ${e.publishAt}${e.thread > 1 ? `, as a ${e.thread}-post thread` : ""}`)
    const next = result.userAction ?? result.note ?? ""
    return { content: `${sampleNote(studio.kind)}Mode: ${result.mode}.\n${lines.join("\n")}\n${next}`, summary: `${result.entries.length} post(s) ${result.mode === "copilot" ? "drafted" : "scheduled"}` }
  },
}

const socialCancel: ToolDefinition<{ id: number }> = {
  id: "social.cancel",
  name: "social_cancel",
  description: "Cancel a draft or scheduled calendar entry by its id (from social_queue). Needs the user's approval.",
  input: z.object({ id: z.number().int().positive() }),
  sideEffect: true,
  async execute({ id }) {
    const studio = activeStudio()
    await studio.cancel(id)
    return { content: `${sampleNote(studio.kind)}Entry #${id} cancelled.`, summary: `Cancelled #${id}` }
  },
}

export const socialTools = [socialChannels, socialQueue, socialSchedule, socialCancel] as unknown as ToolDefinition<unknown>[]
