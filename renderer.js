const RECENT_MODELS_KEY = "ptToOnnxRecentModels";
const RECENT_FOLDERS_KEY = "ptToOnnxRecentFolders";
const RECENT_LIMIT = 5;

const elements = {
  dropZone: document.getElementById("dropZone"),
  selectPtFileButton: document.getElementById("selectPtFileButton"),
  selectOutputFolderButton: document.getElementById("selectOutputFolderButton"),
  convertButton: document.getElementById("convertButton"),
  openOutputFolderButton: document.getElementById("openOutputFolderButton"),
  installDependenciesButton: document.getElementById("installDependenciesButton"),
  refreshPythonStatusButton: document.getElementById("refreshPythonStatusButton"),
  copyLogButton: document.getElementById("copyLogButton"),
  clearLogButton: document.getElementById("clearLogButton"),
  clearRecentModelsButton: document.getElementById("clearRecentModelsButton"),
  clearRecentFoldersButton: document.getElementById("clearRecentFoldersButton"),
  ptFilePath: document.getElementById("ptFilePath"),
  outputFolderPath: document.getElementById("outputFolderPath"),
  outputNameInput: document.getElementById("outputNameInput"),
  inputSizePresetSelect: document.getElementById("inputSizePresetSelect"),
  inputWidthInput: document.getElementById("inputWidthInput"),
  inputHeightInput: document.getElementById("inputHeightInput"),
  customSizeNotice: document.getElementById("customSizeNotice"),
  opsetVersionInput: document.getElementById("opsetVersionInput"),
  dynamicAxesCheckbox: document.getElementById("dynamicAxesCheckbox"),
  trustModelCheckbox: document.getElementById("trustModelCheckbox"),
  logArea: document.getElementById("logArea"),
  messageBox: document.getElementById("messageBox"),
  modelFileName: document.getElementById("modelFileName"),
  modelFileSize: document.getElementById("modelFileSize"),
  modelLastModified: document.getElementById("modelLastModified"),
  modelType: document.getElementById("modelType"),
  recentModels: document.getElementById("recentModels"),
  recentFolders: document.getElementById("recentFolders"),
  pythonStatusSummary: document.getElementById("pythonStatusSummary"),
  pythonPackageList: document.getElementById("pythonPackageList"),
  progressLabel: document.getElementById("progressLabel"),
  progressPercent: document.getElementById("progressPercent"),
  progressBarFill: document.getElementById("progressBarFill"),
  stageChips: document.getElementById("stageChips")
};

const state = {
  selectedPtFile: "",
  selectedOutputFolder: "",
  selectedModelInfo: null,
  lastOutputFile: "",
  progressTemplate: [],
  progressKey: "idle",
  recentModels: loadRecent(RECENT_MODELS_KEY),
  recentFolders: loadRecent(RECENT_FOLDERS_KEY)
};

const INPUT_SIZE_PRESETS = {
  "640": { width: 640, height: 640 },
  "320": { width: 320, height: 320 }
};

function loadRecent(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch (_error) {
    return [];
  }
}

function saveRecent(key, values) {
  localStorage.setItem(key, JSON.stringify(values.slice(0, RECENT_LIMIT)));
}

