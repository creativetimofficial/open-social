import { SocialApp } from "@/components/social-app"
import { capabilities } from "@/lib/capabilities"

export const dynamic = "force-dynamic"

export default function Page() {
  return <SocialApp initialCapabilities={capabilities()} />
}
