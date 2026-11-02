# Learning AI Service

Small Node.js service using Node 20+ and the official OpenAI Node SDK. The API key remains on the service host.

## Capabilities

- POST /api/grade: grade handwritten assignments against an answer key and rubric.
- POST /api/assignments/generate: generate assignments for a student, subject, topic, and learning objective.
- POST /api/plans/generate: create a one-month subject plan with assessments, assignments, tutoring chat, a final assessment, and progress skills.
- GET /health: report service status and supported capabilities.

## Start

Copy .env.example to .env, put your OpenAI API key in the OPENAI_API_KEY value, then run start-learning-ai-service.command. The .env file is ignored by Git and the key is never included in the iOS app.

The iOS app points to http://192.168.1.211:3100. The Mac and iPad must share a network that allows the iPad to reach the Mac. If the Mac's LAN address changes, update GRADING_API_BASE_URL in /Users/brettmccausland/Documents/GitHub/ai-edu-ios/Sources/Info.plist and rebuild the app.
