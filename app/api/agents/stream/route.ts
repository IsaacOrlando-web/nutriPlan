// GET /api/agents/stream?runId=: Server Sent Events of AgentEvent. Owner: Agents.
// Replays saved events, then streams new ones from store.waitForEvents; `event: done` after the decision
// or once the run stops running. Keep alive every 15 s. Stops when the client disconnects.
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { AgentEvent } from "@/types/contracts";
import { handler, HttpError, parseQuery } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({ runId: z.string().min(1) });
const WAIT_MS = 15_000;

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { runId } = parseQuery(req, QuerySchema);
  const store = getStore();
  const run = await store.getRun(runId);
  if (!run || run.userId !== userId) throw new HttpError(404, "Run not found");

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };
      const comment = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ${text}\n\n`));
        } catch {
          closed = true;
        }
      };
      const onAbort = () => {
        closed = true;
      };
      req.signal.addEventListener("abort", onAbort);

      try {
        comment("connected");
        const existing = await store.listEvents(runId);
        let count = 0;
        let done = false;
        const push = (e: AgentEvent) => {
          send("agent_event", JSON.stringify(e));
          count++;
          if (e.kind === "decision") done = true;
        };
        existing.forEach(push);
        if (!done) {
          const current = await store.getRun(runId);
          if (!current || current.status !== "running") done = true;
        }
        while (!done && !closed) {
          const fresh = await store.waitForEvents(runId, count, WAIT_MS);
          if (closed) break;
          if (fresh.length === 0) {
            const current = await store.getRun(runId);
            if (!current || current.status !== "running") {
              // Drain anything that landed between the wait and the status check.
              (await store.listEvents(runId)).slice(count).forEach(push);
              done = true;
              break;
            }
            comment("ping");
            send("ping", "{}");
            continue;
          }
          fresh.forEach(push);
        }
        if (!closed) {
          const final = await store.getRun(runId);
          send("done", JSON.stringify({ runId, status: final?.status ?? "done" }));
        }
      } catch (err) {
        if (!closed)
          send(
            "done",
            JSON.stringify({
              runId,
              status: "failed",
              error: err instanceof Error ? err.message : "stream error",
            }),
          );
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
