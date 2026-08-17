import { handleWorkspaceChat } from "../src/routes/api/workspace-chat";

export function POST(request: Request) {
  return handleWorkspaceChat(request);
}
