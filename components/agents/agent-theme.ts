import { Activity, ChefHat, Network, Stethoscope, Wallet, type LucideIcon } from "lucide-react";
import type { AgentEventKind, AgentName } from "@/types/contracts";

/** Static class names per agent so Tailwind can see them. Colors come from tailwind.config.ts tokens. */
export interface AgentTheme {
  icon: LucideIcon;
  bg: string;
  text: string;
  soft: string;
  border: string;
  ring: string;
  /** Sets --pulse-color for the agent-pulse keyframe. */
  pulse: string;
}

export const AGENT_THEME: Record<AgentName, AgentTheme> = {
  doctor: {
    icon: Stethoscope,
    bg: "bg-agent-doctor",
    text: "text-agent-doctor",
    soft: "bg-agent-doctor/10",
    border: "border-agent-doctor/30",
    ring: "ring-agent-doctor",
    pulse: "[--pulse-color:theme(colors.agent.doctor/45%)]",
  },
  chef: {
    icon: ChefHat,
    bg: "bg-agent-chef",
    text: "text-agent-chef",
    soft: "bg-agent-chef/10",
    border: "border-agent-chef/30",
    ring: "ring-agent-chef",
    pulse: "[--pulse-color:theme(colors.agent.chef/45%)]",
  },
  budget: {
    icon: Wallet,
    bg: "bg-agent-budget",
    text: "text-agent-budget",
    soft: "bg-agent-budget/10",
    border: "border-agent-budget/30",
    ring: "ring-agent-budget",
    pulse: "[--pulse-color:theme(colors.agent.budget/45%)]",
  },
  monitor: {
    icon: Activity,
    bg: "bg-agent-monitor",
    text: "text-agent-monitor",
    soft: "bg-agent-monitor/10",
    border: "border-agent-monitor/30",
    ring: "ring-agent-monitor",
    pulse: "[--pulse-color:theme(colors.agent.monitor/45%)]",
  },
  orchestrator: {
    icon: Network,
    bg: "bg-agent-orchestrator",
    text: "text-agent-orchestrator",
    soft: "bg-agent-orchestrator/10",
    border: "border-agent-orchestrator/30",
    ring: "ring-agent-orchestrator",
    pulse: "[--pulse-color:theme(colors.agent.orchestrator/45%)]",
  },
};

export const AGENT_ORDER: AgentName[] = ["doctor", "chef", "budget", "monitor"];

export const AGENT_NAMES: Record<AgentName, string> = {
  doctor: "Doctor",
  chef: "Chef",
  budget: "Budget",
  monitor: "Monitor",
  orchestrator: "Orchestrator",
};

/** One word per agent for legends: what each one is there to protect. */
export const AGENT_ROLES: Record<AgentName, string> = {
  doctor: "safety",
  chef: "taste",
  budget: "money",
  monitor: "progress",
  orchestrator: "referee",
};

export const KIND_LABELS: Record<AgentEventKind, string> = {
  proposal: "Proposal",
  objection: "Objection",
  concession: "Concession",
  tool_call: "Tool call",
  decision: "Decision",
};

/** Human labels for Doctor's rule ids. Unknown ids fall back to the id with spaces. */
export const RULE_LABELS: Record<string, string> = {
  min_fiber: "Fiber floor",
  max_added_sugar: "Added sugar cap",
  max_sodium: "Sodium cap",
  max_sat_fat: "Saturated fat cap",
  min_calories: "Calorie floor",
  allergies_excluded: "Allergies excluded",
  max_carbs_per_meal: "Carbs per meal",
  max_glycemic_load_per_meal: "Glycemic load per meal",
  min_potassium: "Potassium floor",
  weekly_budget: "Weekly budget",
  calorie_target: "Calorie target",
};

export function ruleLabel(rule: string): string {
  return RULE_LABELS[rule] ?? rule.replace(/_/g, " ");
}
