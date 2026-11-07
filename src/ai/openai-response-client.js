import OpenAI from "openai";
import { missingAPIKeyError } from "../errors.js";

let openaiClient;

function getOpenAI() {
  openaiClient ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 600_000
  });
  return openaiClient;
}

export async function createJsonResponse({ instructions, content, maxOutputTokens = 7000 }) {
  if (!process.env.OPENAI_API_KEY) throw missingAPIKeyError();

  const inputContent = content.map(item => item.type === "input_text"
    ? { ...item, text: item.text + " Return valid json only, following the requested response fields." }
    : item);
  let result = await requestResponse(instructions, inputContent, maxOutputTokens);
  let parsed = tryParseJson(result.output_text);
  const reachedLimit = result.status === "incomplete" &&
    result.incomplete_details?.reason === "max_output_tokens";

  if ((reachedLimit || !parsed) && maxOutputTokens < 24000) {
    result = await requestResponse(instructions, inputContent, 24000);
    parsed = tryParseJson(result.output_text);
  }

  if (result.status && result.status !== "completed") {
    throw new Error("The AI response did not finish. Tap Try again to generate the plan again.");
  }
  if (!parsed) {
    throw new Error("The AI returned an incomplete plan. Tap Try again; if it happens again, shorten the instructor notes.");
  }
  return parsed;
}

function requestResponse(instructions, content, maxOutputTokens) {
  return getOpenAI().responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-6-astra",
    instructions: instructions + " Return valid json only, following the requested response fields.",
    input: [{ role: "user", content }],
    text: { format: { type: "json_object" } },
    max_output_tokens: maxOutputTokens
  });
}

function tryParseJson(text) {
  if (typeof text !== "string" || !text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
