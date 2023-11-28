const { ipcRenderer, contextBridge } = require('electron');

const os = require('os');
const getmac = require('getmac')
const { machineIdSync } = require('node-machine-id');
const deviceId = machineIdSync()
const hostname = os.hostname();
const macId = getmac.default()

contextBridge.exposeInMainWorld(
    'restrict', {
    closeApplication: () => {
        ipcRenderer.send("send-alert", "close-application")
    }
}
);

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('deviceId').value = deviceId;
    document.getElementById('hostname').value = hostname;
    document.getElementById('macId').value = macId;
})