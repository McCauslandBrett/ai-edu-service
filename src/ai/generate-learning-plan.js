import { createJsonResponse } from "./openai-response-client.js";
import { clientError } from "../errors.js";
import { normalizePlanActivity, stringOr } from "../domain/assignment-content.js";

export async function generateLearningPlan(body) {
  const request = parsePlanRequest(body);
  const result = await createJsonResponse({
    instructions: planInstructions(),
    content: [{
      type: "input_text",
      text: "Generate the complete four-week plan as json. Student and instructor context: " + JSON.stringify(request.context)
    }]
  });
  return normalizeLearningPlan(result, request.subject, request.objective, request.targetedSkills);
}

function parsePlanRequest(body) {
  const {
    student, subject, objective, monthlyWindow, priorResults,
    targetedSkills, highestAssessmentLevel, instructorContext
  } = body ?? {};
  if (typeof subject !== "string" || !subject.trim() ||
      typeof objective !== "string" || !objective.trim()) {
    throw clientError("Subject and learning outcome are required.");
  }
  return {
    subject: subject.trim(),
    objective: objective.trim(),
    targetedSkills: Array.isArray(targetedSkills) ? targetedSkills : [],
    context: {
      student: {
        name: student?.name ?? "Student",
        age: student?.age ?? null,
        gradeLevel: student?.gradeLevel ?? ""
      },
      subject: subject.trim(),
      learningOutcome: objective.trim(),
      targetedSkills: Array.isArray(targetedSkills) ? targetedSkills : [],
      highestPreviousAssessmentLevel: highestAssessmentLevel ?? "",
      priorAssessmentResults: Array.isArray(priorResults) ? priorResults : [],
      instructorOrParentGuidance: instructorContext ?? "",
      monthlyWindow: monthlyWindow ?? "4 weeks"
    }
  };
}

function planInstructions() {
  return [
    "You are a curriculum planning assistant creating a complete one-month subject plan for one child.",
    "Use the child's age and school grade, targeted skills, learning outcome, highest previous assessment level, historical results, and instructor or parent guidance.",
    "The plan covers exactly four weeks, named Week 1 through Week 4.",
    "Every week must contain exactly one assessment. Week 1 assessment is a baseline assessment, and Week 4 assessment is a final assessment.",
    "Every week must also contain at least one assignment and a detailed lecturePrompt for a tutoring chatbot.",
    "Each lecturePrompt must explain what to teach, refer to this student's age, grade, goals, prior assessment results and struggles, and instruct the tutor to gently redirect and refocus the conversation when the child goes off topic.",
    "Assessments and assignments need questions, answerKey, rubric, and points.",
    "questions and answerKey must be arrays of plain text strings, never objects. Include any answer choices in the question string.",
    "Track the targeted skills in progress with a starting completion of zero unless historical evidence justifies another baseline.",
    "Return valid json with subject, objective, monthlyWindow, milestones, progress, and weeks.",
    "weeks is an array of exactly four items. Each item has weekNumber, theme, lecturePrompt, one assessment object, and an assignments array.",
    "Each assessment and assignment object has title, prompt, questions, answerKey, rubric, and points.",
    "Milestone kind is assessment, assignment, chat, or final. Completion is 0 through 100."
  ].join(" ");
}

function normalizeLearningPlan(result, subject, objective, targetedSkills) {
  if (!Array.isArray(result.weeks) || result.weeks.length !== 4 || !Array.isArray(result.progress)) {
    throw new Error("The model must return four weekly plans and tracked skills.");
  }
  const weeks = normalizeWeeks(result.weeks, subject);
  return {
    subject,
    objective,
    monthlyWindow: "4 weeks",
    milestones: buildMilestones(weeks),
    progress: normalizeProgress(result.progress, targetedSkills, subject),
    weeks
  };
}

function normalizeWeeks(inputWeeks, subject) {
  return inputWeeks
    .sort((a, b) => Number(a.weekNumber) - Number(b.weekNumber))
    .map((week, index) => {
      const weekNumber = index + 1;
      if (!week.assessment || !Array.isArray(week.assignments) || week.assignments.length < 1) {
        throw new Error("Each week needs one assessment and at least one assignment.");
      }
      return {
        weekNumber,
        theme: stringOr(week.theme, "Weekly subject practice"),
        lecturePrompt: stringOr(week.lecturePrompt, "Teach the weekly focus at the student's level and gently redirect off-topic conversation."),
        assessment: normalizePlanActivity(week.assessment, "Week " + weekNumber + " assessment", subject),
        assignments: week.assignments.map((item, index) =>
          normalizePlanActivity(item, "Week " + weekNumber + " assignment " + (index + 1), subject)
        )
      };
    });
}

function buildMilestones(weeks) {
  return weeks.flatMap(week => [
    {
      id: "week-" + week.weekNumber + "-assessment",
      title: week.assessment.title,
      date: "Week " + week.weekNumber,
      kind: week.weekNumber === 1 ? "assessment" : week.weekNumber === 4 ? "final" : "assessment"
    },
    {
      id: "week-" + week.weekNumber + "-chat",
      title: "Week " + week.weekNumber + " guided lesson",
      date: "Week " + week.weekNumber,
      kind: "chat"
    },
    ...week.assignments.map((assignment, index) => ({
      id: "week-" + week.weekNumber + "-assignment-" + (index + 1),
      title: assignment.title,
      date: "Week " + week.weekNumber,
      kind: "assignment"
    }))
  ]);
}

function normalizeProgress(progress, targetedSkills, subject) {
  return progress.map((item, index) => ({
    subject: stringOr(item.subject, targetedSkills[index] ?? subject),
    completion: Math.max(0, Math.min(100, Number(item.completion) || 0)),
    nextMilestone: stringOr(item.nextMilestone, "Practice and check understanding"),
    status: stringOr(item.status, "Not assessed")
  }));
}
