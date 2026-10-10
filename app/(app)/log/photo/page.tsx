"use client";

import { Camera, Check, Loader2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCard } from "@/components/common/AlertCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFoodSearch } from "@/lib/hooks/useFoods";
import { useCreateLog, usePhotoLog, useUploadPhoto } from "@/lib/hooks/useLogs";
import { cn } from "@/lib/utils";
import type {
  CreateLogResponse,
  FoodLogItem,
  MonitorResult,
  PhotoLogResult,
  VisionReading,
} from "@/types/contracts";

export default function PhotoLogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Log a meal"
        subtitle="Two vision models from different providers read your photo and vote."
      />
      <Tabs defaultValue="photo">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
          <TabsTrigger value="photo">Photo</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
        </TabsList>
        <TabsContent value="photo">
          <PhotoTab />
        </TabsContent>
        <TabsContent value="manual">
          <ManualTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MonitorResultView({ monitor }: { monitor: MonitorResult }) {
  return (
    <div className="space-y-3">
      {monitor.alerts.map((a, i) => (
        <AlertCard key={i} level={a.level} title={a.title} body={a.body} source={a.source} />
      ))}
      {monitor.alerts.length === 0 && <AlertCard level="info" title="Logged" body={monitor.reason} />}
      {monitor.action === "replan" && monitor.runId && (
        <Button asChild variant="outline">
          <Link href={`/agents/${monitor.runId}`}>
            <Sparkles aria-hidden="true" />
            Watch Monitor replan
          </Link>
        </Button>
      )}
    </div>
  );
}

function PhotoTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<PhotoLogResult | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [done, setDone] = useState<CreateLogResponse | null>(null);
  const upload = useUploadPhoto();
  const photo = usePhotoLog();
  const create = useCreateLog();

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const analyze = async () => {
    if (!file) return;
    setResult(null);
    setDone(null);
    setAnswer(null);
    try {
      const { url } = await upload.mutateAsync(file);
      const res = await photo.mutateAsync({ photoUrl: url });
      setResult(res);
      if (res.logged)
        toast.success(`Models agree (${Math.round(res.votes.agreement * 100)}%). Confirm to log.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not analyze the photo.");
    }
  };

  const confirm = async () => {
    if (!result) return;
    // The question is about an item only one model saw. The first option confirms it, so log it too.
    const confirmsDisputed = result.entry.question !== null && answer === result.entry.question.options[0];
    const disputed = [...result.votes.a.items, ...result.votes.b.items].filter(
      (v) => !result.entry.items.some((i) => i.foodId === v.foodId),
    );
    const items = confirmsDisputed ? [...result.entry.items, ...disputed] : result.entry.items;
    try {
      const res = await create.mutateAsync({
        items: items.map((i) => ({
          foodId: i.foodId,
          grams: i.grams,
          confidence: i.confidence,
        })),
        source: "photo",
        photoUrl: result.entry.photoUrl,
        visionAgreement: result.votes.agreement,
        eatenAt: result.entry.eatenAt,
      });
      setDone(res);
      toast.success("Logged. Monitor has it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the log.");
    }
  };

  const busy = upload.isPending || photo.isPending;
  const analyzeError = upload.error ?? photo.error;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Your photo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label
            htmlFor="photo-input"
            className={cn(
              "flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed bg-surface-sunken text-sm text-ink-muted transition-colors hover:border-brand",
              preview && "border-solid",
            )}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Photo of your meal" className="h-full w-full object-cover" />
            ) : (
              <>
                <Camera className="h-8 w-8" aria-hidden="true" />
                <span>Take or choose a photo</span>
              </>
            )}
          </label>
          <Input
            id="photo-input"
            data-testid="photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-label="Take or choose a photo"
          />
          <Button
            data-testid="photo-analyze"
            className="w-full"
            size="lg"
            disabled={!file || busy}
            onClick={() => void analyze()}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {busy ? "Two models are looking…" : "Analyze"}
          </Button>
          {analyzeError && !busy && <ErrorState error={analyzeError} onRetry={() => void analyze()} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the models saw</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {busy && <LoadingState variant="list" rows={3} />}
          {!busy && !result && (
            <EmptyState title="No photo analyzed yet" body="Pick a photo and tap Analyze." icon={Sparkles} />
          )}
          {result && !busy && (
            <div data-testid="vision-result" className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-muted">Model agreement</span>
                <Badge variant={result.votes.agreement >= 0.75 ? "success" : "warning"}>
                  {Math.round(result.votes.agreement * 100)}%
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <VisionColumn reading={result.votes.a} />
                <VisionColumn reading={result.votes.b} />
              </div>

              {!result.logged && result.entry.question && (
                <div className="space-y-2 rounded-xl border border-warning/40 bg-warning-soft p-3">
                  <p className="text-sm font-semibold">{result.entry.question.text}</p>
                  <div className="flex flex-wrap gap-2">
                    {result.entry.question.options.map((opt) => (
                      <Button
                        key={opt}
                        size="sm"
                        variant={answer === opt ? "default" : "outline"}
                        onClick={() => setAnswer(opt)}
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {result.entry.photoUrl && (
                <div className="relative h-24 w-full overflow-hidden rounded-lg bg-surface-sunken">
                  <Image
                    src={result.entry.photoUrl}
                    alt="Photo of your meal"
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 480px, 100vw"
                    unoptimized
                  />
                </div>
              )}

              <div className="rounded-lg bg-surface-sunken px-3 py-2 text-sm">
                <span className="font-semibold">{Math.round(result.entry.totals.calories)} kcal</span>
                <span className="text-ink-muted">
                  {" "}
                  · {Math.round(result.entry.totals.proteinG)} g protein ·{" "}
                  {Math.round(result.entry.totals.carbsG)} g carbs
                </span>
              </div>

              {!done ? (
                <Button
                  data-testid="photo-confirm"
                  className="w-full"
                  size="lg"
                  disabled={create.isPending || (!result.logged && result.entry.question !== null && !answer)}
                  onClick={() => void confirm()}
                >
                  {create.isPending ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Check aria-hidden="true" />
                  )}
                  Confirm and log
                </Button>
              ) : (
                <MonitorResultView monitor={done.monitor} />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VisionColumn({ reading }: { reading: VisionReading }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="mb-2 truncate font-mono text-[11px] text-ink-muted" title={reading.model}>
        {reading.model}
      </p>
      <ul className="space-y-1.5">
        {reading.items.map((item) => (
          <li key={item.foodId} className="text-xs">
            <p className="truncate font-medium">{item.name}</p>
            <p className="text-ink-muted">
              {item.grams} g · {Math.round(item.confidence * 100)}% sure
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ManualItem = Pick<FoodLogItem, "foodId" | "name" | "grams">;

function ManualTab() {
  const [query, setQuery] = useState("");
  const [grams, setGrams] = useState<Record<string, number>>({});
  const [items, setItems] = useState<ManualItem[]>([]);
  const [done, setDone] = useState<CreateLogResponse | null>(null);
  const search = useFoodSearch(query);
  const create = useCreateLog();
  const totalGrams = useMemo(() => items.reduce((s, i) => s + i.grams, 0), [items]);

  const add = (foodId: string, name: string, servingG: number) => {
    const g = grams[foodId] ?? servingG;
    setItems((prev) => [...prev.filter((i) => i.foodId !== foodId), { foodId, name, grams: g }]);
  };

  const submit = async () => {
    try {
      const res = await create.mutateAsync({
        items: items.map((i) => ({ foodId: i.foodId, grams: i.grams })),
        source: "manual",
      });
      setDone(res);
      setItems([]);
      toast.success("Logged. Monitor has it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the log.");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Search foods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="chicken, beans, rice…"
              aria-label="Search foods"
              className="pl-9"
            />
          </div>
          {search.isLoading && <LoadingState variant="list" rows={3} />}
          {search.error && <ErrorState error={search.error} onRetry={() => void search.refetch()} />}
          {query.trim().length < 2 && <p className="text-sm text-ink-muted">Type at least two letters.</p>}
          {search.data && search.data.length === 0 && <EmptyState title="No foods match." />}
          {search.data && search.data.length > 0 && (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
              {search.data.map((food) => (
                <li key={food.foodId} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{food.name}</p>
                    <p className="text-xs text-ink-muted">
                      {food.servingLabel} · {food.per100g.calories} kcal / 100 g
                    </p>
                  </div>
                  <Label htmlFor={`g-${food.foodId}`} className="sr-only">
                    Grams
                  </Label>
                  <Input
                    id={`g-${food.foodId}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="h-8 w-20 text-sm"
                    value={grams[food.foodId] ?? food.servingG}
                    onChange={(e) => setGrams((p) => ({ ...p, [food.foodId]: Number(e.target.value) }))}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => add(food.foodId, food.name, food.servingG)}
                    aria-label="Add"
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your meal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && !done && <EmptyState title="Nothing added yet" />}
          {items.length > 0 && (
            <ul className="divide-y rounded-xl border">
              {items.map((item) => (
                <li key={item.foodId} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="tabular-nums text-ink-muted">{item.grams} g</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setItems((p) => p.filter((i) => i.foodId !== item.foodId))}
                    aria-label="Remove"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <>
              <p className="text-xs text-ink-muted">{totalGrams} g total</p>
              <Button className="w-full" size="lg" disabled={create.isPending} onClick={() => void submit()}>
                {create.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                Log meal
              </Button>
            </>
          )}
          {done && <MonitorResultView monitor={done.monitor} />}
        </CardContent>
      </Card>
    </div>
  );
}
