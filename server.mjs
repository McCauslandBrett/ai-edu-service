import "dotenv/config";
import { createServiceServer } from "./src/http/service-server.js";
import { gradeAssignment } from "./src/ai/grade-assignment.js";
import { generateAssignments } from "./src/ai/generate-assignments.js";
import { generateLearningPlan } from "./src/ai/generate-learning-plan.js";
import { tutorChat } from "./src/ai/tutor-chat.js";

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "0.0.0.0";

const server = createServiceServer({
  "/api/grade": gradeAssignment,
  "/api/assignments/generate": generateAssignments,
  "/api/plans/generate": generateLearningPlan,
  "/api/tutor/chat": tutorChat
});

server.listen(port, host, () => console.log("Learning AI Service listening on http://" + host + ":" + port));