function pushRecent(key, values, nextValue) {
  const normalized = [nextValue, ...values.filter((value) => value !== nextValue)].slice(0, RECENT_LIMIT);
  saveRecent(key, normalized);
  return normalized;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatDate(isoString) {
  if (!isoString) {
    return "-";
  }

  return new Date(isoString).toLocaleString();
}

function appendLog(message) {
  elements.logArea.textContent += message;
  elements.logArea.scrollTop = elements.logArea.scrollHeight;
}

function clearLog() {
  elements.logArea.textContent = "";
}

function setMessage(type, text) {
  elements.messageBox.textContent = text;
  elements.messageBox.className = `message ${type}`;
}

function renderModelInfo(modelInfo) {
  state.selectedModelInfo = modelInfo;

  if (!modelInfo) {
    elements.modelFileName.textContent = "No file loaded";
    elements.modelFileSize.textContent = "-";
    elements.modelLastModified.textContent = "-";
    elements.modelType.textContent = "-";
    return;
  }

  elements.modelFileName.textContent = modelInfo.fileName;
  elements.modelFileSize.textContent = formatBytes(modelInfo.sizeBytes);
  elements.modelLastModified.textContent = formatDate(modelInfo.lastModifiedIso);
  elements.modelType.textContent = modelInfo.guessedModelType;
}

function normalizeOnnxName(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.toLowerCase().endsWith(".onnx") ? trimmed : `${trimmed}.onnx`;
}

function updateConvertButtonState() {
  const hasOutputName = Boolean(normalizeOnnxName(elements.outputNameInput.value));
  const canConvert =
    Boolean(state.selectedPtFile) &&
    Boolean(state.selectedOutputFolder) &&
    Boolean(elements.trustModelCheckbox.checked) &&
    hasOutputName;

  elements.convertButton.disabled = !canConvert;
}

function syncInputSizePreset() {
  const preset = elements.inputSizePresetSelect.value;
  const presetValues = INPUT_SIZE_PRESETS[preset];
  const isCustom = preset === "custom";

  if (presetValues) {
    elements.inputWidthInput.value = String(presetValues.width);
    elements.inputHeightInput.value = String(presetValues.height);
  }

  elements.inputWidthInput.readOnly = !isCustom;
  elements.inputHeightInput.readOnly = !isCustom;
  elements.inputWidthInput.toggleAttribute("aria-readonly", !isCustom);
  elements.inputHeightInput.toggleAttribute("aria-readonly", !isCustom);
  elements.inputWidthInput.classList.toggle("locked-input", !isCustom);
  elements.inputHeightInput.classList.toggle("locked-input", !isCustom);
  elements.customSizeNotice.hidden = !isCustom;
}

function updateInputSizePresetFromValues() {
  const width = String(elements.inputWidthInput.value).trim();
  const height = String(elements.inputHeightInput.value).trim();

  const matchedPreset = Object.entries(INPUT_SIZE_PRESETS).find(
    ([, values]) => String(values.width) === width && String(values.height) === height
  );

  elements.inputSizePresetSelect.value = matchedPreset ? matchedPreset[0] : "custom";
  syncInputSizePreset();
}

function setProgress(progressKey, percent, message) {
  state.progressKey = progressKey;
  const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(percent, 100)) : 0;
  elements.progressBarFill.style.width = `${safePercent}%`;
  elements.progressPercent.textContent = `${safePercent}%`;
  elements.progressLabel.textContent = message || "Ready for conversion";

  elements.stageChips.querySelectorAll(".stage-chip").forEach((chip) => {
    const chipKey = chip.dataset.stageKey;
    chip.classList.toggle("active", chipKey === progressKey);
    chip.classList.toggle("complete", safePercent === 100 || getStageIndex(chipKey) < getStageIndex(progressKey));
  });
}

function getStageIndex(stageKey) {
  return state.progressTemplate.findIndex((stage) => stage.key === stageKey);
}

function renderStageChips() {
  elements.stageChips.innerHTML = "";

  state.progressTemplate.forEach((stage) => {
    if (stage.key === "idle") {
      return;
    }

    const chip = document.createElement("div");
    chip.className = "stage-chip";
    chip.dataset.stageKey = stage.key;
    chip.textContent = stage.label;
    elements.stageChips.appendChild(chip);
  });

  setProgress("idle", 0, "Ready for conversion");
}

function renderRecentList(container, values, onSelect, emptyText) {
  container.innerHTML = "";

  if (values.length === 0) {
    container.className = "recent-list empty-state";
    container.textContent = emptyText;
    return;
  }

  container.className = "recent-list";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-pill";
    button.textContent = value;
    button.title = value;
    button.addEventListener("click", () => onSelect(value));
    container.appendChild(button);
  });
}

function renderRecentModels() {
  renderRecentList(
    elements.recentModels,
    state.recentModels,
    async (filePath) => {
      await setSelectedModel(filePath);
    },
    "No recent model files yet."
  );
}

function renderRecentFolders() {
  renderRecentList(
    elements.recentFolders,
    state.recentFolders,
    (folderPath) => {
      state.selectedOutputFolder = folderPath;
      elements.outputFolderPath.textContent = folderPath;
      updateConvertButtonState();
      appendLog(`Selected output folder: ${folderPath}\n`);
    },
    "No recent output folders yet."
  );
}

