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

export const GOAL_STATUSES = ["active", "achieved", "paused", "cancelled"] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  achieved: "Achieved",
  paused: "Paused",
  cancelled: "Cancelled",
};

export function isGoalStatus(value: string): value is GoalStatus {
  return GOAL_STATUSES.some((status) => status === value);
}

export const BLOCK_TYPES = [
  "warmup",
  "exercise",
  "superset",
  "circuit",
  "conditioning",
  "cooldown",
  "notes",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  warmup: "Warmup",
  exercise: "Exercise",
  superset: "Superset",
  circuit: "Circuit",
  conditioning: "Conditioning",
  cooldown: "Cooldown",
  notes: "Notes",
};

export function isBlockType(value: string): value is BlockType {
  return BLOCK_TYPES.some((blockType) => blockType === value);
}
