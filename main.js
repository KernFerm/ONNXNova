const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REQUIRED_PYTHON_VERSION = "3.11.9";
const BACKEND_PROFILES = {
  cpu: {
    label: "CPU",
    packages: {
      torch: "2.7.1",
      torchaudio: "2.7.1",
      torchvision: "0.22.1",
      ultralytics: "8.4.60",
      onnx: "1.19.1"
    }
  },
  nvidia: {
    label: "NVIDIA CUDA 11.8",
    packages: {
      torch: "2.7.1+cu118",
      torchaudio: "2.7.1+cu118",
      torchvision: "0.22.1+cu118",
      ultralytics: "8.4.60",
      onnx: "1.19.1"
    }
  },
  amd: {
    label: "AMD DirectML",
    packages: {
      torch: "2.4.1",
      torchaudio: "2.4.1",
      torchvision: "0.19.1",
      torch_directml: "0.2.5.dev240914",
      ultralytics: "8.4.60",
      onnx: "1.19.1",
      numpy: "1.26.4"
    }
  }
};

const CONVERSION_STAGES = [
  { key: "idle", label: "Ready", percent: 0 },
  { key: "validating", label: "Validating", percent: 15 },
  { key: "loading", label: "Loading", percent: 35 },
  { key: "exporting", label: "Exporting", percent: 70 },
  { key: "verifying", label: "Verifying", percent: 90 },
  { key: "completed", label: "Completed", percent: 100 }
];
const SPLASH_MINIMUM_MS = 6500;
const SPLASH_FADE_OUT_MS = 600;

function sanitizePath(inputPath) {
  if (typeof inputPath !== "string") {
    throw new Error("Invalid path value.");
  }

  const trimmed = inputPath.trim();
  if (!trimmed || trimmed.includes("\0")) {
    throw new Error("Path is empty or contains invalid characters.");
  }

  return path.normalize(path.resolve(trimmed));
}

