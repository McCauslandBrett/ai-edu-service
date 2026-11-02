import "dotenv/config";
import http from "node:http";
import OpenAI from "openai";

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "0.0.0.0";
const maxBodyBytes = 12 * 1024 * 1024;

const server = http.createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.method === "GET" && request.url === "/health") {
    return send(response, 200, {
      ok: true,
      service: "Learning AI Service",
      capabilities: ["grading", "assignment-generation", "plan-generation"],
      configured: Boolean(process.env.OPENAI_API_KEY)
    });
  }
  if (request.method !== "POST") return send(response, 404, { error: "Route not found." });

  const startedAt = Date.now();
  try {
    const body = await readJson(request);
    let result;
    if (request.url === "/api/grade") result = await gradeAssignment(body);
    else if (request.url === "/api/assignments/generate") result = await generateAssignments(body);
    else if (request.url === "/api/plans/generate") result = await generateLearningPlan(body);
    else return send(response, 404, { error: "Route not found." });
    console.log(request.method, request.url, response.statusCode || 200, Date.now() - startedAt + "ms");
    return send(response, 200, result);
  } catch (error) {
    const status = error?.status === 429 ? 429 : error?.status === 400 ? 400 : error?.status === 503 ? 503 : 502;
    console.error(request.method, request.url, status, Date.now() - startedAt + "ms", error?.message ?? error);
    return send(response, status, { error: error?.message ?? "The request failed." });
  }
});

async function gradeAssignment(body) {
  const { assignment, student, imageBase64 } = body ?? {};
  requireModel();
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
  result.total = assignment.points;
  result.score = Math.max(0, Math.min(assignment.points, result.score));
  result.needsHumanReview = Boolean(result.needsHumanReview);
  return result;
}

async function generateAssignments(body) {
  requireModel();
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
    assignments: result.assignments.map((item, index) => ({
      id: "generated-" + Date.now() + "-" + (index + 1),
      title: stringOr(item.title, subject + " practice " + (index + 1)),
      subject: stringOr(item.subject, subject),
      prompt: stringOr(item.prompt, ""),
      questions: stringArray(item.questions),
      answerKey: stringArray(item.answerKey),
      rubric: stringOr(item.rubric, ""),
      points: Number.isFinite(Number(item.points)) ? Number(item.points) : pointsPerAssignment
    }))
  };
}

async function generateLearningPlan(body) {
  requireModel();
  const { student, subject, objective, monthlyWindow, priorResults } = body ?? {};
  if (typeof subject !== "string" || !subject.trim() || typeof objective !== "string" || !objective.trim()) {
    throw clientError("Subject and learning objective are required.");
  }
  const result = await createJsonResponse({
    instructions: [
      "You are a curriculum planning assistant creating a one-month plan for one student's subject.",
      "Use prior results when provided and align milestones with the objective.",
      "The plan must include an initial assessment, at least one assignment, a guided tutoring chat, and a final assessment.",
      "Make dates readable, sequence milestones across the month, and use age-appropriate measurable progress skills.",
      "Return JSON with subject, objective, monthlyWindow, milestones (id, title, date, kind), and progress (subject, completion, nextMilestone, status).",
      "Milestone kind must be one of assessment, assignment, chat, final. Completion is 0 through 100."
    ].join(" "),
    content: [{
      type: "input_text",
      text: "Create the student's subject plan from: " + JSON.stringify({
        student: student?.name ?? "Student",
        gradeLevel: student?.gradeLevel ?? "",
        subject: subject.trim(),
        objective: objective.trim(),
        monthlyWindow: monthlyWindow ?? "Next 30 days",
        priorResults: priorResults ?? []
      })
    }]
  });

  if (!Array.isArray(result.milestones) || !Array.isArray(result.progress)) {
    throw new Error("The model returned an incomplete learning plan.");
  }
  result.subject = subject.trim();
  result.objective = objective.trim();
  result.monthlyWindow = stringOr(result.monthlyWindow, monthlyWindow ?? "Next 30 days");
  result.milestones = result.milestones.map((item, index) => ({
    id: stringOr(item.id, "milestone-" + (index + 1)),
    title: stringOr(item.title, "Learning milestone"),
    date: stringOr(item.date, ""),
    kind: ["assessment", "assignment", "chat", "final"].includes(item.kind) ? item.kind : "assignment"
  }));
  result.progress = result.progress.map(item => ({
    subject: stringOr(item.subject, subject),
    completion: Math.max(0, Math.min(100, Number(item.completion) || 0)),
    nextMilestone: stringOr(item.nextMilestone, ""),
    status: stringOr(item.status, "In progress")
  }));
  return result;
}

async function createJsonResponse({ instructions, content }) {
  const result = await getOpenAI().responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-6-astra",
    instructions,
    input: [{ role: "user", content }],
    text: { format: { type: "json_object" } },
    max_output_tokens: 3000
  });
  if (!result.output_text) throw new Error("The AI model returned no content.");
  return JSON.parse(result.output_text);
}

let openaiClient;
function getOpenAI() {
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 300_000 });
  return openaiClient;
}
function requireModel() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("Set OPENAI_API_KEY on the service host first.");
    error.status = 503;
    throw error;
  }
}
function clientError(message) { const error = new Error(message); error.status = 400; return error; }
function stringOr(value, fallback) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function stringArray(value) { return Array.isArray(value) ? value.map(item => String(item)) : []; }
function send(response, status, data) { response.writeHead(status); response.end(JSON.stringify(data)); }

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(clientError("Request is too large."));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(clientError("Invalid JSON request.")); }
    });
    request.on("error", reject);
  });
}

server.listen(port, host, () => console.log("Learning AI Service listening on http://" + host + ":" + port));
