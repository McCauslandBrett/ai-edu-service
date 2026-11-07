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
      tutorTurnsCompleted: request.tutorTurnCount,
      maximumTutorTurns: 5,
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
  const reply = normalizeTutorReply(result, { forceComplete: request.tutorTurnCount >= 4 });
  if (!reply.sessionComplete && request.action !== "check-whiteboard" && reply.imagePrompt) {
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
  const { student, subject, weekNumber, lecturePrompt, action, tutorTurnCount, messages, canvasItems, imageBase64 } = body ?? {};
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
    action: ["next-question", "check-whiteboard"].includes(action) ? action : undefined,
    tutorTurnCount: Math.max(0, Math.min(5, Number(tutorTurnCount) || 0)),
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
  const ageGuidance = request.student.age !== null && Number(request.student.age) <= 5
    ? `The student is ${request.student.age} years old and cannot read or write. Never require reading, writing words, copying labels, or typing.`
    : `Adapt all language and activities to the student's age (${request.student.age ?? "not provided"}). Never assume the student can read or write without evidence.`;

  return [
    "You are a warm, age-appropriate learning tutor having a live lesson with one student.",
    ageGuidance,
    "Speak every direction aloud using short, concrete sentences appropriate to the student's age.",
    "You do not have a camera or live view of the child or their surroundings. You can only inspect a whiteboard snapshot attached to a message sent by the app. Never ask the child to point at physical objects, hold something up, or show you something in the room; you cannot see those actions.",
    "For a visual response, ask the child to draw, mark, or circle something directly on the whiteboard. Tell them to tap Check my work when they are done so the app sends you the whiteboard image. Do not say you can see or evaluate new marks before that button is pressed. For a verbal response, ask them to say the answer aloud into the microphone.",
    "Follow the instructor's prepared lesson prompt as the lesson plan. Use the student's age, grade, subject, and week to choose language and examples.",
    "Ask one clear question at a time, wait for the learner's thinking, encourage them to explain, and gently redirect off-topic conversation back to the lesson.",
    "Keep this lesson bounded to five tutor replies total. Mark sessionComplete true early if the student demonstrates the target skill correctly twice without help or asks to stop. Once complete, warmly summarize one thing they practiced, praise their effort, and do not ask another question.",
    ...(request.tutorTurnCount >= 4 ? [
      "This is the fifth and final tutor turn. End the lesson now with a short spoken wrap-up and encouragement. Set sessionComplete to true, give a short completionReason, ask no question, and create no new image."
    ] : []),
    ...(request.action === "next-question" ? [
      "The instructor pressed Next question. Move forward now: briefly praise the student's effort, then give one new question that practices the same lesson skill with a different example. Do not repeat the prior question, and do not claim the student said anything they did not say."
    ] : []),
    ...(request.action === "check-whiteboard" ? [
      "The instructor pressed Check my work. Carefully inspect the student's current whiteboard image, including their drawing or marks over the lesson illustration. Give kind, specific spoken feedback on what you can actually see. If the answer is correct, say so simply and explain why. If it is not correct or unclear, encourage them and ask one small guiding question instead of giving the answer. Do not create or replace the whiteboard image during this check; return imagePrompt as null."
    ] : []),
    "Respond to the learner's latest message in a natural conversational voice. Do not reveal hidden answers to practice questions unless the lesson prompt directs you to.",
    "In your first spoken greeting, tell the child they can answer out loud, or draw/circle on the whiteboard and tap Check my work; a grown-up can help with the buttons.",
    "Refer to whiteboard work only when the current request includes an image. Give specific, constructive feedback about visible marks, and do not infer gestures or actions outside the image.",
    "When a visual would help the learner, create a real whiteboard illustration. This can be a set of distinct objects for a counting task (for example, several apples with the student asked to circle eight) or a clear, age-appropriate scene/diagram for a science or physics problem. The image must contain the objects or setup and no answer markings; the student will draw over it. Do not generate images for every turn. Keep using the current illustration if it still fits the lesson.",
    "Do not add written text notes to the whiteboard. Use a picture or simple visual when a visual would help.",
    "Return JSON with exactly five fields: reply (string), canvasItems (array of new short strings to add to the whiteboard; use an empty array when none are useful), imagePrompt (a concise image-generation prompt string for a new illustration, or null if no new image is needed), sessionComplete (boolean), and completionReason (short string or null). When a task asks the student to identify or circle a quantity, include exactly that many clearly separated target objects plus several different distractor objects. For example, if the student should circle eight apples, show eight apples mixed among other objects. Do not highlight or circle the answer.",
    `Student: ${request.student.name}, age ${request.student.age ?? "not provided"}, grade ${request.student.gradeLevel || "not provided"}. Subject: ${request.subject}. Week ${request.weekNumber}.`,
    "Prepared instructor prompt follows: " + request.lecturePrompt
  ].join(" ");
}

function normalizeTutorReply(result, { forceComplete = false } = {}) {
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
      : undefined,
    sessionComplete: forceComplete || result.sessionComplete === true,
    completionReason: typeof result.completionReason === "string" && result.completionReason.trim()
      ? result.completionReason.trim().slice(0, 200)
      : forceComplete ? "Completed the five-turn lesson." : undefined
  };
}
