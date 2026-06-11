import { pathToFileURL } from "node:url";
import { createBackendServer } from "./src/app.mjs";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.BACKEND_PORT ?? 3001);
  createBackendServer().listen(port, "127.0.0.1", () => {
    console.log(`Backend API: http://127.0.0.1:${port}`);
    console.log(`Health check: http://127.0.0.1:${port}/api/health`);
  });
}

export { createBackendServer };
