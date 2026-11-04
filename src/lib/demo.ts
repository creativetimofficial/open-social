import type { Runtime } from "@agent-starters/kit/runtime/types"

/**
 * DEMO: a scripted turn for a fresh clone with no model key. No model is
 * called. The tools, approval and audit are the real ones, run on the sample
 * studio: it reads the channels and the calendar, then asks you to approve a
 * post for X and Bluesky tomorrow at 10:00 UTC. Nothing is posted anywhere.
 */

const say = async (turn: Parameters<Runtime>[0], text: string) => {
  for (const word of text.split(/(?<=\s)/)) {
    turn.emit({ type: "message_delta", text: word })
    await new Promise((r) => setTimeout(r, 12))
  }
}

export function tomorrowAt10(now = new Date()): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(10, 0, 0, 0)
  return d.toISOString()
}

export const POST =
  "We just open-sourced a research agent that cites every claim it makes. Ask a question, get an answer with numbered sources you can check. Runs in Docker or on Vercel. #opensource #AI"

export const runDemo: Runtime = async (turn) => {
  const call = (name: string, input: unknown) =>
    turn.broker.runTool(name, input, `demo_${name}_${crypto.randomUUID().slice(0, 6)}`, {
      agent: turn.agent,
      runId: turn.runId,
      threadId: turn.threadId,
      initiator: "demo",
      signal: turn.signal,
      emit: turn.emit,
      sources: turn.sources,
      toolCalls: turn.toolCalls,
    })

  await call("social_channels", {})
  await call("social_queue", {})
  const scheduled = await call("social_schedule", { text: POST, channels: ["x", "bluesky"], publish_at: tomorrowAt10() })

  const text = [
    "**DEMO: scripted turn on the sample studio. No model was called and nothing is posted.** Add a model key and a Social Studio key in `.env` for live work.",
    "",
    `I wrote one post for X and Bluesky (${POST.length} characters, under both limits):`,
    "",
    `> ${POST}`,
    "",
    scheduled.ok
      ? "It is scheduled for tomorrow at 10:00 UTC. The account is in **copilot** mode, so it is a draft until you approve it on the Content Calendar."
      : `It was not scheduled: ${scheduled.content.replace(/^Tool not run: /, "")}`,
  ].join("\n")
  await say(turn, text)
  return { text, usage: { inputTokens: 0, outputTokens: 0 } }
}
