"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TrendChart } from "@/components/charts/TrendChart";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTrend } from "@/lib/hooks/useReadings";
import { fmtNumber } from "@/lib/utils";
import type { ReadingType, Trend } from "@/types/contracts";

type TrendTab = "weight" | "glucose_fasting" | "bp";
const TABS: { id: TrendTab; label: string; testId: string; unit: string }[] = [
  { id: "weight", label: "Weight", testId: "trend-tab-weight", unit: "kg" },
  { id: "glucose_fasting", label: "Glucose", testId: "trend-tab-glucose", unit: "mg/dL" },
  { id: "bp", label: "Blood pressure", testId: "trend-tab-bp", unit: "mmHg" },
];
const ALERT_LABEL: Record<Trend["alert"], string> = {
  none: "On track",
  rising: "Rising",
  falling: "Falling",
  stalled: "Stalled",
  too_fast: "Changing too fast",
};
const ALERT_VARIANT: Record<Trend["alert"], "secondary" | "warning" | "danger" | "success"> = {
  none: "success",
  rising: "warning",
  falling: "warning",
  stalled: "warning",
  too_fast: "danger",
};

export default function TrendsPage() {
  const profile = useProfile();
  const [showAll, setShowAll] = useState(false);
  const hasConditions = (profile.data?.profile.conditions.length ?? 0) > 0;
  const tabs = hasConditions || showAll ? TABS : TABS.filter((t) => t.id === "weight");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trends"
        subtitle="A Kalman filter separates your true trend from day to day noise."
        actions={
          !hasConditions && (
            <div className="flex items-center gap-2">
              <Checkbox id="show-all" checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
              <Label htmlFor="show-all" className="text-sm font-normal text-ink-muted">
                Show glucose and blood pressure
              </Label>
            </div>
          )
        }
      />
      <Tabs defaultValue="weight" key={tabs.length}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} data-testid={tab.testId}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            <TrendPanel type={tab.id} unit={tab.unit} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TrendPanel({ type, unit }: { type: TrendTab; unit: string }) {
  const trend = useTrend(type as ReadingType);

  if (trend.isLoading) return <LoadingState variant="chart" />;
  if (trend.error) return <ErrorState error={trend.error} onRetry={() => void trend.refetch()} />;
  if (!trend.data || trend.data.points.length === 0) {
    return (
      <EmptyState
        title="No readings yet"
        body="Log a few readings and the trend appears here."
        action={
          <Button asChild size="sm">
            <Link href="/log/reading">Log a reading</Link>
          </Button>
        }
      />
    );
  }
  const data = trend.data;
  const slope = data.slopePerWeek;
  const Icon = slope >= 0 ? TrendingUp : TrendingDown;
  const last = data.points[data.points.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge data-testid="trend-alert" data-alert={data.alert} variant={ALERT_VARIANT[data.alert]}>
          {ALERT_LABEL[data.alert]}
        </Badge>
        <span className="flex items-center gap-1 text-sm text-ink-muted">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {fmtNumber(slope, { signDisplay: "always", maximumFractionDigits: 2 })} {unit} per week
        </span>
        <span className="text-sm text-ink-muted">
          Trend now: {fmtNumber(last.filtered, { maximumFractionDigits: 1 })} {unit}
        </span>
      </div>
      <Card>
        <CardContent className="p-2 sm:p-4">
          <TrendChart points={data.points} unit={unit} />
        </CardContent>
      </Card>
      <ul className="grid gap-2 text-sm text-ink-muted sm:grid-cols-3">
        <li className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-ink-muted" aria-hidden="true" />
          Dots are the readings you logged, noise included.
        </li>
        <li className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2">
          <span className="mt-2 h-0.5 w-4 shrink-0 rounded bg-brand" aria-hidden="true" />
          The line is the filtered trend: where your body really is.
        </li>
        <li className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2">
          <span className="mt-1 h-3 w-4 shrink-0 rounded bg-brand/20" aria-hidden="true" />
          The band is the range the trend is likely in.
        </li>
      </ul>
    </div>
  );
}
