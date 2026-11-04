import { isDemo } from "@agent-starters/kit/config"
import { z } from "zod"

/**
 * Creative Tim Social Studio, the service that holds the connected channels,
 * the Content Calendar and the publishing scheduler. This app reaches it
 * through its REST tool door (POST {SOCIAL_API_URL}/{tool}) with a key that
 * holds social scopes. Social Studio enforces the rest on its side: the
 * key's scopes, each channel's rules, and the account's autonomy dial.
 *
 * Without a key, the sample studio (demo mode, or DEMO_DATA=true) stands in:
 * two fictional channels in copilot mode, kept in memory.
 */

const schema = z.object({
  SOCIAL_API_URL: z.string().url().default("https://www.creative-tim.com/ui/api/social/tools"),
  SOCIAL_API_KEY: z.string().optional(),
  DEMO_DATA: z.enum(["true", "false"]).default("false"),
  APP_PASSWORD: z.string().min(12, "APP_PASSWORD must be at least 12 characters").optional(),
})

export function loadSocialSettings(env: Record<string, string | undefined> = process.env) {
  const parsed = schema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== "")))
  return { url: parsed.SOCIAL_API_URL.replace(/\/+$/, ""), apiKey: parsed.SOCIAL_API_KEY, demoData: parsed.DEMO_DATA === "true", appPassword: parsed.APP_PASSWORD }
}

let cached: ReturnType<typeof loadSocialSettings> | null = null
export const socialSettings = () => (cached ??= loadSocialSettings())

export interface Channel {
  id: number
  channel: string
  account: string
  agentPostable: boolean
  howToPost?: string
  rules: { maxChars: number | null; threads: boolean; media: boolean }
}

export interface ChannelList {
  autonomy: "copilot" | "autopilot"
  autonomyNote: string
  channels: Channel[]
}

export interface ScheduledEntry {
  id: number
  status: "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled"
  publishAt: string
  channel: string | null
  account: string | null
  title: string | null
  url?: string | null
  error?: string | null
}

export interface ScheduleResult {
  ok: boolean
  mode: "copilot" | "autopilot"
  entries: { id: number; channel: string; account: string; status: string; publishAt: string; thread: number }[]
  userAction?: string
  note?: string
}

export interface Studio {
  kind: "social-studio" | "sample"
  listChannels(): Promise<ChannelList>
  listScheduled(status?: ScheduledEntry["status"]): Promise<ScheduledEntry[]>
  schedule(input: { text: string; channels: string[]; publishAt?: string }): Promise<ScheduleResult>
  cancel(id: number): Promise<{ ok: boolean; id: number; status: string }>
}

export class StudioError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

/** The real Social Studio, over its REST tool door. */
export function socialStudio(url: string, apiKey: string, fetchImpl: typeof fetch = fetch): Studio {
  const call = async <T>(tool: string, args: Record<string, unknown> = {}): Promise<T> => {
    const res = await fetchImpl(`${url}/${tool}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(60_000),
    })
    const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string; resolution?: string }
    if (!res.ok) {
      const detail = [body.error ?? `HTTP ${res.status}`, body.resolution].filter(Boolean).join(" ")
      throw new StudioError(res.status === 401 ? "Social Studio rejected the key. Check SOCIAL_API_KEY." : `Social Studio: ${detail}`, res.status)
    }
    return body.result as T
  }
  return {
    kind: "social-studio",
    listChannels: () => call<ChannelList>("list_publish_channels"),
    listScheduled: async (status) => (await call<{ entries: ScheduledEntry[] }>("list_scheduled", status ? { status, limit: 50 } : { limit: 50 })).entries,
    schedule: (input) => call<ScheduleResult>("schedule_publish", input),
    cancel: (id) => call("cancel_scheduled", { id }),
  }
}

// ─── Sample studio ─────────────────────────────────────────────────────────

const SAMPLE_CHANNELS: Channel[] = [
  { id: 1, channel: "x", account: "@yourbrand (sample)", agentPostable: true, rules: { maxChars: 280, threads: true, media: true } },
  { id: 2, channel: "bluesky", account: "yourbrand.bsky.social (sample)", agentPostable: true, rules: { maxChars: 300, threads: true, media: true } },
]

const sampleQueue: ScheduledEntry[] = []
let sampleId = 100

/** About how many posts a long text becomes when split into a numbered thread (room left for " (n/m)"). */
export function threadParts(text: string, limit: number): number {
  return text.length <= limit ? 1 : Math.ceil(text.length / (limit - 8))
}

export const sampleStudio: Studio = {
  kind: "sample",
  async listChannels() {
    return {
      autonomy: "copilot",
      autonomyNote: "Sample studio: scheduled posts become drafts in this app's memory. Nothing is posted anywhere.",
      channels: SAMPLE_CHANNELS,
    }
  },
  async listScheduled(status) {
    return sampleQueue.filter((e) => !status || e.status === status).sort((a, b) => a.publishAt.localeCompare(b.publishAt))
  },
  async schedule({ text, channels, publishAt }) {
    const at = publishAt ? new Date(publishAt).toISOString() : new Date(Date.now() + 120_000).toISOString()
    const entries = channels.map((name) => {
      const ch = SAMPLE_CHANNELS.find((c) => c.channel === name)
      if (!ch) throw new StudioError(`The sample studio has no '${name}' channel. Connected: ${SAMPLE_CHANNELS.map((c) => c.channel).join(", ")}.`, 400)
      const entry: ScheduledEntry = { id: ++sampleId, status: "draft", publishAt: at, channel: ch.channel, account: ch.account, title: text.slice(0, 80) }
      sampleQueue.push(entry)
      return { id: entry.id, channel: ch.channel, account: ch.account, status: "draft", publishAt: at, thread: threadParts(text, ch.rules.maxChars ?? text.length) }
    })
    return { ok: true, mode: "copilot", entries, userAction: "Sample studio: drafts kept in memory. Nothing was posted." }
  },
  async cancel(id) {
    const entry = sampleQueue.find((e) => e.id === id && (e.status === "draft" || e.status === "scheduled"))
    if (!entry) throw new StudioError(`Entry ${id} not found or not cancellable.`, 400)
    entry.status = "cancelled"
    return { ok: true, id, status: "cancelled" }
  },
}

/** Social Studio when a key is set; the sample studio in demo mode or with DEMO_DATA=true. */
export function activeStudio(): Studio {
  const s = socialSettings()
  if (isDemo()) return sampleStudio
  if (s.apiKey) return socialStudio(s.url, s.apiKey)
  if (s.demoData) return sampleStudio
  throw new StudioError("Social Studio is not connected. Set SOCIAL_API_KEY (see Setup), or DEMO_DATA=true to try the sample studio.", 400)
}
