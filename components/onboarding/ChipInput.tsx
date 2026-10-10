"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ChipInputProps {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  tone?: "neutral" | "success" | "danger";
}

const TONES = {
  neutral: "bg-secondary text-secondary-foreground",
  success: "bg-success-soft text-brand-dark",
  danger: "bg-danger-soft text-danger",
} as const;

export function ChipInput({
  id,
  value,
  onChange,
  suggestions = [],
  placeholder = "Type and press Enter",
  tone = "neutral",
}: ChipInputProps) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const item = raw.trim().toLowerCase();
    if (!item || value.includes(item)) return;
    onChange([...value, item]);
    setDraft("");
  };
  const remove = (item: string) => onChange(value.filter((v) => v !== item));
  const unused = suggestions.filter((s) => !value.includes(s));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => add(draft)}
          aria-label="Add"
          disabled={!draft.trim()}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-live="polite">
          {value.map((item) => (
            <li
              key={item}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
                TONES[tone],
              )}
            >
              {item}
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`Remove ${item}`}
                className="rounded-full p-0.5 hover:bg-ink/10"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {unused.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-ink-subtle">Tap to add</p>
          <div className="flex flex-wrap gap-2">
            {unused.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="rounded-full border border-dashed px-3 py-1 text-sm text-ink-muted transition-colors hover:border-brand hover:text-brand-dark"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
