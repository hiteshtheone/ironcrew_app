export const MUSCLES = [
  "abdominals",
  "biceps",
  "chest",
  "forearms",
  "lats",
  "lower_back",
  "neck",
  "shoulders",
  "traps",
  "triceps",
  "upper_back",
  "abductors",
  "adductors",
  "calves",
  "glutes",
  "hamstrings",
  "quadriceps",
  "cardio",
  "full_body",
  "other",
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<Muscle, string> = {
  abdominals: "Abdominals",
  biceps: "Biceps",
  chest: "Chest",
  forearms: "Forearms",
  lats: "Lats",
  lower_back: "Lower Back",
  neck: "Neck",
  shoulders: "Shoulders",
  traps: "Traps",
  triceps: "Triceps",
  upper_back: "Upper Back",
  abductors: "Abductors",
  adductors: "Adductors",
  calves: "Calves",
  glutes: "Glutes",
  hamstrings: "Hamstrings",
  quadriceps: "Quadriceps",
  cardio: "Cardio",
  full_body: "Full Body",
  other: "Other",
};

export const BODY_PARTS = ["upper_body", "lower_body", "full_body", "core_and_midsections"] as const;

export type BodyPart = (typeof BODY_PARTS)[number];

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  upper_body: "Upper Body",
  lower_body: "Lower Body",
  full_body: "Full Body",
  core_and_midsections: "Core and Midsections",
};

export function isMuscle(value: string): value is Muscle {
  return (MUSCLES as readonly string[]).includes(value);
}

export function isBodyPart(value: string): value is BodyPart {
  return (BODY_PARTS as readonly string[]).includes(value);
}

/** Accepts a slug or a display label, such as `lower_back` or `Lower Back`. */
export function muscleFromText(value: string): Muscle | null {
  const key = normalizeEnumText(value);
  return MUSCLES.find((muscle) => muscle === key) ?? null;
}

/** Accepts a slug or a display label, such as `upper_body` or `Upper Body`. */
export function bodyPartFromText(value: string): BodyPart | null {
  const key = normalizeEnumText(value);
  return BODY_PARTS.find((part) => part === key) ?? null;
}

export function muscleLabel(value: string | null | undefined) {
  if (value == null || value.trim().length === 0) return null;
  const muscle = isMuscle(value) ? value : muscleFromText(value);
  return muscle ? MUSCLE_LABELS[muscle] : value.trim();
}

export function bodyPartLabel(value: string | null | undefined) {
  if (value == null || value.trim().length === 0) return null;
  const part = isBodyPart(value) ? value : bodyPartFromText(value);
  return part ? BODY_PART_LABELS[part] : value.trim();
}

export function muscleFromField(value: unknown): Muscle | null {
  return typeof value === "string" && isMuscle(value) ? value : null;
}

export function musclesFromList(value: unknown): Muscle[] {
  return enumList(value, isMuscle);
}

export function bodyPartsFromList(value: unknown): BodyPart[] {
  return enumList(value, isBodyPart);
}

function enumList<T extends string>(value: unknown, isValue: (item: string) => item is T): T[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.replace(/^\{|\}$/g, "").split(",")
      : [];
  const parsed: T[] = [];
  for (const item of items) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!isValue(text) || parsed.includes(text)) continue;
    parsed.push(text);
  }
  return parsed;
}

function normalizeEnumText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_|_$/g, "");
}
