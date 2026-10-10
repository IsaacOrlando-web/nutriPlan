"use client";

import { useParams } from "next/navigation";
import { AgentRoom } from "@/components/agents/AgentRoom";

export default function AgentRoomPage() {
  const params = useParams<{ runId: string }>();
  const runId = decodeURIComponent(params.runId);
  return <AgentRoom key={runId} runId={runId} />;
}
