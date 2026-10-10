import type { ActivityLevel, Condition, Goal, Sex } from "@/types/contracts";

export const SEX_LABEL: Record<Sex, string> = { male: "Male", female: "Female" };

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Lightly active",
  moderate: "Moderately active",
  active: "Active",
  very_active: "Very active",
};

export const ACTIVITY_HINT: Record<ActivityLevel, string> = {
  sedentary: "Desk days, little exercise",
  light: "Walks or light exercise 1 to 3 days a week",
  moderate: "Exercise 3 to 5 days a week",
  active: "Hard exercise most days",
  very_active: "Physical job or training twice a day",
};

export const GOAL_LABEL: Record<Goal, string> = {
  lose: "Lose fat",
  maintain: "Maintain",
  gain: "Gain muscle",
};

export const GOAL_HINT: Record<Goal, string> = {
  lose: "A gentle deficit with a safe calorie floor",
  maintain: "Eat at your metabolism, feel steady",
  gain: "A small surplus with plenty of protein",
};

export const CONDITION_LABEL: Record<Condition, string> = {
  type2_diabetes: "Type 2 diabetes",
  hypertension: "High blood pressure",
  kidney_disease: "Kidney disease",
  high_cholesterol: "High cholesterol",
};
