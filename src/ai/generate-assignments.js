import { createJsonResponse } from "./openai-response-client.js";
import { clientError } from "../errors.js";
import { readableArray, stringOr } from "../domain/assignment-content.js";

export async function generateAssignments(body) {
  const { student, subject, topic, objective } = body ?? {};
  const count = Math.max(1, Math.min(8, Number(body?.count ?? 3)));
  if (typeof subject !== "string" || !subject.trim() || typeof topic !== "string" || !topic.trim()) {
    throw clientError("Subject and topic are required.");
  }
  const pointsPerAssignment = Math.max(1, Math.min(100, Number(body?.pointsPerAssignment ?? 10)));
  const result = await createJsonResponse({
    instructions: [
      "You design original school assignments as a curriculum assistant.",
      "Make content suitable for the student's grade and subject.",
      "Create exactly the requested number of distinct, age-appropriate assignments.",
      "Include a clear prompt, ordered questions, a reliable answer key aligned one-to-one with questions, a concise rubric, and total points.",
      "questions and answerKey must each be arrays of plain text strings; never return question or answer objects.",
      "For multiple-choice questions, include all choices in the question string.",
      "Avoid trick questions and keep the workload appropriate.",
      "Return JSON shaped as an object with an assignments array. Each assignment has title, subject, prompt, questions, answerKey, rubric, and points."
    ].join(" "),
    content: [{
      type: "input_text",
      text: "Create assignments using this request: " + JSON.stringify({
        student: student?.name ?? "Student",
        gradeLevel: student?.gradeLevel ?? "",
        subject: subject.trim(),
        topic: topic.trim(),
        learningObjective: objective ?? "",
        count,
        pointsPerAssignment
      })
    }]
  });

  if (!Array.isArray(result.assignments) || result.assignments.length !== count) {
    throw new Error("The model returned an incomplete assignment set.");
  }
  return {
    assignments: result.assignments.map((item, index) => normalizeAssignment(item, index, subject, pointsPerAssignment))
  };
}

function normalizeAssignment(item, index, subject, fallbackPoints) {
  return {
    id: "generated-" + Date.now() + "-" + (index + 1),
    title: stringOr(item.title, subject + " practice " + (index + 1)),
    subject: stringOr(item.subject, subject),
    prompt: stringOr(item.prompt, ""),
    questions: readableArray(item.questions, "question"),
    answerKey: readableArray(item.answerKey, "answer"),
    rubric: stringOr(item.rubric, ""),
    points: Number.isFinite(Number(item.points)) ? Number(item.points) : fallbackPoints
  };
}
