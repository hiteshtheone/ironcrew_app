export function normalizeMuscleGroup(value: string) {
  return value.trim().toLowerCase();
}

export function muscleGroupsMatch(primary: string, secondary: string) {
  const normalizedPrimary = normalizeMuscleGroup(primary);
  const normalizedSecondary = normalizeMuscleGroup(secondary);
  return normalizedPrimary.length > 0 && normalizedPrimary === normalizedSecondary;
}
