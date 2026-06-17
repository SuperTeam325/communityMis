import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const distRoot = path.join(process.cwd(), "frontend", "dist");
const manifestPath = path.join(distRoot, "manifest.json");
const checks = [];

run();

function run() {
  record(fs.existsSync(manifestPath), "production manifest exists");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  checkHtmlBudget();
  checkCssBudget();
  checkJsBudget();
  checkManifestShape(manifest);

  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.message}`);
  }
  if (checks.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

function checkHtmlBudget() {
  const htmlFiles = listFiles(distRoot).filter((item) => item.endsWith(".html"));
  for (const file of htmlFiles) {
    const size = fs.statSync(file).size;
    record(size < 80 * 1024, `${path.relative(distRoot, file)} HTML is below 80KB (${size} bytes)`);
  }
}

function checkCssBudget() {
  const cssFiles = listFiles(distRoot).filter((file) => file.endsWith(".css"));
  const totalGzip = cssFiles.reduce((sum, file) => sum + gzipSize(file), 0);
  record(totalGzip < 180 * 1024, `CSS total gzip is below 180KB (${totalGzip} bytes)`);
}

function checkJsBudget() {
  const jsFiles = listFiles(path.join(distRoot, "assets")).filter((file) => file.endsWith(".js"));
  const totalGzip = jsFiles.reduce((sum, file) => sum + gzipSize(file), 0);
  record(totalGzip < 900 * 1024, `SPA JS total gzip is below 900KB (${totalGzip} bytes)`);
}

function checkManifestShape(manifest) {
  record(manifest.type === "vite-react-spa", "manifest marks React SPA");
  record(manifest.frontendMode === "spa", "manifest frontendMode is spa");
  record(!("prototypeAssets" in manifest), "manifest does not contain prototype assets");
}

function gzipSize(file) {
  return zlib.gzipSync(fs.readFileSync(file)).length;
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(filePath));
    } else {
      files.push(filePath);
    }
  }
  return files;
}

function record(ok, message) {
  checks.push({ ok: Boolean(ok), message });
}
