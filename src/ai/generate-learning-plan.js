import { createJsonResponse } from "./openai-response-client.js";
import { clientError } from "../errors.js";
import { normalizePlanActivity, stringOr } from "../domain/assignment-content.js";

export async function generateLearningPlan(body) {
  const request = parsePlanRequest(body);
  const result = await createJsonResponse({
    instructions: planInstructions(request.assignmentCount, request.questionCount),
    maxOutputTokens: 24000,
    content: [{
      type: "input_text",
      text: "Generate the complete four-week plan as json. Student and instructor context: " + JSON.stringify(request.context)
    }]
  });
  return normalizeLearningPlan(result, request.subject, request.objective, request.targetedSkills, request.assignmentCount, request.questionCount);
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
    assignmentCount: parseRequestedAssignmentCount(instructorContext),
    questionCount: parseRequestedQuestionCount(instructorContext),
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
      requestedAssignmentsPerWeek: parseRequestedAssignmentCount(instructorContext),
      requestedQuestionsPerWorksheet: parseRequestedQuestionCount(instructorContext),
      monthlyWindow: monthlyWindow ?? "4 weeks"
    }
  };
}

function parseRequestedAssignmentCount(guidance) {
  const numberWords = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
  };
  const match = String(guidance ?? "").match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:(?:distinct|different|new|additional|more|total)\s+)?(assignments?|worksheets?)\b/i);
  if (!match) return 4;
  const requested = Number(match[1]) || numberWords[match[1].toLowerCase()];
  return Number.isInteger(requested) && requested >= 1 && requested <= 12 ? requested : 4;
}

function parseRequestedQuestionCount(guidance) {
  const numberWords = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20
  };
  const match = String(guidance ?? "").match(/\b(?:at\s+least\s+|minimum\s+of\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:questions?|problems?|exercises?)\s+(?:per|for\s+each|on\s+each)\s+(?:assignment|worksheet)\b/i);
  if (!match) return 4;
  const token = match[1].toLowerCase();
  const requested = Number(token) || numberWords[token];
  return Number.isInteger(requested) && requested >= 1 && requested <= 20 ? requested : 4;
}

function planInstructions(assignmentCount, questionCount) {
  return [
    "You are a curriculum planning assistant creating a complete one-month subject plan for one child.",
    "Use the child's age and school grade, targeted skills, learning outcome, highest previous assessment level, historical results, and instructor or parent guidance.",
    "The plan covers exactly four weeks, named Week 1 through Week 4.",
    "Every week must contain exactly one assessment. Week 1 assessment is a baseline assessment, and Week 4 assessment is a final assessment.",
    assignmentCount === 4
      ? "Every week must contain exactly four distinct assignments/worksheets by default. If the instructor or parent guidance explicitly requests a different number per week, follow that requested number instead."
      : `The instructor or parent explicitly requested ${assignmentCount} assignments/worksheets per week; create exactly that many for every week.`,
    "Every week must also contain a detailed lecturePrompt for a tutoring chatbot.",
    "Every week must include a youtubeVideo object with a real, age-appropriate educational YouTube video covering at least one subject skill or that week's theme. Prefer reputable child-friendly educational channels. Include title, channel, a direct YouTube watch URL (youtube.com/watch?v=... or youtu.be/...), and a brief reason it fits this child. Never invent a video URL; if uncertain, give a YouTube search-results URL for a precise age-appropriate query instead.",
    "Each lecturePrompt must explain what to teach, refer to this student's age, grade, goals, prior assessment results and struggles, and instruct the tutor to gently redirect and refocus the conversation when the child goes off topic.",
    "Every assignment and weekly assessment is completed on its worksheet page. Each exercise must request a written, drawn, circled, connected, labeled, or otherwise marked response on the page. Never accept or request spoken, verbal, pointed, or gesture-only worksheet answers; do not say a tutor or parent will record an oral answer. Spoken answers belong only in the separate tutor chat, not assignment or assessment questions.",
    `Every assignment and weekly assessment must have exactly ${questionCount} age-appropriate numbered questions unless the instructor requests a different question count. Design them to fit the target work duration, use concise directions, and allow the student to write, draw, circle, connect, or mark answers on the page.`,
    "Include questionIllustrations aligned with questions: concise emoji/object groupings or simple visual layouts that directly support the exercise; use an empty string when a visual adds no value.",
    "Assessments and assignments need questions, questionSkills, questionIllustrations, answerKey, rubric, and points.",
    "questions and answerKey must be arrays of plain text strings, never objects. Include any answer choices in the question string.",
    "For every assessment and assignment, questionSkills is an array aligned one-to-one with questions. Each entry must exactly match one of the tracked skill names in progress[].subject. Every question must be tied to one tracked skill.",
    "Track the targeted skills in progress with a starting completion of zero unless historical evidence justifies another baseline.",
    "Return valid json with subject, objective, monthlyWindow, milestones, progress, and weeks.",
    `weeks is an array of exactly four items. Each item has weekNumber, theme, lecturePrompt, one assessment object, and an assignments array containing exactly ${assignmentCount} items.`,
    `Each assessment and assignment object has title, prompt, exactly ${questionCount} questions, questionSkills, questionIllustrations, answerKey, rubric, and points.`,
    "Milestone kind is assessment, assignment, chat, or final. Completion is 0 through 100."
  ].join(" ");
}

