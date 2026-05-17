import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const workspaceRoot = path.resolve(appRoot, "..");
const localQuestionsDir = path.join(workspaceRoot, "문제");

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [appRoot, workspaceRoot, localQuestionsDir],
    },
  },
});
