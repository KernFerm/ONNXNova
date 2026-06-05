const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("converterApi", {
  selectPtFile: () => ipcRenderer.invoke("select-pt-file"),
  selectOutputFolder: () => ipcRenderer.invoke("select-output-folder"),
  inspectModelFile: (payload) => ipcRenderer.invoke("inspect-model-file", payload),
  convertModel: (payload) => ipcRenderer.invoke("convert-model", payload),
  getPythonStatus: () => ipcRenderer.invoke("get-python-status"),
  launchDependencyInstaller: () => ipcRenderer.invoke("launch-dependency-installer"),
  openOutputLocation: (payload) => ipcRenderer.invoke("open-output-location", payload),
  copyText: (payload) => ipcRenderer.invoke("copy-text", payload),
  getProgressTemplate: () => ipcRenderer.invoke("get-progress-template"),
  getPathForDroppedFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (_error) {
      return "";
    }
  },
  onLog: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("conversion-log", listener);
    return () => ipcRenderer.removeListener("conversion-log", listener);
  },
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("conversion-progress", listener);
    return () => ipcRenderer.removeListener("conversion-progress", listener);
  }
});
