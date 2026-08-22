import React, { useState, useEffect } from 'react'
import { X, DollarSign, RotateCcw, Check, ShieldAlert } from 'lucide-react'
import { DEFAULT_GCS_RATES, RateCard } from '../../types/cost'
import { usePersistentStore } from '../../store/persistentStore'
import { useToastStore } from '../../store/toastStore'

export interface PricingSettingsModalShellProps {
  isOpen: boolean
  onClose: () => void
}

export const PricingSettingsModalShell: React.FC<PricingSettingsModalShellProps> = ({
  isOpen,
  onClose,
}) => {
  const { customPricing, isFreeTrialAccount, setCustomPricing, setFreeTrialAccount } =
    usePersistentStore()
  const { addToast } = useToastStore()

  const [rates, setRates] = useState<RateCard>({
    archiveRetrievalPerGB: customPricing.archiveRetrievalPerGB ?? DEFAULT_GCS_RATES.archiveRetrievalPerGB,
    coldlineRetrievalPerGB: customPricing.coldlineRetrievalPerGB ?? DEFAULT_GCS_RATES.coldlineRetrievalPerGB,
    nearlineRetrievalPerGB: customPricing.nearlineRetrievalPerGB ?? DEFAULT_GCS_RATES.nearlineRetrievalPerGB,
    standardRetrievalPerGB: customPricing.standardRetrievalPerGB ?? DEFAULT_GCS_RATES.standardRetrievalPerGB,
    internetEgressPerGB: customPricing.internetEgressPerGB ?? DEFAULT_GCS_RATES.internetEgressPerGB,
  })

  const [freeTrial, setFreeTrial] = useState<boolean>(isFreeTrialAccount)

  useEffect(() => {
    if (isOpen) {
      setRates({
        archiveRetrievalPerGB: customPricing.archiveRetrievalPerGB ?? DEFAULT_GCS_RATES.archiveRetrievalPerGB,
        coldlineRetrievalPerGB: customPricing.coldlineRetrievalPerGB ?? DEFAULT_GCS_RATES.coldlineRetrievalPerGB,
        nearlineRetrievalPerGB: customPricing.nearlineRetrievalPerGB ?? DEFAULT_GCS_RATES.nearlineRetrievalPerGB,
        standardRetrievalPerGB: customPricing.standardRetrievalPerGB ?? DEFAULT_GCS_RATES.standardRetrievalPerGB,
        internetEgressPerGB: customPricing.internetEgressPerGB ?? DEFAULT_GCS_RATES.internetEgressPerGB,
      })
      setFreeTrial(isFreeTrialAccount)
    }
  }, [isOpen, customPricing, isFreeTrialAccount])

  if (!isOpen) return null

  const handleSave = () => {
    setCustomPricing(rates)
    setFreeTrialAccount(freeTrial)
    addToast({
      type: 'success',
      title: 'Rate Card Updated',
      message: 'Custom pricing settings applied to all cost calculations.',
    })
    onClose()
  }

  const handleReset = () => {
    setRates({ ...DEFAULT_GCS_RATES })
    setFreeTrial(false)
    setCustomPricing({})
    setFreeTrialAccount(false)
    addToast({
      type: 'info',
      title: 'Rates Reset',
      message: 'Restored standard Google Cloud Storage pricing rates.',
    })
  }

  const isCustomized =
    rates.archiveRetrievalPerGB !== DEFAULT_GCS_RATES.archiveRetrievalPerGB ||
    rates.coldlineRetrievalPerGB !== DEFAULT_GCS_RATES.coldlineRetrievalPerGB ||
    rates.nearlineRetrievalPerGB !== DEFAULT_GCS_RATES.nearlineRetrievalPerGB ||
    rates.standardRetrievalPerGB !== DEFAULT_GCS_RATES.standardRetrievalPerGB ||
    rates.internetEgressPerGB !== DEFAULT_GCS_RATES.internetEgressPerGB

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 id="pricing-settings-title" className="text-base font-bold text-white">
                GCS Rate Card & Pricing Overrides
              </h3>
              <p className="text-xs text-slate-400">
                Configure custom contract rates for retrieval and egress.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pricing settings"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {isCustomized && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-2.5 text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                Custom pricing overrides are active. Estimated costs reflect negotiated contract rates instead of default GCP list prices.
              </span>
            </div>
          )}

          {/* Rate Card Inputs */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
              Retrieval Rates ($ / GB)
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Archive Retrieval</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={rates.archiveRetrievalPerGB}
                    onChange={(e) =>
                      setRates({ ...rates, archiveRetrievalPerGB: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 font-mono text-white focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-slate-500">Default: $0.05 / GB</span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Coldline Retrieval</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={rates.coldlineRetrievalPerGB}
                    onChange={(e) =>
                      setRates({ ...rates, coldlineRetrievalPerGB: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 font-mono text-white focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-slate-500">Default: $0.02 / GB</span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Nearline Retrieval</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={rates.nearlineRetrievalPerGB}
                    onChange={(e) =>
                      setRates({ ...rates, nearlineRetrievalPerGB: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 font-mono text-white focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-slate-500">Default: $0.01 / GB</span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Standard Retrieval</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={rates.standardRetrievalPerGB}
                    onChange={(e) =>
                      setRates({ ...rates, standardRetrievalPerGB: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 font-mono text-white focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-slate-500">Default: $0.00 / GB</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
              Internet Egress Rate ($ / GB)
            </h4>
            <div className="max-w-[200px]">
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500 font-mono">$</span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={rates.internetEgressPerGB}
                  onChange={(e) =>
                    setRates({ ...rates, internetEgressPerGB: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 font-mono text-white focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-500">Default: $0.12 / GB</span>
            </div>
          </div>

          {/* Free Trial Toggle */}
          <div className="pt-3 border-t border-slate-800">
            <label className="flex items-center space-x-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={freeTrial}
                onChange={(e) => setFreeTrial(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer"
              />
              <div className="flex-1">
                <span className="font-semibold text-slate-200 block">
                  Account Has Active $300 GCP Free Trial Credit
                </span>
                <span className="text-[11px] text-slate-400">
                  When enabled, banners indicate fees will be absorbed by your Free Trial promotional credit balance.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Standard</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Rates</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
