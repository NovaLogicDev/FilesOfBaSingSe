import React from 'react'
import {
  HardDrive,
  User,
  LogOut,
  Moon,
  Sun,
  Laptop,
  Activity,
  ShieldCheck,
  DollarSign,
} from 'lucide-react'
import { useRuntimeStore } from '../../store/runtimeStore'
import { usePersistentStore } from '../../store/persistentStore'
import { useToastStore } from '../../store/toastStore'
import { SessionLifecycleEngine } from '../../engines/sessionLifecycleEngine'
import { BucketSwitcherPopover } from '../navigation/BucketSwitcherPopover'
import { ProjectSwitcherPopover } from '../navigation/ProjectSwitcherPopover'

interface HeaderProps {
  onOpenOnboarding: () => void
  onOpenDiagnostics: () => void
  onOpenPricingSettings: () => void
  onOpenGcpConfig: () => void
  onBucketSwitch: (newBucket: string) => void
  onProjectSwitch: (newProjectId: string) => void
}

export const Header: React.FC<HeaderProps> = ({
  onOpenOnboarding,
  onOpenDiagnostics,
  onOpenPricingSettings,
  onOpenGcpConfig,
  onBucketSwitch,
  onProjectSwitch,
}) => {
  const {
    oauthToken,
    userEmail,
    userName,
    userAvatar,
  } = useRuntimeStore()

  const { theme, setTheme, setSavedProjectId, setSavedBucketName } = usePersistentStore()
  const { addToast } = useToastStore()

  const handleToggleTheme = () => {
    // Cycle: dark -> light -> system -> dark
    let nextTheme: 'dark' | 'light' | 'system' = 'light'
    if (theme === 'dark') nextTheme = 'light'
    else if (theme === 'light') nextTheme = 'system'
    else nextTheme = 'dark'

    setTheme(nextTheme)
  }

  const handleSignOut = async () => {
    await SessionLifecycleEngine.purgeSession()
    setSavedProjectId('')
    setSavedBucketName('')
    addToast({
      type: 'info',
      title: 'Session Disconnected',
      message: 'Volatile authentication tokens and active project contexts have been purged from memory.',
    })
  }

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Version */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/10 dark:shadow-emerald-950/50 border border-emerald-400/30">
            <HardDrive className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold leading-tight tracking-tight text-slate-900 dark:text-white whitespace-nowrap text-base sm:text-lg">
                Files of Ba Sing Se
              </span>
              <span className="whitespace-nowrap px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 leading-none">
                v0.2.0-alpha
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              Requester-Pays File Distribution Portal
            </p>
          </div>
        </div>
        <div className="flex p-1">&nbsp;</div>

        {/* Active Context Badges & Interactive Switchers */}
        {oauthToken ? (
          <div className="hidden lg:flex items-center space-x-3 text-xs p-2">
            <BucketSwitcherPopover
              onBucketSwitch={onBucketSwitch}
              onOpenWizard={onOpenOnboarding}
              variant="badge"
            />

            <ProjectSwitcherPopover onProjectSwitch={onProjectSwitch} />
          </div>
        ) : (
          <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600 inline-block" />
            <span>GCS Disconnected &bull; Ready for Setup</span>
          </div>
        )}

        {/* Action Controls & Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Unified GCP Configuration Center Button */}
          <button
            onClick={onOpenGcpConfig}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            title="Inspect Google Cloud Platform Configuration & Health (Ctrl+G)"
            aria-label="GCP Configuration Center"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </button>

          {/* Pricing Settings Button */}
          <button
            onClick={onOpenPricingSettings}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            title="Configure GCS Rate Card & Pricing Overrides"
            aria-label="Pricing Settings"
          >
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </button>

          {/* Diagnostics Button */}
          <button
            onClick={onOpenDiagnostics}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            title="Open Diagnostic Logs & System Health"
            aria-label="Diagnostic Logs"
          >
            <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={handleToggleTheme}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            title={
              theme === 'dark'
                ? 'Current theme: dark (Click for light)'
                : theme === 'light'
                ? 'Current theme: light (Click for system)'
                : 'Current theme: system (Click for dark)'
            }
            aria-label={`Toggle Theme (Current: ${theme})`}
          >
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            ) : theme === 'light' ? (
              <Sun className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            ) : (
              <Laptop className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
          </button>

          {/* Google Auth / Profile Button */}
          {oauthToken ? (
            <div className="flex items-center space-x-2 pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userName || 'User avatar'}
                    className="w-6 h-6 rounded-full border border-emerald-500/40 dark:border-emerald-400/40 object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 dark:border-emerald-400/40 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {userName ? userName.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-medium text-slate-900 dark:text-white leading-tight">
                    {userName || 'Google User'}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[110px]">
                    {userEmail || 'user@google.com'}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="p-2 rounded-lg bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-500/50 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 transition-colors cursor-pointer"
                title="Disconnect & Flush Session Memory"
                aria-label="Disconnect Session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenOnboarding}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-cyan-500/10 dark:shadow-cyan-950/40 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Connect GCS</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