async function setSelectedModel(filePath, modelInfo = null) {
  const result = modelInfo
    ? { success: true, modelInfo }
    : await window.converterApi.inspectModelFile({ filePath });

  if (!result.success) {
    setMessage("error", result.error);
    appendLog(`Error: ${result.error}\n`);
    return;
  }

  state.selectedPtFile = result.modelInfo.filePath;
  elements.ptFilePath.textContent = state.selectedPtFile;
  renderModelInfo(result.modelInfo);
  elements.outputNameInput.value = result.modelInfo.defaultOutputName;

  if (!state.selectedOutputFolder) {
    state.selectedOutputFolder = state.selectedPtFile.replace(/[\\/][^\\/]+$/, "");
    elements.outputFolderPath.textContent = state.selectedOutputFolder;
    state.recentFolders = pushRecent(
      RECENT_FOLDERS_KEY,
      state.recentFolders,
      state.selectedOutputFolder
    );
    renderRecentFolders();
    appendLog(`Auto-selected output folder: ${state.selectedOutputFolder}\n`);
  }

  state.recentModels = pushRecent(RECENT_MODELS_KEY, state.recentModels, state.selectedPtFile);
  renderRecentModels();
  appendLog(`Selected input file: ${state.selectedPtFile}\n`);
  setMessage("neutral", "Model ready. Review the output settings and trust warning before converting.");
  updateConvertButtonState();
}

function resetProgress() {
  setProgress("idle", 0, "Ready for conversion");
}

function collectConversionPayload() {
  return {
    inputPath: state.selectedPtFile,
    outputFolder: state.selectedOutputFolder,
    outputName: normalizeOnnxName(elements.outputNameInput.value),
    inputWidth: elements.inputWidthInput.value,
    inputHeight: elements.inputHeightInput.value,
    opsetVersion: elements.opsetVersionInput.value,
    dynamicAxes: elements.dynamicAxesCheckbox.checked,
    allowUnsafeLoad: elements.trustModelCheckbox.checked
  };
}

function renderPythonStatus(status) {
  elements.pythonPackageList.innerHTML = "";

  if (!status.pythonFound) {
    elements.pythonStatusSummary.className = "status-banner error";
    elements.pythonStatusSummary.textContent =
      status.message || "Python 3.11.9 was not detected on this machine.";
    return;
  }

  const packageEntries = Object.entries(status.packages || {});
  const allPackagesValid = packageEntries.every(([, pkg]) => pkg.installed && pkg.matches);

  if (status.matchesRequiredVersion && allPackagesValid) {
    elements.pythonStatusSummary.className = "status-banner success";
    elements.pythonStatusSummary.textContent = `Python ${status.pythonVersion} is ready. Detected backend: ${status.backendLabel}.`;
  } else {
    elements.pythonStatusSummary.className = "status-banner warn";
    elements.pythonStatusSummary.textContent = `Python ${status.pythonVersion || "unknown"} found. Detected backend: ${status.backendLabel}. Some required packages still need attention.`;
  }

  packageEntries.forEach(([packageName, pkg]) => {
    const card = document.createElement("div");
    card.className = `package-card ${pkg.installed && pkg.matches ? "ok" : "warn"}`;

    const versionText = pkg.installed
      ? `${pkg.version || "unknown"}${pkg.matches ? "" : " (unexpected version)"}`
      : pkg.error || "Not installed";

    card.innerHTML = `
      <div>
        <strong>${packageName}</strong>
        <small>${versionText}</small>
      </div>
      <span class="package-state">${pkg.installed && pkg.matches ? "Ready" : "Needs attention"}</span>
    `;

    elements.pythonPackageList.appendChild(card);
  });
}

async function refreshPythonStatus() {
  elements.pythonStatusSummary.className = "status-banner neutral";
  elements.pythonStatusSummary.textContent = "Checking Python 3.11.9 and required packages...";
  elements.pythonPackageList.innerHTML = "";
  const status = await window.converterApi.getPythonStatus();
  renderPythonStatus(status);
}

function handleDroppedFiles(files) {
  if (!files || files.length === 0) {
    setMessage("error", "No files were detected in the drop action.");
    return;
  }

  const firstFile = files[0];
  const candidatePath = window.converterApi.getPathForDroppedFile(firstFile);
  if (!candidatePath) {
    setMessage("error", "This dropped item does not expose a usable local file path.");
    appendLog("Error: Dragged file path could not be resolved.\n");
    return;
  }

  if (!candidatePath.toLowerCase().endsWith(".pt")) {
    setMessage("error", "Please drop a valid .pt file.");
    appendLog(`Error: Rejected dropped file ${candidatePath}\n`);
    return;
  }

  appendLog(`Dropped input file: ${candidatePath}\n`);
  setSelectedModel(candidatePath);
}

window.converterApi.onLog((message) => {
  appendLog(message);
});

window.converterApi.onProgress((payload) => {
  setProgress(payload.key, payload.percent, payload.message);
});

elements.selectPtFileButton.addEventListener("click", async () => {
  const result = await window.converterApi.selectPtFile();
  if (result.canceled) {
    return;
  }

  await setSelectedModel(result.filePath, result.modelInfo);
});

