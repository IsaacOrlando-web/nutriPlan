// Chart colors for Recharts (which needs literal color values, not Tailwind classes).
// These mirror tailwind.config.ts tokens exactly; change them there first.
export const CHART = {
  brand: "#16A34A",
  brandSoft: "#DCFCE7",
  ink: "#0F172A",
  inkMuted: "#475569",
  inkSubtle: "#94A3B8",
  border: "#E2E8F0",
  warning: "#F59E0B",
  danger: "#EF4444",
  doctor: "#2563EB",
  monitor: "#7C3AED",
} as const;

/** Macro colors as Tailwind classes (token based). */
export const MACRO_CLASSES = {
  protein: { fill: "bg-agent-doctor", soft: "bg-agent-doctor/15", text: "text-agent-doctor" },
  carbs: { fill: "bg-warning", soft: "bg-warning/15", text: "text-warning" },
  fat: { fill: "bg-agent-monitor", soft: "bg-agent-monitor/15", text: "text-agent-monitor" },
} as const;
