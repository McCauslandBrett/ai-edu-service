import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { clientError, missingAPIKeyError } from "../errors.js";

let openaiClient;

export async function transcribeTutorAudio(body) {
  if (!process.env.OPENAI_API_KEY) throw missingAPIKeyError();
  const audio = parseAudio(body);
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000 });

  const transcription = await openaiClient.audio.transcriptions.create({
    file: await toFile(audio, "student-response.m4a", { type: "audio/mp4" }),
    model: "gpt-4o-mini-transcribe",
    language: "en",
    prompt: "Short spoken response from a young student during a tutoring lesson. Transcribe the student's words plainly."
  });

  return { text: transcription.text ?? "" };
}

function parseAudio(body) {
  const encoded = body?.audioBase64;
  if (typeof encoded !== "string" || !encoded.trim()) {
    throw clientError("A recorded audio clip is required.");
  }
  const audio = Buffer.from(encoded, "base64");
  if (audio.length < 256) throw clientError("The audio clip is empty. Please record again.");
  if (audio.length > 8 * 1024 * 1024) throw clientError("The audio clip is too long. Please try a shorter response.");
  return audio;
}
