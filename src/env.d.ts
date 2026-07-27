/// <reference types="vite/client" />
import type { ElectronAPI } from '../electron/preload'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}