function normalizeLearningPlan(result, subject, objective, targetedSkills, assignmentCount, questionCount) {
  if (!Array.isArray(result.weeks) || result.weeks.length !== 4 || !Array.isArray(result.progress)) {
    throw new Error("The model must return four weekly plans and tracked skills.");
  }
  const progress = normalizeProgress(result.progress, targetedSkills, subject);
  if (progress.length === 0) throw new Error("The model must return tracked skills.");
  const trackedSkills = progress.map(item => item.subject);
  const weeks = normalizeWeeks(result.weeks, subject, assignmentCount, questionCount, trackedSkills);
  return {
    subject,
    objective,
    monthlyWindow: "4 weeks",
    milestones: buildMilestones(weeks),
    progress,
    weeks
  };
}

function normalizeWeeks(inputWeeks, subject, expectedAssignmentCount, expectedQuestionCount, trackedSkills) {
  return inputWeeks
    .sort((a, b) => Number(a.weekNumber) - Number(b.weekNumber))
    .map((week, index) => {
      const weekNumber = index + 1;
      if (!week.assessment || !Array.isArray(week.assignments) || week.assignments.length !== expectedAssignmentCount) {
        throw new Error(`Each week needs one assessment and exactly ${expectedAssignmentCount} assignments.`);
      }
      return {
        weekNumber,
        theme: stringOr(week.theme, "Weekly subject practice"),
        lecturePrompt: stringOr(week.lecturePrompt, "Teach the weekly focus at the student's level and gently redirect off-topic conversation."),
        youtubeVideo: normalizeYoutubeVideo(week.youtubeVideo, subject, week.theme, weekNumber),
        assessment: normalizePlanActivity(week.assessment, "Week " + weekNumber + " assessment", subject, trackedSkills, expectedQuestionCount),
        assignments: week.assignments.map((item, index) =>
          normalizePlanActivity(item, "Week " + weekNumber + " assignment " + (index + 1), subject, trackedSkills, expectedQuestionCount)
        )
      };
    });
}

function normalizeYoutubeVideo(value, subject, theme, weekNumber) {
  const candidateURL = String(value?.url ?? "").trim();
  let url;
  try {
    const parsed = new URL(candidateURL);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const isYouTube = host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
    const isVideoLink = host === "youtu.be" ? parsed.pathname.length > 1 : parsed.pathname === "/watch" && Boolean(parsed.searchParams.get("v"));
    if (isYouTube && isVideoLink) url = parsed.toString();
  } catch {}

  const query = encodeURIComponent(`${subject} ${theme} educational video for kids age appropriate`);
  return {
    title: stringOr(value?.title, `Week ${weekNumber}: ${theme}`),
    channel: stringOr(value?.channel, "YouTube educational videos"),
    url: url ?? `https://www.youtube.com/results?search_query=${query}`,
    reason: stringOr(value?.reason, `A child-friendly video search related to ${theme} in ${subject}.`)
  };
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
