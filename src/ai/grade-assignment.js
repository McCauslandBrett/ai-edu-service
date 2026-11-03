import { createJsonResponse } from "./openai-response-client.js";
import { clientError } from "../errors.js";

export async function gradeAssignment(body) {
  const { assignment, student, imageBase64 } = body ?? {};
  if (!assignment?.title || !Array.isArray(assignment.questions) ||
      !Array.isArray(assignment.answerKey) || typeof imageBase64 !== "string") {
    throw clientError("Assignment details and handwriting image are required.");
  }

  const result = await createJsonResponse({
    instructions: [
      "You are a careful formative-grading assistant for school assignments.",
      "Read the student's handwritten work from the supplied image and compare it to the answer key and rubric.",
      "Be age-appropriate, encouraging, and specific. Award partial credit when reasoning merits it.",
      "Never invent unreadable handwriting. If unclear, describe it and set needsHumanReview true.",
      "Accept mathematically or conceptually equivalent answers.",
      "Return a JSON object with score, total, overallFeedback, needsHumanReview, and items.",
      "Each items entry has question, studentAnswer, expectedAnswer, isCorrect, pointsAwarded, and feedback.",
      "Return one entry per question in order; keep the score between zero and total."
    ].join(" "),
    content: [
      { type: "input_text", text: "Grade this assignment: " + JSON.stringify({
        student: student?.name ?? "Student",
        age: student?.age ?? null,
        gradeLevel: student?.gradeLevel ?? "",
        subject: assignment.subject,
        title: assignment.title,
        prompt: assignment.prompt,
        questions: assignment.questions,
        answerKey: assignment.answerKey,
        rubric: assignment.rubric,
        totalPoints: assignment.points
      }) },
      { type: "input_image", image_url: "data:image/png;base64," + imageBase64, detail: "high" }
    ]
  });

  if (typeof result.score !== "number" || typeof result.overallFeedback !== "string" ||
      !Array.isArray(result.items) || result.items.length !== assignment.questions.length) {
    throw new Error("The model returned an incomplete grade.");
  }
  return {
    ...result,
    total: assignment.points,
    score: Math.max(0, Math.min(assignment.points, result.score)),
    needsHumanReview: Boolean(result.needsHumanReview)
  };
}
