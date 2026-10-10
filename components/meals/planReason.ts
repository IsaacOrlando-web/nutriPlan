import type { MealPlan } from "@/types/contracts";

/**
 * Turns a plan's `reason` (free text written by the server) into one plain sentence that says who rebuilt the
 * week and why. It only rephrases; every number stays as the server wrote it.
 */
export function planReasonSentence(plan: Pick<MealPlan, "version" | "reason" | "bestEffort">): string {
  const reason = plan.reason.trim();
  const lower = reason.toLowerCase();
  let sentence: string;
  if (plan.version <= 1 || /^new plan|^first plan|onboarding/.test(lower)) {
    sentence = "Your first week, built by the agents from your rules, taste and budget.";
  } else if (/budget/.test(lower)) {
    sentence = `Rebuilt by Budget after you changed your weekly budget (${reason.replace(/\.$/, "")}).`;
  } else if (/stall|plateau|weight|glucose|pressure|trend|tdee|rising|falling|too fast/.test(lower)) {
    sentence = `Rebuilt by Monitor because ${lowerFirst(reason).replace(/\.$/, "")}.`;
  } else if (/new week|requested|manual|refresh/.test(lower)) {
    sentence = "A fresh week you asked for, rebuilt by the agents with the same rules.";
  } else if (/coach/.test(lower)) {
    sentence = `Rebuilt after your chat with Coach (${reason.replace(/\.$/, "")}).`;
  } else {
    sentence = `Rebuilt by the agents: ${lowerFirst(reason).replace(/\.$/, "")}.`;
  }
  if (plan.bestEffort) {
    sentence += " Some rule could not be met in full, so this is the closest safe week.";
  }
  return sentence;
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}
