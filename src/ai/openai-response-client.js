import OpenAI from "openai";
import { missingAPIKeyError } from "../errors.js";

let openaiClient;

function getOpenAI() {
  openaiClient ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 300_000
  });
  return openaiClient;
}

export async function createJsonResponse({ instructions, content }) {
  if (!process.env.OPENAI_API_KEY) throw missingAPIKeyError();

  const inputContent = content.map(item => item.type === "input_text"
    ? { ...item, text: item.text + " Return valid json only, following the requested response fields." }
    : item);
  const result = await getOpenAI().responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-6-astra",
    instructions: instructions + " Return valid json only, following the requested response fields.",
    input: [{ role: "user", content: inputContent }],
    text: { format: { type: "json_object" } },
    max_output_tokens: 7000
  });
  if (!result.output_text) throw new Error("The AI model returned no content.");
  return JSON.parse(result.output_text);
}
