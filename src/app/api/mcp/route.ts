import { mcpPost } from "@agent-starters/kit/mcp"

import { app, agentProfile, broker } from "@/lib/agent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A tools/call can wait for a person's approval.
export const maxDuration = 800

/** POST /api/mcp: this app's tools as an MCP server, for Hermes. Bearer TOOL_TOKEN required. */
export function POST(request: Request) {
  return mcpPost({ broker, app, agents: () => [agentProfile()], defaultAgent: () => agentProfile() }, request)
}

/** No server-initiated stream is offered. */
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}
