"use client";

import { useParams } from "next/navigation";
import { AgentRoom } from "@/components/agents/AgentRoom";
import { PageHeader } from "@/components/common/PageHeader";

export default function AgentRoomPage() {
  const params = useParams<{ runId: string }>();
  const runId = decodeURIComponent(params.runId);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Agent Room"
        subtitle="Four AI agents negotiate your week. Doctor's rules never move."
      />
      <AgentRoom key={runId} runId={runId} />
    </div>
  );
}
