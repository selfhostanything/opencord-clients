import { contextBridge } from 'electron'

import { desktopRuntimeInfo } from './config'

contextBridge.exposeInMainWorld('openCordDesktop', desktopRuntimeInfo())
