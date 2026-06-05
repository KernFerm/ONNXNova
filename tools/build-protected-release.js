const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require("javascript-obfuscator");
} catch (error) {
  console.error(
    [
      "Missing dependency: javascript-obfuscator.",
      "This project declares it in package.json, but it is not installed in node_modules yet.",
      "Run one of these commands before using the protected build flow:",
      "  npm install",
      "  npm install --save-dev javascript-obfuscator"
    ].join("\n")
  );
  process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const localStageDir = path.join(rootDir, ".protected-release");
const localOutputDir = path.join(rootDir, "dist-protected");
const tempBuildRoot = path.join(os.tmpdir(), "onnx-nova-protected-build");
const stageDir = path.join(tempBuildRoot, "stage");
const outputDir = path.join(tempBuildRoot, "dist");
const args = new Set(process.argv.slice(2));
const prepareOnly = args.has("--prepare-only");
const dirOnly = args.has("--dir");

const skipNames = new Set([
  ".git",
  ".protected-release",
  "dist",
  "dist-protected",
  "notes.txt",
  "command.bat",
  "build-protected-release.js"
]);

const skipObfuscationPrefixes = [
  "node_modules/",
  "dist/",
  "dist-protected/",
  ".git/",
  ".protected-release/",
  "Docs/"
];

const skipObfuscationFiles = new Set([
  "package-lock.json",
  "package.json"
]);

const obfuscationOptions = {
  compact: true,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 8,
  simplify: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  transformObjectKeys: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false
};

function removeStageDirectory() {
  fs.rmSync(stageDir, { recursive: true, force: true });
}

function removeLocalStageDirectory() {
  fs.rmSync(localStageDir, { recursive: true, force: true });
}

function removeOutputDirectory() {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

function removeLocalOutputDirectory() {
  fs.rmSync(localOutputDir, { recursive: true, force: true });
}

function shouldCopy(sourcePath) {
  const relative = path.relative(rootDir, sourcePath);
  if (!relative || relative.startsWith("..")) return false;
  const firstSegment = relative.split(path.sep)[0];
  return !skipNames.has(firstSegment);
}

function copyProjectToStage() {
  fs.mkdirSync(stageDir, { recursive: true });

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (skipNames.has(entry.name)) continue;
    const sourcePath = path.join(rootDir, entry.name);
    const targetPath = path.join(stageDir, entry.name);
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      force: true,
      filter: (src) => shouldCopy(src)
    });
  }
}

function copyStageToLocalWorkspace() {
  removeLocalStageDirectory();
  fs.cpSync(stageDir, localStageDir, {
    recursive: true,
    force: true
  });
}

function normalizeRelativePath(relativePath) {
  return relativePath.replace(/\\/g, "/");
}

function shouldObfuscate(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized.endsWith(".js")) {
    return false;
  }

  if (skipObfuscationFiles.has(normalized)) {
    return false;
  }

  return !skipObfuscationPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function obfuscateFile(relativePath) {
  const targetPath = path.join(stageDir, relativePath);
  if (!fs.existsSync(targetPath)) return;
  const source = fs.readFileSync(targetPath, "utf8");
  const result = JavaScriptObfuscator.obfuscate(source, obfuscationOptions);
  fs.writeFileSync(targetPath, result.getObfuscatedCode(), "utf8");
}

function obfuscateStageFiles() {
  const queue = ["."];
  while (queue.length) {
    const current = queue.pop();
    const absolute = path.join(stageDir, current);
    const entries = fs.readdirSync(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const nextRelative = current === "." ? entry.name : path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(nextRelative);
        continue;
      }
      if (entry.isFile() && shouldObfuscate(nextRelative)) {
        obfuscateFile(nextRelative);
      }
    }
  }
}

function runBuilder() {
  const cliPath = path.join(rootDir, "node_modules", "electron-builder", "cli.js");
  const builderArgs = [
    cliPath,
    "--projectDir",
    stageDir,
    `--config.directories.output=${outputDir}`
  ];
  if (dirOnly) {
    builderArgs.push("--dir");
  } else {
    builderArgs.push("--win", "nsis", "--x64");
  }
  const result = spawnSync(process.execPath, builderArgs, {
    cwd: rootDir,
    stdio: "inherit"
  });
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    throw result.error;
  }
}

function copyBuildOutputToWorkspace() {
  removeLocalOutputDirectory();
  fs.mkdirSync(localOutputDir, { recursive: true });
  fs.cpSync(outputDir, localOutputDir, {
    recursive: true,
    force: true
  });
}

function main() {
  removeOutputDirectory();
  removeStageDirectory();
  copyProjectToStage();
  obfuscateStageFiles();

  if (prepareOnly) {
    copyStageToLocalWorkspace();
    console.log(`Prepared protected release stage at ${localStageDir}`);
    return;
  }

  runBuilder();
  copyBuildOutputToWorkspace();
  console.log(`Protected build output copied to ${localOutputDir}`);
}

main();
