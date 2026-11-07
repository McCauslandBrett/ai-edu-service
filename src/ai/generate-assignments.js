import { createJsonResponse } from "./openai-response-client.js";
import { clientError } from "../errors.js";
import { readableArray, stringOr } from "../domain/assignment-content.js";

export async function generateAssignments(body) {
  const { student, subject, topic, objective } = body ?? {};
  const targetedSkills = Array.isArray(body?.targetedSkills) && body.targetedSkills.length
    ? body.targetedSkills.map(skill => String(skill).trim()).filter(Boolean)
    : [String(topic ?? subject ?? "Practice").trim()];
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
      "Return questionSkills as an array aligned one-to-one with questions. Link every question to exactly one of the provided targeted skill names, using those names exactly.",
      "questions and answerKey must each be arrays of plain text strings; never return question or answer objects.",
      "For multiple-choice questions, include all choices in the question string.",
      "Design each worksheet to take about 30 minutes of focused work. Include exactly four substantial numbered exercises; each should have enough parts, reasoning, or hands-on work to take about 6 to 8 minutes. Avoid padding with repetitive one-step questions.",
      "Include questionIllustrations as an array aligned one-to-one with questions. Use concise emoji/object groupings or simple visual layouts that directly support the exercise; use an empty string only when a visual would not help.",
      "Return JSON shaped as an object with an assignments array. Each assignment has title, subject, prompt, questions, questionSkills, questionIllustrations, answerKey, rubric, and points."
    ].join(" "),
    content: [{
      type: "input_text",
      text: "Create assignments using this request: " + JSON.stringify({
        student: student?.name ?? "Student",
        gradeLevel: student?.gradeLevel ?? "",
        subject: subject.trim(),
        topic: topic.trim(),
        learningObjective: objective ?? "",
        targetedSkills,
        count,
        pointsPerAssignment
      })
    }]
  });

  if (!Array.isArray(result.assignments) || result.assignments.length !== count) {
    throw new Error("The model returned an incomplete assignment set.");
  }
  return {
    assignments: result.assignments.map((item, index) => normalizeAssignment(item, index, subject, pointsPerAssignment, targetedSkills))
  };
}

function normalizeAssignment(item, index, subject, fallbackPoints, targetedSkills) {
  const questions = readableArray(item.questions, "question");
  if (!Array.isArray(item.questionSkills) || item.questionSkills.length !== questions.length) {
    throw new Error("Each generated question must be linked to a targeted skill.");
  }
  const questionSkills = item.questionSkills.map(skill => {
    const name = String(skill ?? "").trim();
    const match = targetedSkills.find(candidate => candidate.toLowerCase() === name.toLowerCase());
    if (!match) throw new Error("Generated question skills must match the requested targeted skills.");
    return match;
  });
  return {
    id: "generated-" + Date.now() + "-" + (index + 1),
    title: stringOr(item.title, subject + " practice " + (index + 1)),
    subject: stringOr(item.subject, subject),
    prompt: stringOr(item.prompt, ""),
    questions,
    questionSkills,
    questionIllustrations: normalizeIllustrations(item.questionIllustrations, questions.length),
    writingSpaceMultipliers: questions.map(() => 1),
    answerKey: readableArray(item.answerKey, "answer"),
    rubric: stringOr(item.rubric, ""),
    points: Number.isFinite(Number(item.points)) ? Number(item.points) : fallbackPoints
  };
}

function normalizeIllustrations(value, count) {
  return Array.from({ length: count }, (_, index) =>
    typeof value?.[index] === "string" ? value[index].trim() : ""
  );
}