elements.selectOutputFolderButton.addEventListener("click", async () => {
  const result = await window.converterApi.selectOutputFolder();
  if (result.canceled) {
    return;
  }

  state.selectedOutputFolder = result.folderPath;
  elements.outputFolderPath.textContent = state.selectedOutputFolder;
  state.recentFolders = pushRecent(RECENT_FOLDERS_KEY, state.recentFolders, state.selectedOutputFolder);
  renderRecentFolders();
  appendLog(`Selected output folder: ${state.selectedOutputFolder}\n`);
  setMessage("neutral", "Output folder selected.");
  updateConvertButtonState();
});

elements.convertButton.addEventListener("click", async () => {
  clearLog();
  resetProgress();
  setMessage("neutral", "Conversion started.");
  appendLog("Starting conversion...\n");
  elements.convertButton.disabled = true;
  elements.openOutputFolderButton.disabled = true;
  state.lastOutputFile = "";

  try {
    const result = await window.converterApi.convertModel(collectConversionPayload());

    if (result.success) {
      state.lastOutputFile = result.outputFile;
      const successMessage = `Conversion completed successfully. Output file: ${result.outputFile}`;
      appendLog(`${successMessage}\n`);
      setMessage("success", successMessage);
      elements.openOutputFolderButton.disabled = false;
    } else {
      appendLog(`Error: ${result.error}\n`);
      setMessage("error", result.error);
    }
  } catch (error) {
    const message = error?.message || "Unexpected conversion error.";
    appendLog(`Error: ${message}\n`);
    setMessage("error", message);
  } finally {
    updateConvertButtonState();
  }
});

elements.openOutputFolderButton.addEventListener("click", async () => {
  if (!state.lastOutputFile) {
    return;
  }

  const result = await window.converterApi.openOutputLocation({ outputFile: state.lastOutputFile });
  if (!result.success) {
    setMessage("error", result.error);
  }
});

elements.installDependenciesButton.addEventListener("click", async () => {
  const result = await window.converterApi.launchDependencyInstaller();
  if (result.success) {
    setMessage("neutral", result.message);
  } else {
    setMessage("error", result.error);
  }
});

elements.refreshPythonStatusButton.addEventListener("click", async () => {
  await refreshPythonStatus();
});

elements.copyLogButton.addEventListener("click", async () => {
  await window.converterApi.copyText({ text: elements.logArea.textContent });
  setMessage("neutral", "Log copied to clipboard.");
});

elements.clearLogButton.addEventListener("click", () => {
  clearLog();
  setMessage("neutral", "Log cleared.");
});

elements.clearRecentModelsButton.addEventListener("click", () => {
  state.recentModels = [];
  saveRecent(RECENT_MODELS_KEY, state.recentModels);
  renderRecentModels();
});

elements.clearRecentFoldersButton.addEventListener("click", () => {
  state.recentFolders = [];
  saveRecent(RECENT_FOLDERS_KEY, state.recentFolders);
  renderRecentFolders();
});

elements.inputSizePresetSelect.addEventListener("change", () => {
  syncInputSizePreset();
  updateConvertButtonState();
});

["input", "change"].forEach((eventName) => {
  elements.inputWidthInput.addEventListener(eventName, () => {
    updateInputSizePresetFromValues();
    updateConvertButtonState();
  });

  elements.inputHeightInput.addEventListener(eventName, () => {
    updateInputSizePresetFromValues();
    updateConvertButtonState();
  });
});

[
  elements.outputNameInput,
  elements.opsetVersionInput,
  elements.dynamicAxesCheckbox,
  elements.trustModelCheckbox
].forEach((element) => {
  element.addEventListener("input", updateConvertButtonState);
  element.addEventListener("change", updateConvertButtonState);
});

["dragenter", "dragover"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
});

["dragleave", "dragend", "drop"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
  });
});

elements.dropZone.addEventListener("drop", (event) => {
  handleDroppedFiles(event.dataTransfer.files);
});

["dragenter", "dragover", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});

window.addEventListener("drop", (event) => {
  const droppedInsideZone = elements.dropZone.contains(event.target);
  if (!droppedInsideZone) {
    handleDroppedFiles(event.dataTransfer.files);
  }
});

elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.selectPtFileButton.click();
  }
});

Promise.all([window.converterApi.getProgressTemplate(), refreshPythonStatus()]).then(([progressTemplate]) => {
  state.progressTemplate = progressTemplate;
  renderStageChips();
  renderRecentModels();
  renderRecentFolders();
  renderModelInfo(null);
  updateInputSizePresetFromValues();
  updateConvertButtonState();
});
