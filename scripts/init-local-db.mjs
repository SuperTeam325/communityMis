import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const databaseName = process.env.DB_NAME ?? "community_mis";
const mysqlBin = process.env.MYSQL_BIN ?? "mysql";
const sqlFiles = [
  ...listSqlFiles("database/migrations"),
  ...listSqlFiles("database/seeds")
];

if (sqlFiles.length === 0) {
  throw new Error("No SQL files found under database/migrations or database/seeds.");
}

const sql = [
  "SET NAMES utf8mb4;",
  `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(databaseName)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`,
  `USE ${quoteIdentifier(databaseName)};`,
  ...sqlFiles.map((file) => `\n-- source: ${path.relative(projectRoot, file)}\n${fs.readFileSync(file, "utf8")}`)
].join("\n");

await runMysql(sql);

console.log(`Initialized database ${databaseName}.`);
for (const file of sqlFiles) {
  console.log(`applied - ${path.relative(projectRoot, file)}`);
}

function listSqlFiles(relativeDir) {
  const dir = path.join(projectRoot, relativeDir);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(dir, file));
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
  return `\`${value}\``;
}

function runMysql(stdinSql) {
  return new Promise((resolve, reject) => {
    const args = [
      `--host=${process.env.DB_HOST ?? "127.0.0.1"}`,
      `--port=${process.env.DB_PORT ?? "3306"}`,
      `--user=${process.env.DB_USER ?? "root"}`,
      "--default-character-set=utf8mb4",
      "--comments"
    ];

    const child = spawn(mysqlBin, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        MYSQL_PWD: process.env.DB_PASSWORD ?? process.env.MYSQL_PWD ?? ""
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        if (stdout.trim()) {
          console.log(stdout.trim());
        }
        resolve();
      } else {
        reject(new Error(`mysql exited with code ${code}\n${stderr.trim()}`));
      }
    });

    child.stdin.end(stdinSql);
  });
}
