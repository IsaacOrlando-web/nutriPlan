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
        subtitle="Doctor, Chef, Budget and Monitor negotiate your week. Watch them live."
      />
      <AgentRoom key={runId} runId={runId} />
    </div>
  );
}
