import { createJsonResponse } from "./openai-response-client.js";
import { createWhiteboardImage } from "./openai-image-client.js";
import { clientError } from "../errors.js";

export async function tutorChat(body) {
  const request = parseTutorRequest(body);
  const content = [{
    type: "input_text",
    text: JSON.stringify({
      student: request.student,
      subject: request.subject,
      weekNumber: request.weekNumber,
      conversation: request.messages,
      currentWhiteboardNotes: request.canvasItems
    })
  }];
  if (request.imageBase64) {
    content.push({
      type: "input_image",
      image_url: "data:image/png;base64," + request.imageBase64
    });
  }

  const result = await createJsonResponse({
    instructions: tutorInstructions(request),
    maxOutputTokens: 1800,
    content
  });
  const reply = normalizeTutorReply(result);
  if (reply.imagePrompt) {
    try {
      reply.imageBase64 = await createWhiteboardImage(reply.imagePrompt);
    } catch (error) {
      console.error("Tutor whiteboard illustration failed:", error?.message ?? error);
      reply.imageError = "I couldn't create that illustration this time, but we can keep working on the whiteboard.";
    }
  }
  return reply;
}

function parseTutorRequest(body) {
  const { student, subject, weekNumber, lecturePrompt, messages, canvasItems, imageBase64 } = body ?? {};
  if (typeof subject !== "string" || !subject.trim() ||
      typeof lecturePrompt !== "string" || !lecturePrompt.trim()) {
    throw clientError("A subject and prepared lecture prompt are required.");
  }
  if (!Array.isArray(messages) || messages.length > 40) {
    throw clientError("Tutor chat must contain no more than 40 conversation turns.");
  }
  const validMessages = messages.filter(message =>
    ["user", "assistant"].includes(message?.role) &&
    typeof message?.content === "string" && message.content.trim()
  ).slice(-24).map(message => ({ role: message.role, content: message.content.slice(0, 4000) }));

  return {
    student: {
      name: String(student?.name ?? "Student").slice(0, 120),
      age: student?.age ?? null,
      gradeLevel: String(student?.gradeLevel ?? "").slice(0, 120)
    },
    subject: subject.trim().slice(0, 160),
    weekNumber: Math.max(1, Math.min(4, Number(weekNumber) || 1)),
    lecturePrompt: lecturePrompt.trim().slice(0, 12000),
    messages: validMessages,
    canvasItems: Array.isArray(canvasItems)
      ? canvasItems.filter(item => typeof item === "string").slice(-12).map(item => item.slice(0, 500))
      : [],
    imageBase64: typeof imageBase64 === "string" && imageBase64.length <= 8_000_000
      ? imageBase64
      : undefined
  };
}

function tutorInstructions(request) {
  return [
    "You are a warm, age-appropriate learning tutor having a live lesson with one student.",
    "Follow the instructor's prepared lesson prompt as the lesson plan. Use the student's age, grade, subject, and week to choose language and examples.",
    "Ask one clear question at a time, wait for the learner's thinking, encourage them to explain, and gently redirect off-topic conversation back to the lesson.",
    "Respond to the learner's latest message in a natural conversational voice. Do not reveal hidden answers to practice questions unless the lesson prompt directs you to.",
    "You can see the learner's current whiteboard image when one is provided. Refer to their work specifically and constructively.",
    "When a visual would help the learner, create a real whiteboard illustration. This can be a set of distinct objects for a counting task (for example, several apples with the student asked to circle eight) or a clear, age-appropriate scene/diagram for a science or physics problem. The image must contain the objects or setup and no answer markings; the student will draw over it. Do not generate images for every turn. Keep using the current illustration if it still fits the lesson.",
    "You may also add one or two concise text notes to the whiteboard.",
    "Return JSON with exactly three fields: reply (string), canvasItems (array of new short strings to add to the whiteboard; use an empty array when none are useful), and imagePrompt (a concise image-generation prompt string for a new illustration, or null if no new image is needed). When a task asks the student to identify or circle a quantity, include exactly that many clearly separated target objects plus several different distractor objects. For example, if the student should circle eight apples, show eight apples mixed among other objects. Do not highlight or circle the answer.",
    `Student: ${request.student.name}, age ${request.student.age ?? "not provided"}, grade ${request.student.gradeLevel || "not provided"}. Subject: ${request.subject}. Week ${request.weekNumber}.`,
    "Prepared instructor prompt follows: " + request.lecturePrompt
  ].join(" ");
}

function normalizeTutorReply(result) {
  if (typeof result?.reply !== "string" || !result.reply.trim()) {
    throw new Error("The tutor did not return a reply. Try sending your message again.");
  }
  return {
    reply: result.reply.trim(),
    canvasItems: Array.isArray(result.canvasItems)
      ? result.canvasItems.filter(item => typeof item === "string" && item.trim()).slice(0, 2).map(item => item.trim())
      : [],
    imagePrompt: typeof result.imagePrompt === "string" && result.imagePrompt.trim()
      ? result.imagePrompt.trim().slice(0, 4000)
      : undefined
  };
}
