import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ExerciseDetailsButton, ExerciseInstructionsDialog } from "./exercise-instructions";

test("the details button stays closed until it is opened", () => {
  const html = renderToStaticMarkup(
    <ExerciseDetailsButton name="Bench Press" instructions={"Lie on the bench.\nPress up."} />,
  );

  assert.equal(html.includes("Details for Bench Press"), true);
  assert.equal(html.includes(">Details<"), true);
  assert.equal(html.includes("Lie on the bench."), false);
});

test("the details dialog shows how to do the exercise", () => {
  const html = renderToStaticMarkup(
    <ExerciseInstructionsDialog
      name="Bench Press"
      instructions={"Lie on the bench.\nPress up."}
      onClose={() => undefined}
    />,
  );

  assert.equal(html.includes("Bench Press"), true);
  assert.equal(html.includes("Lie on the bench."), true);
  assert.equal(html.includes("Press up."), true);
  assert.equal(html.includes("whitespace-pre-wrap"), true);
  assert.equal(html.includes(">Close<"), true);
});

test("the details dialog says when an exercise has no instructions", () => {
  const html = renderToStaticMarkup(
    <ExerciseInstructionsDialog name="Plank" instructions="   " onClose={() => undefined} />,
  );

  assert.equal(html.includes("No instructions for this exercise."), true);
});
