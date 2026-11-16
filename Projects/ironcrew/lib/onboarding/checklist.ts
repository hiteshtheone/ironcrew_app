export type ChecklistItem = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  href: string;
};

export type TrainerChecklistFacts = {
  hasBusinessName: boolean;
  clientCount: number;
  programCount: number;
  assignmentCount: number;
  linkedClientCount: number;
};

export type ClientChecklistFacts = {
  hasGoal: boolean;
  hasStartedProgram: boolean;
  hasLoggedWorkout: boolean;
};

export function trainerChecklist(facts: TrainerChecklistFacts): ChecklistItem[] {
  return [
    {
      id: "profile",
      label: "Complete your profile",
      detail: "Add a business name so clients recognize you.",
      done: facts.hasBusinessName,
      href: "/dashboard?section=settings",
    },
    {
      id: "client",
      label: "Add your first client",
      detail: "Create a client record with their email.",
      done: facts.clientCount > 0,
      href: "/clients/new",
    },
    {
      id: "program",
      label: "Create a program",
      detail: "Build one or copy a ready-made program.",
      done: facts.programCount > 0,
      href: "/dashboard?section=programs&creating=program",
    },
    {
      id: "assignment",
      label: "Assign a workout",
      detail: "Schedule a workout or program for a client.",
      done: facts.assignmentCount > 0,
      href: "/dashboard?section=clients",
    },
    {
      id: "client-signed-in",
      label: "Get a client signed in",
      detail: "They sign up with the email you saved.",
      done: facts.linkedClientCount > 0,
      href: "/dashboard?section=clients",
    },
  ];
}

export function clientChecklist(facts: ClientChecklistFacts): ChecklistItem[] {
  return [
    {
      id: "goal",
      label: "Set your goal",
      detail: "Tell us what you are training for.",
      done: facts.hasGoal,
      href: "/dashboard#set-goal",
    },
    {
      id: "program",
      label: "Start a program",
      detail: "Pick a ready-made program or build your own.",
      done: facts.hasStartedProgram,
      href: "/dashboard?section=programs",
    },
    {
      id: "workout",
      label: "Log your first workout",
      detail: "Record sets from a scheduled workout.",
      done: facts.hasLoggedWorkout,
      href: "/dashboard?section=workouts",
    },
  ];
}

/** Hidden once dismissed or when every item is done. */
export function isChecklistVisible(items: ChecklistItem[], dismissedAt: string | null) {
  if (dismissedAt) return false;
  return items.some((item) => !item.done);
}

export function checklistProgress(items: ChecklistItem[]) {
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length, percent: items.length === 0 ? 100 : Math.round((done / items.length) * 100) };
}
