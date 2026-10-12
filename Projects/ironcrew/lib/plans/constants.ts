export const GOAL_TYPES = [
  "strength",
  "hypertrophy",
  "fat_loss",
  "endurance",
  "mobility",
  "rehabilitation",
  "other",
] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  fat_loss: "Fat loss",
  endurance: "Endurance",
  mobility: "Mobility",
  rehabilitation: "Rehabilitation",
  other: "Other",
};

export function isGoalType(value: string): value is GoalType {
  return GOAL_TYPES.some((goalType) => goalType === value);
}
