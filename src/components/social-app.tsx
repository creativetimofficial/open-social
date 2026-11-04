"use client"

import { Badge } from "@agent-starters/ui/components/badge"
import { AppShell, SidebarBrand, SidebarSection, StatusChips, ThreadList } from "@agent-starters/ui/agent/app-shell"
import { ChatView } from "@agent-starters/ui/agent/chat-view"
import { AuditPanel, CapabilityTable, Empty, List, Panel, PolicyList, Row, SearchProviders } from "@agent-starters/ui/agent/panels"
import { useAgentChat } from "@agent-starters/ui/agent/use-agent-chat"
import { ConfirmationField } from "@agent-starters/ui/elements/confirmation"
import { ConversationEmptyState } from "@agent-starters/ui/elements/conversation"
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@agent-starters/ui/elements/prompt-input"
import { Suggestion, Suggestions } from "@agent-starters/ui/elements/suggestion"
import { CalendarClock, ExternalLink, Megaphone } from "lucide-react"
import { useEffect, useState } from "react"

import type { Capabilities } from "@/lib/capabilities"
import type { ScheduledEntry } from "@/lib/studio"

const TOOL_LABEL: Record<string, string> = {
  "social.channels": "Read channels",
  "social.queue": "Read calendar",
  "social.schedule": "Schedule post",
  "social.cancel": "Cancel post",
  "search.web": "Web search",
  "page.read": "Read page",
}
const toolLabel = (tool: string) => TOOL_LABEL[tool] ?? tool

const STATUS: Record<ScheduledEntry["status"], "warning" | "brand" | "secondary" | "success" | "destructive" | "outline"> = {
  draft: "warning",
  scheduled: "brand",
  publishing: "secondary",
  published: "success",
  failed: "destructive",
  cancelled: "outline",
}

const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

export function SocialApp({ initialCapabilities: caps }: { initialCapabilities: Capabilities }) {
  const [version, setVersion] = useState(0)
  const chat = useAgentChat({
    onEvent: (e) => {
      if (e.type === "tool_result" && e.ok && (e.tool === "social.schedule" || e.tool === "social.cancel")) setVersion((v) => v + 1)
    },
    onSettled: () => setVersion((v) => v + 1),
  })
  const [tab, setTab] = useState(caps.studio.connected || caps.studio.sample ? "calendar" : "setup")
  const [input, setInput] = useState("")

  const send = (text: string) => {
    setInput("")
    void chat.send(text)
  }

  return (
    <AppShell
      sidebar={
        <>
          <SidebarBrand name={caps.agent.name} tagline={caps.agent.tagline} icon={<Megaphone />} onNew={chat.reset} />
          <SidebarSection title="Conversations" className="min-h-0 flex-1 overflow-y-auto">
            <ThreadList threads={chat.threads} activeId={chat.threadId} onSelect={(t) => void chat.openThread(t.id)} onDelete={(id) => void chat.deleteThread(id)} />
          </SidebarSection>
        </>
      }
      header={
        <StatusChips caps={caps}>
          {caps.studio.sample ? <Badge variant="warning">Sample studio</Badge> : <Badge variant={caps.studio.connected ? "success" : "outline"}>{caps.studio.connected ? "Social Studio" : "Social Studio not connected"}</Badge>}
        </StatusChips>
      }
      composer={
        <PromptInput onSubmit={() => send(input)}>
          <PromptInputTextarea value={input} onChange={(e) => setInput(e.target.value)} onSubmit={() => send(input)} placeholder="Announce…, turn this link into posts…, what's on my calendar?" />
          <PromptInputFooter>
            <PromptInputTools>Every post waits for your approval before it is scheduled.</PromptInputTools>
            <PromptInputSubmit running={chat.running} disabled={!input.trim()} onStop={() => void chat.stop()} />
          </PromptInputFooter>
        </PromptInput>
      }
      tab={tab}
      onTabChange={setTab}
      tabs={[
        { id: "calendar", label: "Calendar", content: <CalendarPanel version={version} /> },
        { id: "activity", label: "Activity", content: <AuditPanel version={version} label={toolLabel} /> },
        { id: "setup", label: "Setup", content: <SetupPanel caps={caps} /> },
      ]}
    >
      <ChatView
        turns={chat.turns}
        approvals={chat.approvals}
        onDecide={(id, d) => void chat.decide(id, d)}
        error={chat.error}
        toolLabel={toolLabel}
        renderApproval={(a) => {
          const i = (a.input ?? {}) as { text?: string; channels?: string[]; publish_at?: string; id?: number }
          if (a.tool === "social.schedule") {
            const text = i.text ?? ""
            return {
              title: "Schedule this post?",
              approveLabel: "Schedule",
              body: (
                <div>
                  <ConfirmationField label="Channels">{(i.channels ?? []).join(", ")}</ConfirmationField>
                  <ConfirmationField label="When">{i.publish_at ? when(i.publish_at) : "In about two minutes"}</ConfirmationField>
                  <p className="mt-2 rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{text}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {text.length} characters. Longer than a channel allows becomes a numbered thread. In copilot mode it is a draft until you approve it on your Content Calendar.
                  </p>
                </div>
              ),
            }
          }
          if (a.tool === "social.cancel") return { title: `Cancel calendar entry #${i.id}?`, approveLabel: "Cancel post" }
          return null
        }}
        empty={
          <ConversationEmptyState
            icon={<Megaphone className="size-6" />}
            title="What should we post?"
            description={
              !caps.studio.connected && !caps.studio.sample ? (
                <>
                  Connect Social Studio under{" "}
                  <button onClick={() => setTab("setup")} className="text-brand underline-offset-2 hover:underline">
                    Setup
                  </button>{" "}
                  first, or set DEMO_DATA=true to try the sample studio.
                </>
              ) : (
                caps.agent.tagline
              )
            }
          >
            <Suggestions className="mt-4 max-w-2xl">
              {caps.agent.suggestions.map((s) => (
                <Suggestion key={s} suggestion={s} onClick={send} />
              ))}
            </Suggestions>
          </ConversationEmptyState>
        }
      />
    </AppShell>
  )
}

