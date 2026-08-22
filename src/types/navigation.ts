/**
 * Navigation & Browser History API Types (Module 11 / Engine 9)
 */

export interface NavigationHistoryState {
  bucket: string
  prefix: string
  timestamp: number
  source: 'user_interaction' | 'deep_link' | 'popstate' | 'bucket_switch'
}

export interface ParsedRoute {
  view: 'browse' | 'onboarding' | 'config' | 'root'
  bucket: string
  prefix: string
  isValid: boolean
}

export interface NavigateOptions {
  replace?: boolean
  source?: NavigationHistoryState['source']
}
