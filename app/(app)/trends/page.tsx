"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
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
const TABS: {
  id: TrendTab;
  label: string;
  testId: string;
  unit: string;
  metric: string;
  decimals: number;
}[] = [
  {
    id: "weight",
    label: "Weight",
    testId: "trend-tab-weight",
    unit: "kg",
    metric: "Your weight",
    decimals: 1,
  },
  {
    id: "glucose_fasting",
    label: "Glucose",
    testId: "trend-tab-glucose",
    unit: "mg/dL",
    metric: "Your fasting glucose",
    decimals: 0,
  },
  {
    id: "bp",
    label: "Blood pressure",
    testId: "trend-tab-bp",
    unit: "mmHg",
    metric: "Your blood pressure",
    decimals: 0,
  },
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

/** One plain sentence from the alert and the weekly slope only. The numbers are the server's. */
function headline(tab: (typeof TABS)[number], trend: Trend): string {
  const slope = trend.slopePerWeek;
  const rate = `about ${fmtNumber(Math.abs(slope), { maximumFractionDigits: tab.decimals })} ${tab.unit} per week`;
  const direction = slope < 0 ? "down" : "up";
  switch (trend.alert) {
    case "stalled":
      return `${tab.metric} has been flat lately: the trend moves ${rate}, which is about nothing.`;
    case "rising":
      return `${tab.metric} is rising ${rate}.`;
    case "falling":
      return `${tab.metric} is falling ${rate}.`;
    case "too_fast":
      return `${tab.metric} is changing too fast: ${direction} ${rate}.`;
    default:
      return Math.abs(slope) < 0.05
        ? `${tab.metric} is holding steady.`
        : `${tab.metric} is on track, moving ${direction} ${rate}.`;
  }
}

export default function TrendsPage() {
  const profile = useProfile();
  const [showAll, setShowAll] = useState(false);
  const hasConditions = (profile.data?.profile.conditions.length ?? 0) > 0;
  const tabs = hasConditions || showAll ? TABS : TABS.filter((t) => t.id === "weight");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trends"
        subtitle="Readings bounce around day to day. The math underneath finds the real direction and tells Monitor when to act."
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
            <TrendPanel tab={tab} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TrendPanel({ tab }: { tab: (typeof TABS)[number] }) {
  const trend = useTrend(tab.id as ReadingType);

  if (trend.isLoading) return <LoadingState variant="chart" />;
  if (trend.error) return <ErrorState error={trend.error} onRetry={() => void trend.refetch()} />;
  if (!trend.data || trend.data.points.length === 0) {
    return (
      <EmptyState
        title={`No ${tab.label.toLowerCase()} readings yet`}
        body="Log a few readings and the trend line appears here."
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
  const Icon = Math.abs(slope) < 0.05 ? Minus : slope > 0 ? TrendingUp : TrendingDown;
  const last = data.points[data.points.length - 1];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-base font-semibold sm:text-lg" data-testid="trend-headline">
          {headline(tab, data)}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
          <Badge data-testid="trend-alert" data-alert={data.alert} variant={ALERT_VARIANT[data.alert]}>
            {ALERT_LABEL[data.alert]}
          </Badge>
          <span className="flex items-center gap-1 tabular-nums">
            <Icon className="h-4 w-4" aria-hidden="true" />
            {fmtNumber(slope, { signDisplay: "always", maximumFractionDigits: 2 })} {tab.unit} per week
          </span>
          <span className="tabular-nums">
            Trend now: {fmtNumber(last.filtered, { maximumFractionDigits: 1 })} {tab.unit}
          </span>
        </div>
      </div>
      <Card className="border-0 shadow-sm ring-1 ring-border">
        <CardContent className="p-2 sm:p-4">
          <TrendChart points={data.points} unit={tab.unit} />
        </CardContent>
      </Card>
      <p
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted"
        aria-label="Chart legend"
      >
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink-muted" aria-hidden="true" />
          Dots = what you logged.
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 shrink-0 rounded bg-brand" aria-hidden="true" />
          Line = your real trend after removing daily noise.
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 shrink-0 rounded bg-brand/20" aria-hidden="true" />
          Shaded = where the truth likely is.
        </span>
      </p>
    </div>
  );
}
