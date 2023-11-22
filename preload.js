const { ipcRenderer, contextBridge } = require("electron");

contextBridge.exposeInMainWorld('electronAPI', {
    loadObjFiles: async (directory) => ipcRenderer.invoke('load-obj-files', directory),
    invoke: async (channel, ...args) => await ipcRenderer.invoke(channel, ...args)
});

window.ipcRenderer = ipcRenderer;
