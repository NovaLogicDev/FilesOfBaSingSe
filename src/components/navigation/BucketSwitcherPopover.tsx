import React, { useState, useRef, useEffect } from 'react'
import {
  Layers,
  ChevronDown,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FolderLock,
  Plus,
} from 'lucide-react'
import { usePersistentStore } from '../../store/persistentStore'
import { useRuntimeStore } from '../../store/runtimeStore'
import { useToastStore } from '../../store/toastStore'
import { gcsClientService } from '../../services/gcsClientService'

interface BucketSwitcherPopoverProps {
  onBucketSwitch: (newBucket: string) => void
  onOpenWizard: () => void
  variant?: 'badge' | 'breadcrumb'
}

export const BucketSwitcherPopover: React.FC<BucketSwitcherPopoverProps> = ({
  onBucketSwitch,
  onOpenWizard,
  variant = 'badge',
}) => {
  const { savedBucketName, recentBuckets, addRecentBucket, savedProjectId } = usePersistentStore()
  const { isDemoMode, oauthToken } = useRuntimeStore()
  const { addToast } = useToastStore()

  const [isOpen, setIsOpen] = useState(false)
  const [newBucketInput, setNewBucketInput] = useState('')
  const [isSwitching, setIsSwitching] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click or Escape
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

  const validateBucketSyntax = (input: string): boolean => {
    const clean = gcsClientService.cleanBucketName(input)
    if (!clean) {
      setValidationError('Bucket name cannot be empty.')
      return false
    }
    if (clean.length < 3 || clean.length > 63) {
      setValidationError('Bucket name must be between 3 and 63 characters.')
      return false
    }
    if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(clean)) {
      setValidationError(
        'Bucket name must contain only lowercase letters, numbers, hyphens, underscores, or dots.',
      )
      return false
    }
    setValidationError(null)
    return true
  }

  const handleSwitchBucket = async (targetBucket: string) => {
    const cleanBucket = gcsClientService.cleanBucketName(targetBucket)
    if (!cleanBucket) return

    setIsSwitching(true)
    try {
      if (!isDemoMode && oauthToken && savedProjectId) {
        // Run on-the-fly preflight handshake
        const preflight = await gcsClientService.run4PointPreflight(
          oauthToken,
          cleanBucket,
          savedProjectId,
        )

        if (!preflight.bucketReachable || !preflight.iamViewerGranted) {
          addToast({
            type: 'warning',
            title: 'Preflight Warning on Target Bucket',
            message:
              preflight.errorMessage ||
              `Unable to verify read access on gs://${cleanBucket}. Check bucket IAM permissions.`,
          })
        }
      }

      addRecentBucket(`gs://${cleanBucket}`)
      onBucketSwitch(`gs://${cleanBucket}`)
      setIsOpen(false)
      setNewBucketInput('')
      addToast({
        type: 'success',
        title: 'Active Bucket Switched',
        message: `Switched target workspace to gs://${cleanBucket}`,
      })
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Bucket Switch Error',
        message: err.message,
      })
    } finally {
      setIsSwitching(false)
    }
  }

  const activeDisplayBucket = isDemoMode
    ? 'gs://partner-raw-master-archives-2026'
    : savedBucketName || 'No Bucket Connected'

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Trigger Button */}
      {variant === 'badge' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label="Switch Active Target Bucket"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-emerald-500/40 text-slate-300 hover:text-white transition-all cursor-pointer text-xs"
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-mono text-[11px] max-w-[200px] truncate">
            {activeDisplayBucket}
          </span>
          <ChevronDown
            className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-emerald-400' : ''
            }`}
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label="Switch Active Target Bucket"
          className="text-slate-400 hover:text-emerald-400 font-mono flex items-center space-x-1 transition-colors cursor-pointer group"
        >
          <span>gs://</span>
          <span className="underline decoration-slate-700 group-hover:decoration-emerald-400 underline-offset-4">
            {gcsClientService.cleanBucketName(activeDisplayBucket)}
          </span>
          <ChevronDown
            className={`w-3 h-3 text-slate-500 group-hover:text-emerald-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-emerald-400' : ''
            }`}
          />
        </button>
      )}

      {/* Popover Dropdown Sheet */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Bucket Switcher Menu"
          className="absolute left-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl shadow-slate-950/90 z-50 p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Target GCS Bucket Switcher
              </span>
            </div>
            {isDemoMode && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Sandbox
              </span>
            )}
          </div>

          {/* Currently Connected Bucket */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-400">Currently Active:</span>
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="font-mono text-xs text-emerald-300 truncate">
                  {activeDisplayBucket}
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                Active
              </span>
            </div>
          </div>

          {/* Recent Buckets List */}
          {recentBuckets.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400">Recent Buckets:</span>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {recentBuckets.map((bucket) => {
                  const isActive =
                    gcsClientService.cleanBucketName(bucket) ===
                    gcsClientService.cleanBucketName(activeDisplayBucket)
                  return (
                    <div
                      key={bucket}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono transition-colors ${
                        isActive
                          ? 'bg-slate-800/40 text-slate-400 border border-slate-800'
                          : 'bg-slate-950/40 hover:bg-slate-800/80 text-slate-200 border border-slate-800/60'
                      }`}
                    >
                      <span className="truncate max-w-[200px] text-[11px]">{bucket}</span>
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => handleSwitchBucket(bucket)}
                          disabled={isSwitching}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-[11px] font-sans font-semibold transition-all cursor-pointer disabled:opacity-50"
                        >
                          Switch
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Connect Another Bucket Inline Form */}
          <div className="space-y-2 pt-1 border-t border-slate-800">
            <label className="block text-[11px] font-semibold text-slate-400">
              Connect Another Bucket:
            </label>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={newBucketInput}
                  onChange={(e) => {
                    setNewBucketInput(e.target.value)
                    if (validationError) validateBucketSyntax(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (validateBucketSyntax(newBucketInput)) {
                        handleSwitchBucket(newBucketInput)
                      }
                    }
                  }}
                  placeholder="gs://your-bucket-name"
                  className={`w-full bg-slate-950 border rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none ${
                    validationError
                      ? 'border-rose-500 focus:border-rose-400'
                      : 'border-slate-700 focus:border-emerald-400'
                  }`}
                />
              </div>

              <button
                type="button"
                disabled={isSwitching || !newBucketInput.trim()}
                onClick={() => {
                  if (validateBucketSyntax(newBucketInput)) {
                    handleSwitchBucket(newBucketInput)
                  }
                }}
                className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-950/40 disabled:opacity-50 cursor-pointer flex items-center space-x-1"
              >
                {isSwitching ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Connect</span>
              </button>
            </div>

            {validationError && (
              <div className="text-[11px] text-rose-400 flex items-center space-x-1 pt-0.5">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
          </div>

          {/* Full Onboarding Wizard Link */}
          <div className="pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                onOpenWizard()
              }}
              className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
            >
              <FolderLock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Launch Full Preflight Wizard for New Bucket</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
