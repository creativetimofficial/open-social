import type { AgentProfile, AppInfo } from "@agent-starters/kit/agent"
import { createBroker } from "@agent-starters/kit/tools/broker"
import { webTools } from "@agent-starters/kit/tools/web"

import { agent } from "../../social.config"
import { socialTools } from "@/lib/tools"

export const app: AppInfo = { id: "open-social", version: "0.1.0" }

/** Every tool this app can run; social.config.ts decides which the agent may use. */
export const broker = createBroker([...socialTools, ...webTools(app)])

/** The profile for a turn starting now: scheduling needs the exact time. */
export function agentProfile(at = new Date()): AgentProfile {
  return { ...agent, instructions: `${agent.instructions}\nThe current time is ${at.toISOString()}. Give times to the user in their own words (e.g. "tomorrow at 10:00") and pass ISO 8601 with an offset to tools.` }
}

export { agent }
