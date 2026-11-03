export function stringOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function readableArray(value, kind) {
  return Array.isArray(value) ? value.map(item => readableValue(item, kind)).filter(Boolean) : [];
}

function readableValue(value, kind) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(item => readableValue(item, kind)).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";

  const questionFields = ["question", "prompt", "text", "problem", "task", "instruction", "statement", "scenario", "expression", "content"];
  const answerFields = ["answer", "expectedAnswer", "solution", "result", "text", "explanation", "value"];
  const primaryFields = kind === "question" ? questionFields : answerFields;
  const primaryKey = primaryFields.find(key => value[key] !== undefined && value[key] !== null && value[key] !== "");
  const primary = primaryKey ? readableValue(value[primaryKey], kind) : "";
  const extras = kind === "question" ? ["choices", "options", "parts", "subquestions"] : ["explanation", "reasoning"];
  const extraText = extras
    .filter(key => key !== primaryKey && value[key] !== undefined && value[key] !== null)
    .map(key => readableValue(value[key], kind))
    .filter(Boolean);
  if (primary || extraText.length) return [primary, ...extraText].filter(Boolean).join("\n");

  const answerFieldsToExclude = new Set(["answer", "answers", "expectedAnswer", "correctAnswer", "solution", "explanation", "rubric", "points", "id", "type"]);
  return Object.entries(value)
    .filter(([key]) => kind !== "question" || !answerFieldsToExclude.has(key))
    .map(([key, item]) => {
      const text = readableValue(item, kind);
      return text ? key + ": " + text : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function normalizePlanActivity(activity, fallbackTitle, subject, trackedSkills) {
  if (!Array.isArray(activity.questions) || activity.questions.length === 0) {
    throw new Error("Each weekly activity must include questions.");
  }
  const questions = readableArray(activity.questions, "question");
  const questionSkills = normalizeQuestionSkills(activity.questionSkills, questions.length, trackedSkills);
  return {
    id: stringOr(activity.id, fallbackTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
    title: stringOr(activity.title, fallbackTitle),
    subject: stringOr(activity.subject, subject),
    prompt: stringOr(activity.prompt, "Complete the activity and show your reasoning."),
    questions,
    questionSkills,
    answerKey: readableArray(activity.answerKey, "answer"),
    rubric: stringOr(activity.rubric, "Award credit for correct answers and clear reasoning."),
    points: Math.max(1, Math.min(100, Number(activity.points) || 10))
  };
}

function normalizeQuestionSkills(value, questionCount, trackedSkills) {
  if (!Array.isArray(value) || value.length !== questionCount) {
    throw new Error("Every question must be linked to one tracked skill.");
  }
  return value.map(skill => {
    const name = stringOr(skill, "");
    const match = trackedSkills.find(candidate => candidate.toLowerCase() === name.toLowerCase());
    if (!match) throw new Error("Each question skill must match a tracked skill.");
    return match;
  });
}
