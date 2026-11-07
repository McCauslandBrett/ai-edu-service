import { createJsonResponse } from "./openai-response-client.js";
import { clientError } from "../errors.js";
import { readableArray, stringOr } from "../domain/assignment-content.js";

export async function adjustAssignment(body) {
  const assignment = body?.assignment;
  const changeRequest = String(body?.changeRequest ?? "").trim();
  if (!assignment?.title || !Array.isArray(assignment.questions) || !changeRequest) {
    throw clientError("An assignment and a change request are required.");
  }
  const skills = [...new Set((assignment.questionSkills ?? []).map(value => String(value).trim()).filter(Boolean))];
  const result = await createJsonResponse({
    instructions: [
      "You revise one student's worksheet according to a parent's or instructor's specific change request.",
      "Keep the existing title, topic, age level, and all useful content. Make only the requested changes and preserve existing exercises unless the request explicitly asks to replace them.",
      "A request for more writing space changes writingSpaceMultipliers for the relevant exercise to 1.5, 2, or 3. Keep other exercises at their current space setting.",
      "A request for more problems appends the requested number of complete, age-appropriate exercises and answer-key entries. Map every exercise to exactly one existing skill name.",
      "A request for an illustration supplies a concise, helpful visual for the specified exercise in questionIllustrations. Prefer clear emoji object groups or simple text diagrams that render reliably on an iPad.",
      "Return questions, questionSkills, questionIllustrations, writingSpaceMultipliers, answerKey, title, subject, prompt, rubric, and points. All arrays must align one-to-one with questions. Return valid JSON only."
    ].join(" "),
    content: [{
      type: "input_text",
      text: "Apply this change request: " + JSON.stringify({
        student: body.student?.name ?? "Student",
        age: body.student?.age ?? null,
        gradeLevel: body.student?.gradeLevel ?? "",
        changeRequest,
        availableSkills: skills,
        currentAssignment: assignment
      })
    }]
  });

  const questions = readableArray(result.questions, "question");
  if (!questions.length || !Array.isArray(result.questionSkills) || result.questionSkills.length !== questions.length) {
    throw new Error("The updated worksheet is missing question-to-skill mappings.");
  }
  const questionSkills = result.questionSkills.map(value => {
    const match = skills.find(skill => skill.toLowerCase() === String(value ?? "").trim().toLowerCase());
    if (!match) throw new Error("Every updated exercise must use one of the assignment's existing tracked skills.");
    return match;
  });
  const answerKey = readableArray(result.answerKey, "answer");
  if (answerKey.length !== questions.length) throw new Error("The updated answer key does not match the exercises.");
  const oldIllustrations = assignment.questionIllustrations ?? [];
  const oldSpace = assignment.writingSpaceMultipliers ?? [];
  const questionIllustrations = Array.from({ length: questions.length }, (_, index) =>
    typeof result.questionIllustrations?.[index] === "string" ? result.questionIllustrations[index].trim() : oldIllustrations[index] ?? ""
  );
  const writingSpaceMultipliers = Array.from({ length: questions.length }, (_, index) => {
    const requested = Number(result.writingSpaceMultipliers?.[index] ?? oldSpace[index] ?? 1);
    return Math.max(1, Math.min(3, Number.isFinite(requested) ? requested : 1));
  });
  return {
    id: assignment.id,
    title: stringOr(result.title, assignment.title),
    subject: stringOr(result.subject, assignment.subject),
    dueDate: assignment.dueDate,
    points: Number(result.points) || assignment.points,
    prompt: stringOr(result.prompt, assignment.prompt),
    questions,
    questionSkills,
    questionIllustrations,
    writingSpaceMultipliers,
    answerKey,
    rubric: stringOr(result.rubric, assignment.rubric),
    status: assignment.status,
    studentID: assignment.studentID ?? null,
    parentAssignmentID: assignment.parentAssignmentID ?? null
  };
}
