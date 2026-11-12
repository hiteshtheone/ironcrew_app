---
name: training-plan
description: Build a phased, progressive training plan with goal-specific workout balance and simulations. Use when someone asks for a training plan, workout program, race preparation, or fitness schedule.
---

# Training Plan

Create a practical, progressive plan that fits the user's goal, timeline, experience, schedule, equipment, and constraints. Ask for the key inputs before prescribing the plan; keep questions concise and group related missing details together.

## Intake

1. Ask the primary goal and offer these choices: **running, strength, hybrid/event fitness, weight loss, or general fitness**. If the user already stated it, do not ask again.
2. Ask how many phases they want and how many weeks each phase should last. If they don't know, suggest a sensible phase structure based on their total available time and ask them to choose or approve it.
3. Check whether the phases include a **one-week taper**. If there is no taper, explicitly ask whether to add one week at the end. Explain that adding it extends the total plan; if the end date is fixed, ask which earlier phase to shorten to make room. Do not silently omit or insert the taper.
4. Ask for only other details needed to make the plan safe and usable: current training experience and typical activity, days and session time available, target event/date (if any), equipment/access, and injuries or movements to avoid. Combine these into one short prompt where possible. Accept unknowns and use conservative defaults rather than stalling.

Do not generate the full plan until the goal, phase lengths, and taper decision are clear. If the user asks for a quick draft, state reasonable assumptions and proceed.

## Plan design

- Keep a mix of relevant training types across the week: goal-specific work, supporting strength or conditioning, easier aerobic/recovery work, mobility or technique as useful, and rest. A goal focus changes the **emphasis**, not every session into the same workout.
- Bias weekly volume, intensity, and session priority to the primary goal:
  - **Running:** prioritize easy running and gradual mileage; include a suitable quality session and long run when the user's level supports them. Keep strength as supporting work.
  - **Strength:** prioritize progressive resistance training and recovery between hard sessions; retain easy aerobic work and mobility as supporting work.
  - **Hybrid/event fitness:** balance running or aerobic conditioning with strength and event-specific stations; practice transitions and pacing.
  - **Weight loss:** build a sustainable routine combining resistance training, aerobic activity, and recovery. Do not promise a rate of weight loss or prescribe extreme calorie restriction. Ask about nutrition only if requested.
  - **General fitness:** distribute strength, aerobic conditioning, mobility, and recovery evenly.
- Progress one or two variables at a time (such as duration, distance, load, reps, or density). Include easier recovery weeks when the length and workload warrant them. Avoid abrupt jumps in training load.
- Include a simulation or benchmark appropriate to the goal in the plan, with frequency and effort matched to readiness. Examples: a controlled event rehearsal for hybrid racing, a submaximal time trial for running, or a repeatable technique/work-capacity check for strength. Simulations should rehearse the target demands without turning every week into an all-out test. Place the hardest simulation before the taper, leaving recovery time afterward.
- During the one-week taper, reduce total workload while retaining a little familiar intensity or movement practice. Avoid introducing new exercises or maximal testing.
- Specify rest/recovery days, effort guidance, and sensible substitutions for unavailable equipment. Give concrete sets, reps, distances, durations, and rest intervals where practical.
- For an event plan, use the organizer's published format and standards if supplied or readily verifiable. Otherwise label simulation loads/distances as adjustable approximations; never imply they are official.
- Keep recommendations appropriate to the stated experience. For a beginner or someone returning after a long break, use lower starting volume and more recovery. If they report pain, a significant injury, or a medical limitation, adapt conservatively and suggest qualified clinical guidance where relevant.

## Output

Start with a compact summary of the goal, total duration, phases, and weekly training frequency. Then show:

1. The phases with their week ranges, focus, and progression.
2. A sample week or week-by-week schedule, detailed enough to follow.
3. The planned simulations/benchmarks and what to record.
4. How to adjust effort, recover, and substitute movements.

Create Program, phases, workouts and exercise accordingly.

Make clear which days are hard, easy, and rest days. If the user requests a specific format, follow it. Do not fabricate personal metrics or claim the plan guarantees a result.