function sanitizeOutputName(outputName) {
  if (typeof outputName !== "string") {
    throw new Error("Output filename is required.");
  }

  const trimmed = outputName.trim();
  if (!trimmed) {
    throw new Error("Output filename cannot be empty.");
  }

  const withoutExtension = trimmed.replace(/\.onnx$/i, "");
  if (!withoutExtension) {
    throw new Error("Output filename cannot be empty.");
  }

  if (withoutExtension.includes("\0") || /[\\/:*?"<>|]/.test(withoutExtension)) {
    throw new Error("Output filename contains invalid characters.");
  }

  return `${withoutExtension}.onnx`;
}

function parsePositiveInteger(value, label, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 920,
    minWidth: 1000,
    minHeight: 760,
    show: false,
    icon: path.join(__dirname, "build", "icon-256.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  return mainWindow;
}

function createSplashWindow() {
  const splashWindow = new BrowserWindow({
    width: 860,
    height: 560,
    resizable: false,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    show: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: "#091532",
    icon: path.join(__dirname, "build", "icon-256.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splashWindow.removeMenu();
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  return splashWindow;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function launchApplication() {
  const splashWindow = createSplashWindow();
  const mainWindow = createWindow();
  const startedAt = Date.now();

  const mainWindowReady = new Promise((resolve) => {
    mainWindow.once("ready-to-show", resolve);
  });

  await Promise.all([mainWindowReady, delay(Math.max(0, SPLASH_MINIMUM_MS - (Date.now() - startedAt)))]);

  if (!splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      "document.body.classList.add('closing');",
      true
    ).catch(() => {});
    await delay(SPLASH_FADE_OUT_MS);
    if (!splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  }

  mainWindow.show();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openStyledInfoWindow({ title, heading, bodyHtml, width = 760, height = 520 }) {
  const parentWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const modalWindow = new BrowserWindow({
    width,
    height,
    minWidth: width,
    minHeight: height,
    maximizable: false,
    minimizable: false,
    resizable: false,
    modal: Boolean(parentWindow),
    parent: parentWindow ?? undefined,
    show: false,
    title,
    autoHideMenuBar: true,
    backgroundColor: "#08152f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data:;" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-a: #08152f;
        --bg-b: #102d66;
        --glow-a: rgba(56, 232, 255, 0.3);
        --glow-b: rgba(154, 111, 255, 0.28);
        --panel: rgba(8, 20, 47, 0.76);
        --border: rgba(112, 226, 255, 0.28);
        --text: #eef7ff;
        --muted: #c6dbff;
        --accent: #67f0ff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", "Trebuchet MS", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(0, 249, 255, 0.18), transparent 34%),
          radial-gradient(circle at top right, rgba(173, 101, 255, 0.22), transparent 30%),
          linear-gradient(145deg, var(--bg-a), var(--bg-b));
        color: var(--text);
        display: flex;
        align-items: stretch;
        justify-content: center;
        overflow: hidden;
      }

      body::before,
      body::after {
        content: "";
        position: absolute;
        inset: auto;
        border-radius: 999px;
        filter: blur(10px);
        pointer-events: none;
      }

      body::before {
        width: 240px;
        height: 240px;
        top: -40px;
        left: -20px;
        background: var(--glow-a);
      }

      body::after {
        width: 260px;
        height: 260px;
        right: -50px;
        bottom: -30px;
        background: var(--glow-b);
      }

      .shell {
        position: relative;
        width: 100%;
        height: 100vh;
        padding: 20px;
        display: flex;
      }

      .panel {
        position: relative;
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 28px;
        background: linear-gradient(180deg, rgba(17, 43, 93, 0.78), var(--panel));
        box-shadow:
          0 24px 70px rgba(4, 14, 34, 0.55),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
        padding: 24px 24px 20px;
        backdrop-filter: blur(14px);
        display: flex;
        flex-direction: column;
        gap: 16px;
        overflow: hidden;
      }

      .eyebrow {
        margin: 0;
        color: var(--accent);
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.1;
        font-weight: 900;
        letter-spacing: -0.04em;
      }

      .content {
        color: var(--muted);
        font-size: 18px;
        line-height: 1.5;
        font-weight: 700;
        padding-right: 6px;
        overflow-y: auto;
      }

      .content p {
        margin: 0 0 14px;
      }

      .content strong {
        color: var(--text);
        font-weight: 900;
      }

      .content ol {
        margin: 0;
        padding-left: 28px;
      }

      .content li + li {
        margin-top: 6px;
      }

      .footer {
        margin-top: auto;
        display: flex;
        justify-content: flex-end;
        padding-top: 6px;
      }

      button {
        border: 1px solid rgba(118, 227, 255, 0.36);
        border-radius: 16px;
        padding: 12px 22px;
        font: inherit;
        font-size: 18px;
        font-weight: 900;
        color: #06142b;
        cursor: pointer;
        background: linear-gradient(135deg, #40f0d0, #6ab5ff 62%, #a277ff);
        box-shadow: 0 12px 30px rgba(72, 185, 255, 0.35);
      }

      button:hover {
        filter: brightness(1.05);
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="panel">
        <p class="eyebrow">Desktop Utility</p>
        <h1>${escapeHtml(heading)}</h1>
        <div class="content">${bodyHtml}</div>
        <div class="footer">
          <button type="button" onclick="window.close()">OK</button>
        </div>
      </div>
    </div>
  </body>
</html>`;

  modalWindow.removeMenu();
  modalWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  modalWindow.once("ready-to-show", () => {
    modalWindow.show();
  });
}

function showAboutInfo() {
  const version = app.getVersion();
  return openStyledInfoWindow({
    title: "About ONNX Nova",
    heading: "Application Info",
    bodyHtml: `
      <p><strong>ONNX Nova</strong></p>
      <p><strong>Version:</strong> ${escapeHtml(version)}<br /><strong>Author:</strong> BubblesTheDev</p>
      <p>Advanced desktop export utility for transforming trusted PyTorch <strong>.pt</strong> models into production-ready ONNX <strong>.onnx</strong> outputs with guided environment checks and hardware-aware setup.</p>
    `,
    width: 760,
    height: 500
  });
}

function showHowToUse() {
  return openStyledInfoWindow({
    title: "How to Use",
    heading: "Using the Converter",
    bodyHtml: `
      <ol>
        <li>Select a trusted <strong>.pt</strong> model file.</li>
        <li>Review the detected model details.</li>
        <li>Choose an output folder and adjust export settings if needed.</li>
        <li>Confirm the trust checkbox before converting.</li>
        <li>Click Convert and monitor the progress and log area.</li>
        <li>Open the output folder after success to access the generated <strong>.onnx</strong> file.</li>
      </ol>
      <p>If Python or packages are missing, use <strong>Install Dependencies</strong> from the app first.</p>
    `,
    width: 860,
    height: 560
  });
}

function buildAppMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Exit",
          accelerator: "Alt+F4",
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: "About",
      submenu: [
        {
          label: "Info",
          click: () => {
            showAboutInfo();
          }
        }
      ]
    },
    {
      label: "Education",
      submenu: [
        {
          label: "How to Use",
          click: () => {
            showHowToUse();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function dedupeStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function addPythonCandidate(candidates, candidatePath) {
  if (!candidatePath || typeof candidatePath !== "string") {
    return;
  }

  const expanded = candidatePath.replace(/^"+|"+$/g, "").trim();
  if (!expanded) {
    return;
  }

  if (path.isAbsolute(expanded)) {
    if (fs.existsSync(expanded)) {
      candidates.push(expanded);
    }
    return;
  }

  candidates.push(expanded);
}

function getPythonPathsFromPyLauncher() {
  if (process.platform !== "win32") {
    return [];
  }

  const result = spawnSync("py", ["-0p"], {
    encoding: "utf8",
    windowsHide: true
  });

  if (result.error || result.status !== 0 || !result.stdout) {
    return [];
  }

  const matches = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/[A-Za-z]:\\.*python(?:w)?\.exe/i);
    if (match) {
      matches.push(match[0].trim());
    }
  }

  return matches;
}

function queryRegistryValue(key, valueName) {
  const args = ["query", key];
  if (valueName === "(Default)") {
    args.push("/ve");
  } else {
    args.push("/v", valueName);
  }

  const result = spawnSync("reg", args, {
    encoding: "utf8",
    windowsHide: true
  });

  if (result.error || result.status !== 0 || !result.stdout) {
    return "";
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (valueName === "(Default)") {
      const defaultMatch = line.match(/^REG_\w+\s+(.+)$/);
      if (defaultMatch) {
        return defaultMatch[1].trim();
      }
    } else if (line.startsWith(valueName)) {
      const valueMatch = line.match(/^[^\s]+\s+REG_\w+\s+(.+)$/);
      if (valueMatch) {
        return valueMatch[1].trim();
      }
    }
  }

  return "";
}

function getPythonPathsFromRegistry() {
  if (process.platform !== "win32") {
    return [];
  }

  const candidates = [];
  const registryKeys = [
    "HKCU\\Software\\Python\\PythonCore\\3.11\\InstallPath",
    "HKLM\\Software\\Python\\PythonCore\\3.11\\InstallPath",
    "HKLM\\Software\\WOW6432Node\\Python\\PythonCore\\3.11\\InstallPath"
  ];

  for (const registryKey of registryKeys) {
    const executablePath = queryRegistryValue(registryKey, "ExecutablePath");
    if (executablePath) {
      candidates.push(executablePath);
    }

    const installPath = queryRegistryValue(registryKey, "(Default)");
    if (installPath) {
      candidates.push(path.join(installPath, "python.exe"));
    }
  }

  return candidates;
}

function getWindowsPythonExecutableCandidates() {
  const candidates = [];

  addPythonCandidate(candidates, path.join(process.env.LocalAppData || "", "Programs", "Python", "Python311", "python.exe"));
  addPythonCandidate(candidates, path.join(process.env.ProgramFiles || "", "Python311", "python.exe"));
  addPythonCandidate(candidates, path.join(process.env["ProgramFiles(x86)"] || "", "Python311", "python.exe"));

  for (const candidatePath of getPythonPathsFromRegistry()) {
    addPythonCandidate(candidates, candidatePath);
  }

  for (const candidatePath of getPythonPathsFromPyLauncher()) {
    addPythonCandidate(candidates, candidatePath);
  }

  return dedupeStrings(candidates);
}

function getPythonLaunchOptions(scriptPath, args = []) {
  const baseArgs = [scriptPath, ...args];

  if (process.platform === "win32") {
    return [
      { command: "py", args: ["-3.11", ...baseArgs], source: "Python launcher (py -3.11)" },
      { command: "py", args: ["-3", ...baseArgs], source: "Python launcher (py -3)" },
      ...getWindowsPythonExecutableCandidates().map((candidatePath) => ({
        command: candidatePath,
        args: baseArgs,
        source: `Direct python.exe path (${candidatePath})`
      })),
      { command: "python", args: baseArgs, source: "PATH command (python)" },
      { command: "python3", args: baseArgs, source: "PATH command (python3)" }
    ];
  }

  return [
    { command: "python3", args: baseArgs, source: "PATH command (python3)" },
    { command: "python", args: baseArgs, source: "PATH command (python)" }
  ];
}

function getPythonInlineOptions(code) {
  if (process.platform === "win32") {
    return [
      { command: "py", args: ["-3.11", "-c", code], source: "Python launcher (py -3.11)" },
      { command: "py", args: ["-3", "-c", code], source: "Python launcher (py -3)" },
      ...getWindowsPythonExecutableCandidates().map((candidatePath) => ({
        command: candidatePath,
        args: ["-c", code],
        source: `Direct python.exe path (${candidatePath})`
      })),
      { command: "python", args: ["-c", code], source: "PATH command (python)" },
      { command: "python3", args: ["-c", code], source: "PATH command (python3)" }
    ];
  }

  return [
    { command: "python3", args: ["-c", code], source: "PATH command (python3)" },
    { command: "python", args: ["-c", code], source: "PATH command (python)" }
  ];
}

function runPythonInlineProbe(candidates, code) {
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args.slice(0, -1), code], {
      cwd: __dirname,
      shell: false,
      windowsHide: true,
      encoding: "utf8"
    });

    if (result.error || result.status !== 0) {
      continue;
    }

    const stdout = String(result.stdout || "").trim();
    if (!stdout) {
      continue;
    }

    return {
      candidate,
      stdout,
      stderr: String(result.stderr || "").trim()
    };
  }

  return null;
}

function guessModelType(filePath) {
  const normalizedName = path.basename(filePath).toLowerCase();

  if (normalizedName.includes("yolo") || normalizedName.includes("ultralytics")) {
    return "Ultralytics YOLO checkpoint";
  }

  if (normalizedName.includes("seg")) {
    return "Segmentation checkpoint";
  }

  if (normalizedName.includes("pose")) {
    return "Pose checkpoint";
  }

  if (normalizedName.includes("cls") || normalizedName.includes("class")) {
    return "Classification checkpoint";
  }

  if (normalizedName.includes("detect")) {
    return "Detection checkpoint";
  }

  return "Generic PyTorch .pt model";
}

function getModelInfo(filePath) {
  const sanitizedPath = sanitizePath(filePath);
  if (!fs.existsSync(sanitizedPath) || !fs.statSync(sanitizedPath).isFile()) {
    throw new Error("Selected .pt file does not exist.");
  }

  if (path.extname(sanitizedPath).toLowerCase() !== ".pt") {
    throw new Error("Selected input file must have a .pt extension.");
  }

  const stats = fs.statSync(sanitizedPath);
  return {
    filePath: sanitizedPath,
    fileName: path.basename(sanitizedPath),
    sizeBytes: stats.size,
    lastModifiedIso: stats.mtime.toISOString(),
    guessedModelType: guessModelType(sanitizedPath),
    defaultOutputName: `${path.parse(sanitizedPath).name}.onnx`
  };
}

function emitProgress(event, key, percent, message) {
  event.sender.send("conversion-progress", {
    key,
    percent,
    message
  });
}

function parseProgressLine(line) {
  if (!line.startsWith("PROGRESS_STAGE=")) {
    return null;
  }

  const payload = line.replace("PROGRESS_STAGE=", "");
  const [key = "", percent = "", ...messageParts] = payload.split("|");
  const message = messageParts.join("|");

  return {
    key,
    percent: Number.parseInt(percent, 10),
    message
  };
}

function forwardTextChunks(event, text, sink) {
  sink.buffer += text;
  const lines = sink.buffer.split(/\r?\n/);
  sink.buffer = lines.pop() ?? "";

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      event.sender.send("conversion-log", "\n");
      continue;
    }

    const progress = parseProgressLine(line);
    if (progress) {
      emitProgress(event, progress.key, progress.percent, progress.message);
      continue;
    }

    event.sender.send("conversion-log", `${line}\n`);
    sink.text += `${line}\n`;
  }
}

function runPythonConversion(inputPath, outputFolder, options, event) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "backend", "convert.py");
    const args = [
      "--input",
      inputPath,
      "--output-dir",
      outputFolder,
      "--output-name",
      options.outputName,
      "--input-height",
      String(options.inputHeight),
      "--input-width",
      String(options.inputWidth),
      "--opset-version",
      String(options.opsetVersion),
      "--dynamic-axes",
      String(Boolean(options.dynamicAxes)),
      "--allow-unsafe-load",
      String(Boolean(options.allowUnsafeLoad))
    ];
    const candidates = getPythonLaunchOptions(scriptPath, args);

    let attemptIndex = 0;

    const tryNext = () => {
      if (attemptIndex >= candidates.length) {
        reject(
          new Error(
            "Python interpreter not found. Install Python 3.11.9 and ensure it is available in PATH."
          )
        );
        return;
      }

      const candidate = candidates[attemptIndex++];
      const child = spawn(candidate.command, candidate.args, {
        cwd: __dirname,
        shell: false,
        windowsHide: true
      });

      const stdoutSink = { buffer: "", text: "" };
      const stderrSink = { buffer: "", text: "" };
      let commandMissing = false;

      child.stdout.on("data", (chunk) => {
        forwardTextChunks(event, chunk.toString(), stdoutSink);
      });

      child.stderr.on("data", (chunk) => {
        forwardTextChunks(event, chunk.toString(), stderrSink);
      });

      child.on("error", (error) => {
        if (error.code === "ENOENT") {
          commandMissing = true;
          tryNext();
          return;
        }

        reject(new Error(`Failed to start Python process: ${error.message}`));
      });

      child.on("close", (code) => {
        if (commandMissing) {
          return;
        }

        if (stdoutSink.buffer.trim()) {
          forwardTextChunks(event, "\n", stdoutSink);
        }

        if (stderrSink.buffer.trim()) {
          forwardTextChunks(event, "\n", stderrSink);
        }

        if (code === 0) {
          const combinedLines = `${stdoutSink.text}\n${stderrSink.text}`
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          const successLine = combinedLines.find((line) => line.startsWith("OUTPUT_FILE="));
          resolve({
            outputFile: successLine ? successLine.replace("OUTPUT_FILE=", "") : ""
          });
          return;
        }

        const message =
          stderrSink.text.trim() || stdoutSink.text.trim() || "Conversion failed.";
        reject(new Error(message));
      });
    };

    tryNext();
  });
}

function runPythonStatusCheck() {
  return new Promise((resolve) => {
    const serializedRequiredVersion = JSON.stringify(REQUIRED_PYTHON_VERSION);
    const serializedProfiles = JSON.stringify(BACKEND_PROFILES);
    const versionCode = `
import json, platform
print(json.dumps({
    "pythonVersion": platform.python_version(),
    "matchesRequiredVersion": platform.python_version() == ${serializedRequiredVersion}
}))
`;
    const packageCode = `
import importlib, json, platform, sys
required_version = json.loads(r'''${serializedRequiredVersion}''')
profiles = json.loads(r'''${serializedProfiles}''')
package_import_names = {"torch_directml": "torch_directml"}
result = {
    "pythonFound": True,
    "pythonVersion": platform.python_version(),
    "matchesRequiredVersion": platform.python_version() == required_version,
    "packages": {},
    "allPackages": {},
    "backend": "unknown",
    "backendLabel": "Unknown",
    "backendMatchesProfile": False
}

all_package_names = set()
for profile in profiles.values():
    all_package_names.update(profile["packages"].keys())

for package_name in sorted(all_package_names):
    entry = {"installed": False, "version": None, "matches": False, "error": None}
    try:
        module = importlib.import_module(package_import_names.get(package_name, package_name))
        version = getattr(module, "__version__", None)
        entry["installed"] = True
        entry["version"] = version
    except Exception as exc:
        entry["error"] = str(exc)
    result["allPackages"][package_name] = entry

backend = "cpu" if result["allPackages"]["torch"]["installed"] else "unknown"
if result["allPackages"].get("torch_directml", {}).get("installed"):
    backend = "amd"
elif result["allPackages"]["torch"]["installed"]:
    torch_module = importlib.import_module("torch")
    cuda_version = getattr(getattr(torch_module, "version", None), "cuda", None)
    torch_version = getattr(torch_module, "__version__", "")
    if cuda_version and "11.8" in str(cuda_version):
        backend = "nvidia"
    elif "+cu118" in torch_version:
        backend = "nvidia"

result["backend"] = backend
if backend in profiles:
    result["backendLabel"] = profiles[backend]["label"]
    expected_profile = profiles[backend]["packages"]
    backend_matches = True
    for package_name, expected_version in expected_profile.items():
        package_entry = dict(result["allPackages"].get(package_name, {}))
        actual_version = package_entry.get("version")
        package_entry["matches"] = (
            package_entry.get("installed", False) and actual_version == expected_version
        )
        result["packages"][package_name] = package_entry
        if actual_version != expected_version:
            backend_matches = False
    result["backendMatchesProfile"] = backend_matches
else:
    result["backendLabel"] = "Unknown"
print(json.dumps(result))
`;

    const candidates = getPythonInlineOptions(versionCode);
    const versionProbe = runPythonInlineProbe(candidates, versionCode);

    if (!versionProbe) {
      resolve({
        pythonFound: false,
        pythonVersion: null,
        matchesRequiredVersion: false,
        packages: {},
        allPackages: {},
        backend: "unknown",
        backendLabel: "Unknown",
        backendMatchesProfile: false,
        detectionMethod: "",
        message: `Python ${REQUIRED_PYTHON_VERSION} was not detected.`
      });
      return;
    }

    let versionStatus;
    try {
      versionStatus = JSON.parse(versionProbe.stdout);
    } catch (_error) {
      resolve({
        pythonFound: false,
        pythonVersion: null,
        matchesRequiredVersion: false,
        packages: {},
        allPackages: {},
        backend: "unknown",
        backendLabel: "Unknown",
        backendMatchesProfile: false,
        detectionMethod: "",
        message: "Python responded, but the version check could not be parsed."
      });
      return;
    }

    const packageProbe = runPythonInlineProbe(
      [
        {
          command: versionProbe.candidate.command,
          args: versionProbe.candidate.args
        }
      ],
      packageCode
    );

    if (!packageProbe) {
      resolve({
        pythonFound: true,
        pythonVersion: versionStatus.pythonVersion ?? null,
        matchesRequiredVersion: Boolean(versionStatus.matchesRequiredVersion),
        packages: {},
        allPackages: {},
        backend: "unknown",
        backendLabel: "Unknown",
        backendMatchesProfile: false,
        detectionMethod: versionProbe.candidate.source || "",
        message: "Python was detected, but package inspection failed."
      });
      return;
    }

    try {
      const parsed = JSON.parse(packageProbe.stdout);
      parsed.detectionMethod = versionProbe.candidate.source || "";
      resolve(parsed);
    } catch (_error) {
      resolve({
        pythonFound: true,
        pythonVersion: versionStatus.pythonVersion ?? null,
        matchesRequiredVersion: Boolean(versionStatus.matchesRequiredVersion),
        packages: {},
        allPackages: {},
        backend: "unknown",
        backendLabel: "Unknown",
        backendMatchesProfile: false,
        detectionMethod: versionProbe.candidate.source || "",
        message: "Python was detected, but package status could not be parsed."
      });
    }
  });
}

function launchDependencyInstaller() {
  const scriptBaseDir = app.isPackaged ? path.join(process.resourcesPath, "tools") : path.join(__dirname, "tools");
  const scriptPath = path.join(scriptBaseDir, "install-python-deps.bat");
  if (!fs.existsSync(scriptPath)) {
    throw new Error("Dependency installer script was not found.");
  }

  const child = spawn(
    "cmd.exe",
    ["/k", scriptPath],
    {
      cwd: scriptBaseDir,
      detached: true,
      stdio: "ignore",
      shell: false,
      windowsHide: false
    }
  );

  child.unref();
}

ipcMain.handle("select-pt-file", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select PyTorch .pt File",
    properties: ["openFile"],
    filters: [{ name: "PyTorch Model", extensions: ["pt"] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = sanitizePath(result.filePaths[0]);
  return {
    canceled: false,
    filePath,
    modelInfo: getModelInfo(filePath)
  };
});

ipcMain.handle("select-output-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Output Folder",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return {
    canceled: false,
    folderPath: sanitizePath(result.filePaths[0])
  };
});

ipcMain.handle("inspect-model-file", async (_event, payload) => {
  try {
    return {
      success: true,
      modelInfo: getModelInfo(payload?.filePath)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Unable to inspect selected model."
    };
  }
});

ipcMain.handle("get-python-status", async () => {
  return runPythonStatusCheck();
});

  ipcMain.handle("launch-dependency-installer", async () => {
  try {
    launchDependencyInstaller();
    return {
      success: true,
      message: "Dependency installer launched. Follow the on-screen setup steps in the batch window."
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Failed to launch dependency installer."
    };
  }
});

ipcMain.handle("open-output-location", async (_event, payload) => {
  try {
    const outputFile = sanitizePath(payload?.outputFile);

    if (fs.existsSync(outputFile)) {
      shell.showItemInFolder(outputFile);
      return { success: true };
    }

    const folderPath = path.dirname(outputFile);
    if (fs.existsSync(folderPath)) {
      const openResult = await shell.openPath(folderPath);
      if (openResult) {
        throw new Error(openResult);
      }
      return { success: true };
    }

    throw new Error("Output location does not exist.");
  } catch (error) {
    return {
      success: false,
      error: error.message || "Failed to open output location."
    };
  }
});

ipcMain.handle("copy-text", async (_event, payload) => {
  clipboard.writeText(String(payload?.text ?? ""));
  return { success: true };
});

ipcMain.handle("get-progress-template", async () => {
  return CONVERSION_STAGES;
});

ipcMain.handle("convert-model", async (event, payload) => {
  try {
    const inputPath = sanitizePath(payload?.inputPath);
    const outputFolder = sanitizePath(payload?.outputFolder);
    const outputName = sanitizeOutputName(payload?.outputName ?? "");
    const inputHeight = parsePositiveInteger(payload?.inputHeight, "Input height", 640);
    const inputWidth = parsePositiveInteger(payload?.inputWidth, "Input width", 640);
    const opsetVersion = parsePositiveInteger(payload?.opsetVersion, "Opset version", 12);
    const dynamicAxes = Boolean(payload?.dynamicAxes);
    const allowUnsafeLoad = Boolean(payload?.allowUnsafeLoad);

    if (!allowUnsafeLoad) {
      throw new Error(
        "Please confirm that you trust this .pt model file before conversion. Loading .pt files can deserialize Python objects."
      );
    }

    if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
      throw new Error("Selected .pt file does not exist.");
    }

    if (path.extname(inputPath).toLowerCase() !== ".pt") {
      throw new Error("Selected input file must have a .pt extension.");
    }

    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    emitProgress(event, "validating", 15, "Validating your model selection...");

    const result = await runPythonConversion(
      inputPath,
      outputFolder,
      {
        outputName,
        inputHeight,
        inputWidth,
        opsetVersion,
        dynamicAxes,
        allowUnsafeLoad
      },
      event
    );

    emitProgress(event, "completed", 100, "Conversion completed successfully.");

    return {
      success: true,
      outputFile: result.outputFile
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Unknown conversion error."
    };
  }
});

app.whenReady().then(() => {
  buildAppMenu();
  launchApplication();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      launchApplication();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