function CalendarPanel({ version }: { version: number }) {
  const [data, setData] = useState<{ entries: ScheduledEntry[]; error?: string; sample?: boolean } | null>(null)
  useEffect(() => {
    void fetch("/api/queue")
      .then((r) => r.json())
      .then((d: { entries: ScheduledEntry[]; error?: string; sample?: boolean }) => setData(d))
      .catch(() => setData({ entries: [], error: "Could not load the calendar." }))
  }, [version])
  if (!data) return null
  if (data.error) return <Empty>{data.error}</Empty>
  if (data.entries.length === 0) return <Empty>Posts you approve land here, from your Content Calendar{data.sample ? " (sample studio)" : ""}.</Empty>
  return (
    <List>
      {data.entries.map((e) => (
        <Row
          key={e.id}
          title={
            <span className="flex items-center gap-2">
              <CalendarClock className="size-3.5 text-brand" />
              <span className="truncate">{e.title ?? `#${e.id}`}</span>
            </span>
          }
          detail={`${e.channel ?? "?"} · ${when(e.publishAt)}${e.error ? ` · ${e.error}` : ""}`}
          trailing={
            <span className="flex items-center gap-2">
              <Badge variant={STATUS[e.status]}>{e.status}</Badge>
              {e.url && (
                <a href={e.url} target="_blank" rel="noreferrer noopener" aria-label="Open post" className="text-brand">
                  <ExternalLink className="size-4" />
                </a>
              )}
            </span>
          }
        />
      ))}
    </List>
  )
}

function SetupPanel({ caps }: { caps: Capabilities }) {
  return (
    <div className="space-y-6">
      <Panel title="Social Studio">
        <List>
          <div className="space-y-2 p-3 text-sm">
            {caps.studio.connected ? (
              <p>
                Connected through <code className="font-mono text-xs break-all">{caps.studio.url}</code>. Channels, the Content Calendar and the copilot/autopilot setting live in your Creative Tim account.
              </p>
            ) : (
              <p>
                Set <code className="font-mono text-xs">SOCIAL_API_KEY</code> to a key with the <code className="font-mono text-xs">social:draft</code> scope (add <code className="font-mono text-xs">social:publish</code> only for autopilot), from creative-tim.com/dashboard/api-keys or a CompanyFabric key on a linked account.
              </p>
            )}
            {caps.studio.sample && <p className="text-xs text-warning">Using the sample studio: fictional channels, nothing is posted.</p>}
          </div>
        </List>
        {!caps.passwordProtected && <p className="px-1 text-xs text-warning">No APP_PASSWORD set: anyone who can open this app can approve posts to your channels.</p>}
      </Panel>
      <Panel title="Tool policies" description="Enforced on the server, whichever runtime asks.">
        <PolicyList policies={caps.policies} label={toolLabel} />
      </Panel>
      <Panel title="Search">
        <SearchProviders search={caps.search} />
      </Panel>
      <Panel title="Lite vs Hermes">
        <CapabilityTable matrix={caps.matrix} />
      </Panel>
    </div>
  )
}
