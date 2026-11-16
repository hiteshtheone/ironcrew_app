import type { GoalType } from "@/lib/plans/constants";

/** System programs carry no goal type, so suggestions match on name and description. */
const GOAL_KEYWORDS: Record<GoalType, string[]> = {
  strength: ["strength", "strong", "power", "5x5", "powerlifting"],
  hypertrophy: ["hypertrophy", "muscle", "bodybuilding", "mass", "size"],
  fat_loss: ["fat", "weight loss", "lean", "cut", "hiit", "conditioning", "metabolic"],
  endurance: ["endurance", "10k", "5k", "half marathon", "marathon", "run", "cardio", "aerobic"],
  mobility: ["mobility", "flexibility", "stretch", "yoga"],
  rehabilitation: ["rehab", "recovery", "injury", "prehab"],
  other: [],
};

type ProgramText = { name: string; description: string | null };

export function matchesGoal(program: ProgramText, goalType: GoalType | null) {
  if (!goalType) return false;
  const text = `${program.name} ${program.description ?? ""}`.toLowerCase();
  return GOAL_KEYWORDS[goalType].some((keyword) => text.includes(keyword));
}

/** Programs that match the goal first, each group kept in its original order. */
export function rankStarterPrograms<T extends ProgramText>(programs: T[], goalType: GoalType | null) {
  const matched = programs.filter((program) => matchesGoal(program, goalType));
  const rest = programs.filter((program) => !matchesGoal(program, goalType));
  return [...matched, ...rest].map((program) => ({ program, suggested: matched.includes(program) }));
}
