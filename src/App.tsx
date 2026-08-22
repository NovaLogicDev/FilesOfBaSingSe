import { useState } from 'react'
import {
  ShieldCheck,
  Zap,
  HardDrive,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  ArrowRight,
  Terminal,
  Activity,
  ServerOff,
  Cloud,
} from 'lucide-react'

export function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'increments'>('overview')

  const capabilities = [
    {
      icon: <ServerOff className="w-5 h-5 text-emerald-400" />,
      title: 'Zero-Host Liability',
      badge: 'Zero-Backend',
      description:
        'All transfer & egress costs route directly to the client GCP billing account via userProject. Host pays $0.00 in egress.',
    },
    {
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      title: 'Constant Memory Streaming',
      badge: '< 15MB RAM',
      description:
        'Memory-bounded 4MB micro-chunk pipe via File System Access API. Handles 50GB+ raw footage archives with zero RAM bloat.',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-cyan-400" />,
      title: 'On-the-Fly Cryptography',
      badge: 'CRC32c / MD5',
      description:
        'Running hardware-accelerated Castagnoli CRC32c verification during download stream with bit-level integrity certification.',
    },
    {
      icon: <Cloud className="w-5 h-5 text-indigo-400" />,
      title: 'Frictionless Onboarding',
      badge: 'Auto-Discovery',
      description:
        'Automated GCP project discovery, 1-click project auto-creation, and $300 Free Trial helper for non-technical editors.',
    },
  ]

  const increments = [
    {
      num: '01',
      title: 'Git Setup & Project Scaffolding',
      status: 'In Progress (Active)',
      color: 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300',
      items: ['Git repository init', 'React 19 + TypeScript + Vite 6', 'Tailwind CSS v4 + Lucide Icons', 'Visual dev server verification'],
    },
    {
      num: '02',
      title: 'Auth & Project Discovery Engine',
      status: 'Next Up',
      color: 'border-slate-800 bg-slate-900/50 text-slate-400',
      items: ['Google Identity Services OAuth 2.0', 'Volatile Zustand token store', 'CRM API project auto-discovery', 'Free Trial guidance card'],
    },
    {
      num: '03',
      title: 'GCS Explorer & Cost Calculator',
      status: 'Planned',
      color: 'border-slate-800 bg-slate-900/50 text-slate-400',
      items: ['GCS JSON REST API v1 client', 'Virtualized file grid (10k items)', 'Archive/Coldline cost calculator', 'Preflight connection diagnostics'],
    },
    {
      num: '04',
      title: 'Streaming Engine & Asset Inspector',
      status: 'Planned',
      color: 'border-slate-800 bg-slate-900/50 text-slate-400',
      items: ['File System Access API 4MB pipe', 'Real-time CRC32c hashing engine', 'Inspector slide-out drawer', '1-Click CLI command generator'],
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950 font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-950/50 border border-emerald-400/30">
              <HardDrive className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-white text-lg">Files of Ba Sing Se</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  v0.1.0-alpha
                </span>
              </div>
              <p className="text-xs text-slate-400">GCS Requester-Pays Media Distribution Portal</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Dev Server Active (Port 5173)</span>
            </div>
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Requester-Pays Enforced</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 via-slate-900/40 to-slate-950 p-8 sm:p-10 mb-8 shadow-2xl">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-1/3 -mb-12 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-400 mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Work Increment 1 &bull; Baseline Scaffolding Verified</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight mb-4">
              Direct-to-Browser GCS Media Streaming for Video Creators
            </h1>
            <p className="text-base sm:text-lg text-slate-300 mb-6 leading-relaxed">
              Eliminate host egress liabilities. Stream multi-gigabyte camera masters, ProRes archives, and VFX stems directly from Google Cloud Storage to local disk with constant memory consumption and real-time cryptographic verification.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'overview'
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                Core Architecture
              </button>
              <button
                onClick={() => setActiveTab('increments')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'increments'
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                Implementation Roadmap
              </button>
            </div>
          </div>
        </div>

        {/* Tab 1: System Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Tech Stack Diagnostics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>UI Framework</span>
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-lg font-bold text-white">React 19</div>
                <div className="text-xs text-emerald-400 mt-1 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Strict Concurrent Mode</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Build Tool</span>
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-lg font-bold text-white">Vite 6</div>
                <div className="text-xs text-cyan-400 mt-1 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Sub-second HMR</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Type System</span>
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg font-bold text-white">TypeScript 5.7</div>
                <div className="text-xs text-amber-400 mt-1 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Strict Type Checking</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Design System</span>
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="text-lg font-bold text-white">Tailwind CSS v4</div>
                <div className="text-xs text-teal-400 mt-1 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Modern CSS Engine</span>
                </div>
              </div>
            </div>

            {/* Architectural Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {capabilities.map((cap, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 hover:border-slate-700 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700/50 group-hover:border-emerald-500/40 transition-colors">
                      {cap.icon}
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
                      {cap.badge}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{cap.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{cap.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Increments */}
        {activeTab === 'increments' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {increments.map((inc, idx) => (
              <div
                key={idx}
                className={`rounded-xl border p-6 transition-all ${inc.color}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-black font-mono tracking-tight">{inc.num}</span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full border border-current">
                    {inc.status}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-3">{inc.title}</h3>
                <ul className="space-y-2 text-xs">
                  {inc.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-center space-x-2">
                      <ArrowRight className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center space-x-2">
            <span>Files of Ba Sing Se</span>
            <span>&bull;</span>
            <span>Zero-Backend GCS Portal</span>
          </div>
          <div>React 19 &bull; TypeScript &bull; Vite &bull; Tailwind CSS</div>
        </div>
      </footer>
    </div>
  )
}

export default App
