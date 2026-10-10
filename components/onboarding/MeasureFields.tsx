"use client";

import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { cmToFtIn, ftInToCm, kgToLb, lbToKg, type OnboardingValues } from "./onboardingSchema";

type Units = "metric" | "imperial";

function UnitToggle({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: Units;
  onChange: (u: Units) => void;
  options: Record<Units, string>;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border bg-surface-sunken p-0.5"
    >
      {(Object.keys(options) as Units[]).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          onClick={() => onChange(u)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === u ? "bg-surface-raised text-ink shadow-sm" : "text-ink-muted hover:text-ink",
          )}
        >
          {options[u]}
        </button>
      ))}
    </div>
  );
}

const toNum = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
const show = (n: number) => (Number.isFinite(n) ? String(n) : "");

export function HeightField() {
  const { register, setValue, getValues, formState } = useFormContext<OnboardingValues>();
  const [units, setUnits] = useState<Units>("metric");
  const [ft, setFt] = useState("");
  const [inches, setInches] = useState("");
  const error = formState.errors.heightCm?.message;
  const heightCm = useWatch<OnboardingValues, "heightCm">({ name: "heightCm" });

  const switchTo = (u: Units) => {
    if (u === "imperial") {
      const cm = getValues("heightCm");
      const parts = Number.isFinite(cm) ? cmToFtIn(cm) : null;
      setFt(parts ? String(parts.ft) : "");
      setInches(parts ? String(parts.in) : "");
    }
    setUnits(u);
  };

  const writeImperial = (nextFt: string, nextIn: string) => {
    const f = toNum(nextFt);
    const i = nextIn.trim() === "" ? 0 : toNum(nextIn);
    const cm = Number.isFinite(f) && Number.isFinite(i) && i >= 0 && i < 12 ? ftInToCm(f, i) : Number.NaN;
    setValue("heightCm", cm, { shouldValidate: formState.isSubmitted || !!error, shouldDirty: true });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={units === "metric" ? "heightCm" : "heightFt"}>Height</Label>
        <UnitToggle
          label="Height units"
          value={units}
          onChange={switchTo}
          options={{ metric: "cm", imperial: "ft / in" }}
        />
      </div>
      {units === "metric" ? (
        <Input
          id="heightCm"
          data-testid="onboarding-heightCm"
          type="number"
          inputMode="decimal"
          step="any"
          placeholder="170"
          aria-invalid={!!error}
          className={cn("h-12 text-base", error && "border-danger")}
          {...register("heightCm", { valueAsNumber: true })}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Input
              id="heightFt"
              type="number"
              inputMode="numeric"
              min={3}
              max={8}
              placeholder="5"
              aria-label="Feet"
              aria-invalid={!!error}
              className={cn("h-12 pr-10 text-base", error && "border-danger")}
              value={ft}
              onChange={(e) => {
                setFt(e.target.value);
                writeImperial(e.target.value, inches);
              }}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-subtle">
              ft
            </span>
          </div>
          <div className="relative">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={11}
              placeholder="7"
              aria-label="Inches"
              aria-invalid={!!error}
              className={cn("h-12 pr-10 text-base", error && "border-danger")}
              value={inches}
              onChange={(e) => {
                setInches(e.target.value);
                writeImperial(ft, e.target.value);
              }}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-subtle">
              in
            </span>
          </div>
        </div>
      )}
      {error ? (
        <p className="text-xs text-danger">
          {units === "imperial" ? "Height must be between 3 ft 11 in and 7 ft 6 in." : error}
        </p>
      ) : (
        units === "imperial" &&
        show(heightCm) && <p className="text-xs text-ink-subtle">Saved as {show(heightCm)} cm</p>
      )}
    </div>
  );
}

export function WeightField() {
  const { register, setValue, getValues, formState } = useFormContext<OnboardingValues>();
  const [units, setUnits] = useState<Units>("metric");
  const [lb, setLb] = useState("");
  const error = formState.errors.weightKg?.message;
  const weightKg = useWatch<OnboardingValues, "weightKg">({ name: "weightKg" });

  const switchTo = (u: Units) => {
    if (u === "imperial") {
      const kg = getValues("weightKg");
      setLb(Number.isFinite(kg) ? String(kgToLb(kg)) : "");
    }
    setUnits(u);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={units === "metric" ? "weightKg" : "weightLb"}>Weight</Label>
        <UnitToggle
          label="Weight units"
          value={units}
          onChange={switchTo}
          options={{ metric: "kg", imperial: "lb" }}
        />
      </div>
      {units === "metric" ? (
        <Input
          id="weightKg"
          data-testid="onboarding-weightKg"
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder="75"
          aria-invalid={!!error}
          className={cn("h-12 text-base", error && "border-danger")}
          {...register("weightKg", { valueAsNumber: true })}
        />
      ) : (
        <Input
          id="weightLb"
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder="165"
          aria-invalid={!!error}
          className={cn("h-12 text-base", error && "border-danger")}
          value={lb}
          onChange={(e) => {
            setLb(e.target.value);
            const n = toNum(e.target.value);
            setValue("weightKg", Number.isFinite(n) ? lbToKg(n) : Number.NaN, {
              shouldValidate: formState.isSubmitted || !!error,
              shouldDirty: true,
            });
          }}
        />
      )}
      {error ? (
        <p className="text-xs text-danger">
          {units === "imperial" ? "Weight must be between 66 and 661 lb." : error}
        </p>
      ) : (
        <p className="text-xs text-ink-subtle">
          {units === "imperial" && show(weightKg) ? `Saved as ${show(weightKg)} kg. ` : ""}A rough number is
          fine, Monitor learns the real trend from your readings.
        </p>
      )}
    </div>
  );
}
