import React from 'react'
import {
  HardDrive,
  Lock,
  Sparkles,
  User,
  LogOut,
  Moon,
  Sun,
  Activity,
  ShieldCheck,
  Layers,
} from 'lucide-react'
import { useRuntimeStore } from '../../store/runtimeStore'
import { usePersistentStore } from '../../store/persistentStore'
import { useToastStore } from '../../store/toastStore'
import { gisAuthService } from '../../services/gisAuthService'

interface HeaderProps {
  onOpenOnboarding: () => void
  onOpenDiagnostics: () => void
}

export const Header: React.FC<HeaderProps> = ({
  onOpenOnboarding,
  onOpenDiagnostics,
}) => {
  const {
    oauthToken,
    userEmail,
    userName,
    userAvatar,
    isDemoMode,
    setDemoMode,
  } = useRuntimeStore()

  const { savedProjectId, savedBucketName, theme, setTheme } = usePersistentStore()
  const { addToast } = useToastStore()

  const handleToggleDemo = () => {
    const newDemo = !isDemoMode
    setDemoMode(newDemo)
    addToast({
      type: 'info',
      title: newDemo ? 'Demo Sandbox Active' : 'Live GCS Mode Active',
      message: newDemo
        ? 'Using synthetic GCS bucket and simulated transfer pipes.'
        : 'Connecting directly to Google Cloud Storage endpoints.',
    })
  }

  const handleToggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const handleSignOut = async () => {
    await gisAuthService.signOut()
    addToast({
      type: 'info',
      title: 'Session Disconnected',
      message: 'Volatile authentication tokens have been purged from memory.',
    })
  }

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Version */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-950/50 border border-emerald-400/30">
            <HardDrive className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-tight text-white text-base sm:text-lg">
                Files of Ba Sing Se
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v0.2.0-alpha
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Zero-Host-Liability GCS Requester-Pays Media Portal
            </p>
          </div>
        </div>

        {/* Active Context Badges */}
        <div className="hidden lg:flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-[11px]">
              {savedBucketName || 'gs://partner-raw-master-archives-2026'}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Billed to:</span>
            <span className="font-mono font-medium text-emerald-400">
              {savedProjectId || 'demo-client-media-2026'}
            </span>
          </div>
        </div>

        {/* Action Controls & Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Demo Sandbox Mode Switcher */}
          <button
            onClick={handleToggleDemo}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              isDemoMode
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="Toggle between Synthetic Demo Mode and Live GCP Mode"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isDemoMode ? 'Demo Sandbox' : 'Live GCS'}</span>
          </button>

          {/* Diagnostics Button */}
          <button
            onClick={onOpenDiagnostics}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Open Diagnostic Logs & System Health"
            aria-label="Diagnostic Logs"
          >
            <Activity className="w-4 h-4 text-cyan-400" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={handleToggleTheme}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Toggle theme"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-cyan-400" />
            )}
          </button>

          {/* Google Auth / Profile Button */}
          {oauthToken || isDemoMode ? (
            <div className="flex items-center space-x-2 pl-1 sm:pl-2 border-l border-slate-800">
              <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userName || 'User avatar'}
                    className="w-6 h-6 rounded-full border border-emerald-400/40 object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-xs font-bold text-emerald-300">
                    {userName ? userName.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-medium text-white leading-tight">
                    {userName || (isDemoMode ? 'Taylor (Colorist)' : 'Google User')}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[110px]">
                    {userEmail || (isDemoMode ? 'taylor@freelance-edit.com' : 'user@google.com')}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-500/50 text-slate-400 hover:text-rose-300 transition-colors"
                title="Disconnect & Flush Session Memory"
                aria-label="Disconnect Session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenOnboarding}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-cyan-950/40"
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
