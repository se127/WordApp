import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('WordApp', {
  platform: process.platform,
})
