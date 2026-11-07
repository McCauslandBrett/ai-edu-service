# Learning AI Service

Node.js service using Node 20+ and the official OpenAI Node SDK. The API key stays on the service host.

## Capabilities

- `POST /api/grade`: grade handwritten assignment work against its answer key and rubric.
- `POST /api/assignments/generate`: generate assignment content for a student and subject.
- `POST /api/plans/generate`: create a four-week subject plan with weekly tutoring prompts, assignments, and assessments.
- `POST /api/tutor/chat`: run a prompt-led tutor conversation with student messages and whiteboard context.
- `GET /health`: report service status and supported capabilities.

## Code organization

- `server.mjs` configures and starts the service.
- `src/http/service-server.js` owns HTTP routing, request parsing, and response handling.
- `src/ai/openai-response-client.js` owns OpenAI Responses API calls and JSON output handling.
- `src/ai/openai-image-client.js` owns on-demand whiteboard illustration generation.
- `src/ai/grade-assignment.js`, `generate-assignments.js`, and `generate-learning-plan.js` each own one AI capability.
- `src/domain/assignment-content.js` normalizes assignment questions, answers, and plan activities.
- `src/errors.js` defines request and configuration errors.

## Start

Copy `.env.example` to `.env`, set `OPENAI_API_KEY`, then run `start-learning-ai-service.command`. The `.env` file is ignored by Git and the key is never included in the iOS app.

The iOS app points to `http://192.168.1.211:3100`. The Mac and iPad must share a network that allows the iPad to reach the Mac. If the Mac's LAN address changes, update `GRADING_API_BASE_URL` in `/Users/brettmccausland/Documents/GitHub/ai-edu-ios/Sources/Info.plist` and rebuild the app.
