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

export async function createWhiteboardImage(prompt) {
  if (!process.env.OPENAI_API_KEY) throw missingAPIKeyError();
  const result = await getOpenAI().images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-flare",
    prompt,
    size: "1024x1024",
    quality: "low",
    n: 1
  });
  const image = result.data?.[0]?.b64_json;
  if (!image) throw new Error("The image service did not return a whiteboard illustration.");
  return image;
}
