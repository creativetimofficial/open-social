import { baseCapabilities, type CapabilityRow } from "@agent-starters/kit/capabilities"
import { isDemo } from "@agent-starters/kit/config"

import { suggestions, tagline } from "../../social.config"
import { agent, app } from "@/lib/agent"
import { socialSettings } from "@/lib/studio"

/** The lite-vs-Hermes matrix shown under Setup, for this agent. */
export const MATRIX: CapabilityRow[] = [
  { capability: "Posts written for each channel's rules", lite: "yes", hermes: "yes" },
  { capability: "Scheduling through Social Studio, after approval", lite: "yes", hermes: "yes", note: "Copilot mode adds a second approval on the Content Calendar" },
  { capability: "Research with citations before writing", lite: "yes", hermes: "yes" },
  { capability: "Audit row before every tool call", lite: "yes", hermes: "yes" },
  { capability: "Memory of brand voice across threads", lite: "no", hermes: "yes", note: "Hermes memory toolset" },
  { capability: "Recurring content plan (cron)", lite: "no", hermes: "not-in-ui-yet", note: "Hermes cron works; this UI does not manage schedules yet" },
  { capability: "Runs on serverless hosting (Vercel)", lite: "yes", hermes: "no", note: "Hermes needs a long-running container" },
]

export function capabilities() {
  const s = socialSettings()
  return {
    ...baseCapabilities(app, MATRIX),
    agent: { id: agent.id, name: agent.name, tagline, suggestions },
    policies: agent.tools,
    studio: {
      connected: Boolean(s.apiKey) && !isDemo(),
      url: s.url,
      sample: isDemo() || (!s.apiKey && s.demoData),
    },
    passwordProtected: Boolean(s.appPassword),
  }
}

export type Capabilities = ReturnType<typeof capabilities>
