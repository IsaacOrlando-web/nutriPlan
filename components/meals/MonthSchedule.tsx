"use client";

import { CalendarDays, ChevronLeft, ChevronRight, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePlannerMonth } from "@/lib/hooks/usePlanner";
import {
  addDays,
  formatLongDate,
  monthGrid,
  shiftMonth,
  weekStartOf,
  weekdayIndex,
} from "@/lib/planner/dates";
import { cn, fmtDate } from "@/lib/utils";
import type { PlannerMonthDay } from "@/types/contracts";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface MonthScheduleProps {
  /** YYYY-MM shown in the grid. */
  month: string;
  onMonthChange: (month: string) => void;
  /** Monday of the week open in the planner; its row is highlighted. */
  weekStart: string;
  /** Day whose dishes are listed under the grid. */
  focusDate: string;
  today: string;
  onPickDate: (date: string) => void;
  /** Grocery weekday (0 = Monday ... 6 = Sunday); every such day is painted amber. */
  shoppingWeekday: number | null;
  onShoppingWeekdayChange: (weekday: number | null) => void;
  className?: string;
}

/** Month calendar of saved weeks: planned days are marked, a tap opens that week and day in the planner. */
export function MonthSchedule({
  month,
  onMonthChange,
  weekStart,
  focusDate,
  today,
  onPickDate,
  shoppingWeekday,
  onShoppingWeekdayChange,
  className,
}: MonthScheduleProps) {
  const schedule = usePlannerMonth(month);
  const grid = monthGrid(month);
  const byDate = new Map<string, PlannerMonthDay>((schedule.data?.days ?? []).map((d) => [d.date, d]));
  const weekEnd = addDays(weekStart, 6);
  const focused = byDate.get(focusDate);
  const plannedCount = schedule.data?.days.length ?? 0;

  return (
    <Card data-testid="plan-month" className={cn("border-0 shadow-sm ring-1 ring-border", className)}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-brand" aria-hidden="true" />
            <span aria-live="polite">{fmtDate(`${month}-01`, { month: "long", year: "numeric" })}</span>
          </p>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              data-testid="plan-month-prev"
              aria-label="Previous month"
              onClick={() => onMonthChange(shiftMonth(month, -1))}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              data-testid="plan-month-next"
              aria-label="Next month"
              onClick={() => onMonthChange(shiftMonth(month, 1))}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        {schedule.error ? (
          <div className="space-y-2 py-4 text-center text-sm text-ink-muted" role="alert">
            <p>Could not load this month.</p>
            <Button variant="outline" size="sm" onClick={() => void schedule.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              "grid grid-cols-7 gap-1 text-center",
              schedule.isLoading && "animate-pulse opacity-60",
            )}
            role="grid"
            aria-label="Month schedule"
            aria-busy={schedule.isLoading}
          >
            {WEEKDAY_INITIALS.map((w, i) => (
              <span
                key={i}
                className={cn(
                  "pb-1 text-[11px] font-medium",
                  i === shoppingWeekday ? "text-warning" : "text-ink-subtle",
                )}
                aria-hidden="true"
              >
                {w}
              </span>
            ))}
            {grid.map((date) => {
              const day = byDate.get(date);
              const inMonth = date.startsWith(month);
              const inWeek = date >= weekStart && date <= weekEnd;
              const isFocus = date === focusDate;
              const isToday = date === today;
              const isShopping = weekdayIndex(date) === shoppingWeekday;
              const label = `${formatLongDate(date)}${isToday ? ", today" : ""}${isShopping ? ", shopping day" : ""}: ${
                day ? `${day.breakfast}, ${day.lunch}, ${day.dinner}` : "no plan yet"
              }`;
              return (
                <button
                  key={date}
                  type="button"
                  data-testid="plan-month-day"
                  data-planned={day ? "true" : "false"}
                  data-shopping={isShopping ? "true" : "false"}
                  aria-label={label}
                  aria-current={isFocus ? "date" : undefined}
                  title={label}
                  onClick={() => onPickDate(date)}
                  className={cn(
                    "relative flex h-9 flex-col items-center justify-center rounded-md text-xs tabular-nums transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    inMonth ? "text-ink" : "text-ink-subtle",
                    inWeek && !isFocus && "bg-surface-sunken",
                    day && !isFocus && "bg-brand-soft text-brand-dark",
                    isShopping && !isFocus && "bg-warning-soft text-ink ring-1 ring-warning",
                    isFocus && "bg-brand font-semibold text-brand-foreground",
                    isToday && !isFocus && "font-bold ring-1 ring-brand",
                    !isFocus && "hover:ring-1 hover:ring-ink-subtle",
                  )}
                >
                  {Number(date.slice(8, 10))}
                  <span
                    className={cn(
                      "absolute bottom-1 h-1 w-1 rounded-full",
                      isFocus ? "bg-brand-foreground" : "bg-brand",
                      !day && "invisible",
                    )}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        )}

        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted"
          aria-hidden="true"
        >
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-soft ring-1 ring-brand" />
            Planned
          </span>
          {shoppingWeekday !== null && (
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-warning-soft ring-1 ring-warning" />
              Shopping day
            </span>
          )}
        </div>

        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <ShoppingCart className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            Shopping day
          </span>
          <select
            data-testid="plan-shopping-day"
            value={shoppingWeekday ?? ""}
            onChange={(e) => onShoppingWeekdayChange(e.target.value === "" ? null : Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-surface-raised px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Not set</option>
            {WEEKDAY_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5 border-t border-border pt-3 text-xs">
          <p className="font-medium text-ink">{formatLongDate(focusDate)}</p>
          {focused ? (
            <ul className="space-y-0.5 text-ink-muted" data-testid="plan-month-dishes">
              <li className="truncate">
                <span className="text-ink-subtle">Breakfast · </span>
                {focused.breakfast}
              </li>
              <li className="truncate">
                <span className="text-ink-subtle">Lunch · </span>
                {focused.lunch}
              </li>
              <li className="truncate">
                <span className="text-ink-subtle">Dinner · </span>
                {focused.dinner}
              </li>
            </ul>
          ) : (
            <p className="text-ink-muted">
              {schedule.isLoading ? "Loading…" : "No dishes saved for this day yet."}
            </p>
          )}
          {!schedule.isLoading && !schedule.error && (
            <p className="text-ink-subtle">
              {plannedCount === 0
                ? "No weeks planned this month."
                : `${plannedCount} ${plannedCount === 1 ? "day" : "days"} planned this month.`}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** YYYY-MM of the month a week mostly falls in (its Thursday). */
export function monthOfWeek(weekStart: string): string {
  return addDays(weekStartOf(weekStart), 3).slice(0, 7);
}
