"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertCard } from "@/components/common/AlertCard";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateReading, useReadings } from "@/lib/hooks/useReadings";
import { fmtDate } from "@/lib/utils";
import type { CreateReadingResponse, ReadingType } from "@/types/contracts";

const READING_TYPES: ReadingType[] = ["weight", "glucose_fasting", "glucose_post_meal", "bp"];
const TYPE_LABEL: Record<ReadingType, string> = {
  weight: "Weight",
  glucose_fasting: "Fasting glucose",
  glucose_post_meal: "Glucose after a meal",
  bp: "Blood pressure",
};
const UNITS: Record<ReadingType, string> = {
  weight: "kg",
  glucose_fasting: "mg/dL",
  glucose_post_meal: "mg/dL",
  bp: "mmHg",
};

// Safety thresholds from the spec (section 17): the API returns the real alert; the client mirrors it so nothing is missed offline.
const DANGER = { glucoseLow: 70, glucoseHigh: 300, systolic: 180, diastolic: 120 } as const;

// An empty diastolic input coerces to 0, which the refine below treats as missing for blood pressure.
const schema = z
  .object({
    type: z.enum(["weight", "glucose_fasting", "glucose_post_meal", "bp"]),
    value: z.coerce.number().positive(),
    value2: z.coerce.number().min(0).optional(),
  })
  .refine((v) => v.type !== "bp" || (v.value2 ?? 0) > 0, { path: ["value2"], message: "required" });
type Values = z.infer<typeof schema>;

function isDanger(type: ReadingType, value: number, value2?: number): boolean {
  if (type === "glucose_fasting" || type === "glucose_post_meal")
    return value < DANGER.glucoseLow || value > DANGER.glucoseHigh;
  if (type === "bp") return value > DANGER.systolic || (value2 ?? 0) > DANGER.diastolic;
  return false;
}

export default function ReadingPage() {
  const create = useCreateReading();
  const recent = useReadings();
  const [result, setResult] = useState<CreateReadingResponse | null>(null);
  const [danger, setDanger] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { type: "weight" } });
  const type = form.watch("type");

  const onSubmit = async (v: Values) => {
    setDanger(isDanger(v.type, v.value, v.value2));
    try {
      const res = await create.mutateAsync({
        type: v.type,
        value: v.value,
        ...(v.type === "bp" && v.value2 ? { value2: v.value2 } : {}),
      });
      setResult(res);
      toast.success("Reading saved.");
      form.resetField("value");
      form.resetField("value2");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the reading.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log a reading"
        subtitle="Weight, glucose or blood pressure. Monitor reads the trend, not one number."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New reading</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="reading-type">Type</Label>
                <select
                  id="reading-type"
                  data-testid="reading-type"
                  className="flex h-10 w-full rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register("type")}
                >
                  {READING_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {TYPE_LABEL[rt]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={type === "bp" ? "grid grid-cols-2 gap-3" : ""}>
                <div className="space-y-1.5">
                  <Label htmlFor="reading-value">
                    {type === "bp" ? "Systolic (mmHg)" : `Value (${UNITS[type]})`}
                  </Label>
                  <Input
                    id="reading-value"
                    data-testid="reading-value"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    {...form.register("value")}
                  />
                  {form.formState.errors.value && (
                    <p className="text-xs text-danger">Enter a valid number.</p>
                  )}
                </div>
                {type === "bp" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="reading-value2">Diastolic (mmHg)</Label>
                    <Input
                      id="reading-value2"
                      data-testid="reading-value2"
                      type="number"
                      inputMode="numeric"
                      {...form.register("value2")}
                    />
                    {form.formState.errors.value2 && (
                      <p className="text-xs text-danger">Enter a valid number.</p>
                    )}
                  </div>
                )}
              </div>
              <Button
                type="submit"
                data-testid="reading-submit"
                className="w-full"
                size="lg"
                disabled={create.isPending}
              >
                {create.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                Save reading
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {create.isPending && <LoadingState variant="list" rows={2} />}
          {create.error && !create.isPending && <ErrorState error={create.error} />}
          {(danger || result) && !create.isPending && (
            <div data-testid="monitor-result" className="space-y-3">
              {danger && (
                <AlertCard
                  level="urgent"
                  title="This reading is outside the safe range"
                  body="Glucose under 70 or over 300 mg/dL, or blood pressure over 180/120, needs attention right away."
                />
              )}
              {result?.monitor.alerts.map((a, i) => (
                <AlertCard key={i} level={a.level} title={a.title} body={a.body} source={a.source} />
              ))}
              {result && result.monitor.alerts.length === 0 && (
                <AlertCard level="info" title="Monitor" body={result.monitor.reason} />
              )}
              {result?.monitor.tdee && (
                <p className="text-xs text-ink-muted">
                  Estimated metabolism: {Math.round(result.monitor.tdee.mean)} ±{" "}
                  {Math.round(result.monitor.tdee.sd)} kcal a day
                </p>
              )}
              {result?.monitor.action === "replan" && result.monitor.runId && (
                <Button asChild>
                  <Link href={`/agents/${result.monitor.runId}`}>
                    <Sparkles aria-hidden="true" />
                    Watch Monitor replan
                  </Link>
                </Button>
              )}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent readings</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.isLoading && <LoadingState variant="list" rows={3} />}
              {recent.error && <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />}
              {recent.data && recent.data.length === 0 && (
                <p className="text-sm text-ink-muted">No readings yet.</p>
              )}
              {recent.data && recent.data.length > 0 && (
                <ul className="divide-y text-sm">
                  {[...recent.data]
                    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
                    .slice(0, 6)
                    .map((r) => (
                      <li key={r.readingId} className="flex items-center justify-between py-2">
                        <span className="text-ink-muted">{TYPE_LABEL[r.type]}</span>
                        <span className="tabular-nums">
                          <span className="font-semibold">
                            {r.value}
                            {r.value2 !== undefined ? `/${r.value2}` : ""}
                          </span>{" "}
                          <span className="text-ink-subtle">{r.unit}</span>
                        </span>
                        <span className="text-xs text-ink-subtle">
                          {fmtDate(r.takenAt, { month: "short", day: "numeric" })}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
