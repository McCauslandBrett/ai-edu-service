export function clientError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function missingAPIKeyError() {
  return Object.assign(new Error("Set OPENAI_API_KEY on the service host first."), { status: 503 });
}
