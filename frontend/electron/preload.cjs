
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('nexusDesktop', {
  isDesktop: true,
})
