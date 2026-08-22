import React, { useState, useRef, useEffect } from 'react'
import {
  Lock,
  ChevronDown,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Plus,
  ExternalLink,
} from 'lucide-react'
import { usePersistentStore } from '../../store/persistentStore'
import { useRuntimeStore } from '../../store/runtimeStore'
import { useToastStore } from '../../store/toastStore'
import { gcpProjectService } from '../../services/gcpProjectService'
import { GCPProject } from '../../types'

interface ProjectSwitcherPopoverProps {
  onProjectSwitch: (newProjectId: string) => void
}

export const ProjectSwitcherPopover: React.FC<ProjectSwitcherPopoverProps> = ({
  onProjectSwitch,
}) => {
  const { savedProjectId, setSavedProjectId } = usePersistentStore()
  const { isDemoMode, oauthToken } = useRuntimeStore()
  const { addToast } = useToastStore()

  const [isOpen, setIsOpen] = useState(false)
  const [projects, setProjects] = useState<GCPProject[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [manualProjectId, setManualProjectId] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const popoverRef = useRef<HTMLDivElement>(null)

  // Fetch projects on popover open
  useEffect(() => {
    if (isOpen && oauthToken && !isDemoMode) {
      setIsLoadingProjects(true)
      gcpProjectService
        .listProjects(oauthToken)
        .then((res: GCPProject[]) => setProjects(res))
        .catch(() => setProjects([]))
        .finally(() => setIsLoadingProjects(false))
    } else if (isDemoMode) {
      setProjects([
        {
          projectId: 'demo-client-media-2026',
          name: 'Demo Client Production Media',
          projectNumber: '1029384756',
          lifecycleState: 'ACTIVE',
        },
        {
          projectId: 'avatar-vfx-vault-2026',
          name: 'Avatar VFX Post Studio',
          projectNumber: '9847561029',
          lifecycleState: 'ACTIVE',
        },
      ])
    }
  }, [isOpen, oauthToken, isDemoMode])

  // Close on outside click or Escape
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleDocumentClick)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const validateProjectId = (id: string): boolean => {
    const clean = id.trim()
    if (!clean) {
      setValidationError('Project ID cannot be empty.')
      return false
    }
    if (clean.length < 6 || clean.length > 30) {
      setValidationError('Project ID must be between 6 and 30 characters.')
      return false
    }
    if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(clean)) {
      setValidationError(
        'Project ID must start with a lowercase letter and contain only lowercase letters, digits, and hyphens.',
      )
      return false
    }
    setValidationError(null)
    return true
  }

  const handleSelectProject = (projectId: string) => {
    setSavedProjectId(projectId)
    onProjectSwitch(projectId)
    setIsOpen(false)
    setManualProjectId('')
    addToast({
      type: 'success',
      title: 'Billed GCP Project Updated',
      message: `Requester-Pays attribution switched to: ${projectId}`,
    })
  }

  const activeDisplayProject = isDemoMode
    ? 'demo-client-media-2026'
    : savedProjectId || 'Unconfigured'

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Switch Billed GCP Project"
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-amber-500/40 text-slate-300 hover:text-white transition-all cursor-pointer text-xs"
      >
        <Lock className="w-3.5 h-3.5 text-amber-400" />
        <span className="hidden sm:inline text-slate-400">Billed to:</span>
        <span className="font-mono font-medium text-emerald-400 max-w-[140px] truncate">
          {activeDisplayProject}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-amber-400' : ''
          }`}
        />
      </button>

      {/* Popover Dropdown Sheet */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Billed Project Switcher Menu"
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl shadow-slate-950/90 z-50 p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Billed GCP Project Switcher
              </span>
            </div>
            {isLoadingProjects && (
              <span className="text-[11px] font-mono text-cyan-400 flex items-center space-x-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Scanning CRM...</span>
              </span>
            )}
          </div>

          {/* Currently Billed Project */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-400">
              Active Billing Project:
            </span>
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="font-mono text-xs text-emerald-300 truncate">
                  {activeDisplayProject}
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                Billed
              </span>
            </div>
          </div>

          {/* Discovered Projects List */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400">
              Discovered GCP Projects:
            </span>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {projects.map((project) => {
                const isActive = project.projectId === activeDisplayProject
                return (
                  <div
                    key={project.projectId}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition-colors ${
                      isActive
                        ? 'bg-slate-800/40 border border-slate-800'
                        : 'bg-slate-950/40 hover:bg-slate-800/80 border border-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-white truncate text-[11px]">
                        {project.name}
                      </div>
                      <div className="font-mono text-slate-400 text-[10px] truncate">
                        {project.projectId}
                      </div>
                    </div>

                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => handleSelectProject(project.projectId)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-[11px] font-semibold transition-all cursor-pointer flex-shrink-0"
                      >
                        Select
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono text-emerald-400 font-semibold flex-shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                )
              })}

              {projects.length === 0 && !isLoadingProjects && (
                <p className="text-xs text-slate-500 font-mono py-2 text-center">
                  No projects discovered. Enter project ID below.
                </p>
              )}
            </div>
          </div>

          {/* Manual Project ID Input Form */}
          <div className="space-y-2 pt-1 border-t border-slate-800">
            <label className="block text-[11px] font-semibold text-slate-400">
              Manual Project ID Override:
            </label>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={manualProjectId}
                  onChange={(e) => {
                    setManualProjectId(e.target.value)
                    if (validationError) validateProjectId(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (validateProjectId(manualProjectId)) {
                        handleSelectProject(manualProjectId.trim())
                      }
                    }
                  }}
                  placeholder="e.g. corporate-media-prod-2026"
                  className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none ${
                    validationError
                      ? 'border-rose-500 focus:border-rose-400'
                      : 'border-slate-700 focus:border-amber-400'
                  }`}
                />
              </div>

              <button
                type="button"
                disabled={!manualProjectId.trim()}
                onClick={() => {
                  if (validateProjectId(manualProjectId)) {
                    handleSelectProject(manualProjectId.trim())
                  }
                }}
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-950/40 disabled:opacity-50 cursor-pointer flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Apply</span>
              </button>
            </div>

            {validationError && (
              <div className="text-[11px] text-rose-400 flex items-center space-x-1 pt-0.5">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
          </div>

          {/* External Console Link */}
          <div className="pt-2 border-t border-slate-800">
            <a
              href={`https://console.cloud.google.com/billing?project=${activeDisplayProject}`}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all"
            >
              <span>Manage Billing in Google Cloud Console</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
