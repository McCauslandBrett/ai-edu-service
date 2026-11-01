# Learning AI Service

Small Node.js service using the official OpenAI Node SDK. The API key remains on the service host.

## Capabilities

- POST /api/grade: grade handwritten assignments against an answer key and rubric.
- POST /api/assignments/generate: generate assignments for a student, subject, topic, and learning objective.
- POST /api/plans/generate: create a one-month subject plan with assessments, assignments, tutoring chat, a final assessment, and progress skills.
- GET /health: report service status and supported capabilities.

## Start

Run start-learning-ai-service.command (the filename is kept for compatibility with the existing setup). Paste an OpenAI API key when prompted. It is used for that Terminal session and is not saved in the app.

The iOS app points to http://192.168.1.211:3001. The Mac and iPad must share a network that allows the iPad to reach the Mac. If the Mac's LAN address changes, update GRADING_API_BASE_URL in /Users/brettmccausland/Documents/GitHub/ai-edu-ios/Sources/Info.plist and rebuild the app.
