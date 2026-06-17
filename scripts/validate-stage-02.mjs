import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const checks = [];

await run();

async function run() {
  checkFiles();
  await runVitest();
  await checkFrontendBundle();
  await checkSourceConstraints();

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function checkFiles() {
  for (const file of [
    "frontend/src/spa/pages/shared.tsx",
    "frontend/src/spa/pages/AdminPages.tsx",
    "frontend/src/spa/pages/MessagesPages.tsx",
    "frontend/src/spa/pages/OrdersPages.tsx",
    "frontend/src/spa/pages/RequestsPages.tsx",
    "frontend/src/spa/pages/DisputesPages.tsx",
    "frontend/src/spa/pages/ProfilePages.tsx",
    "tests/component/spa-data-flow.test.tsx"
  ]) {
    record(fs.existsSync(path.join(projectRoot, file)), `stage 02 file exists: ${file}`);
  }
}

async function runVitest() {
  const result = await runCommand("npm", ["run", "test:component"], { timeoutMs: 120000 });
  record(result.code === 0, "component test suite passes");
  if (result.code !== 0) {
    record(false, result.stderr.slice(0, 500) || result.stdout.slice(0, 500));
  }
}

async function checkFrontendBundle() {
  const result = await runCommand("npm", ["run", "build"], { timeoutMs: 120000 });
  record(result.code === 0, "frontend build succeeds for stage 02");
  if (result.code !== 0) {
    record(false, result.stderr.slice(0, 500) || result.stdout.slice(0, 500));
  }
  const distRoot = path.join(projectRoot, "frontend", "dist");
  record(fs.existsSync(path.join(distRoot, "index.html")), "frontend dist index exists");
}

async function checkSourceConstraints() {
  const files = [
    "frontend/src/spa/pages/AdminPages.tsx",
    "frontend/src/spa/pages/MessagesPages.tsx",
    "frontend/src/spa/pages/OrdersPages.tsx",
    "frontend/src/spa/pages/RequestsPages.tsx",
    "frontend/src/spa/pages/DisputesPages.tsx",
    "frontend/src/spa/pages/ProfilePages.tsx"
  ];
  const content = files.map((file) => fs.readFileSync(path.join(projectRoot, file), "utf8")).join("\n");
  record(!content.includes("window.location.reload()"), "no business window.location.reload remains in SPA pages");
  record(!content.includes("window.location.href ="), "no business window.location.href remains in SPA pages");
  record(!content.includes("new URLSearchParams(window.location.search)"), "query parsing is centralized");
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill(), options.timeoutMs ?? 30000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: 1, stdout, stderr: stderr + error.message });
    });
  });
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
