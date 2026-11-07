import http from "node:http";
import { clientError } from "../errors.js";

const maxBodyBytes = 12 * 1024 * 1024;

export function createServiceServer(handlers) {
  return http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (isHealthCheck(request)) return respondWithHealth(response);
    if (request.method !== "POST") return sendJson(response, 404, { error: "Route not found." });

    const handler = handlers[request.url];
    if (!handler) return sendJson(response, 404, { error: "Route not found." });
    await handleAPIRequest(request, response, handler);
  });
}

function isHealthCheck(request) {
  return request.method === "GET" && request.url === "/health";
}

function respondWithHealth(response) {
  return sendJson(response, 200, {
    ok: true,
    service: "Learning AI Service",
    capabilities: ["grading", "assignment-generation", "plan-generation", "tutor-chat"],
    configured: Boolean(process.env.OPENAI_API_KEY)
  });
}

async function handleAPIRequest(request, response, handler) {
  const startedAt = Date.now();
  try {
    const body = await readJson(request);
    const result = await handler(body);
    console.log(request.method, request.url, 200, Date.now() - startedAt + "ms");
    return sendJson(response, 200, result);
  } catch (error) {
    const status = error?.status === 429 ? 429 : error?.status === 400 ? 400 : error?.status === 503 ? 503 : 502;
    console.error(request.method, request.url, status, Date.now() - startedAt + "ms", error?.message ?? error);
    return sendJson(response, status, { error: error?.message ?? "The request failed." });
  }
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw clientError("Request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw clientError("Invalid JSON request.");
  }
}

function sendJson(response, status, data) {
  response.writeHead(status);
  response.end(JSON.stringify(data));
}
