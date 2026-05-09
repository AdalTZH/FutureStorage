'use client';

import { TrustCard } from './TrustCard';

export function HostCard({ host, onBook, expanded = false }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 font-bold">
              {host.name?.[0]}
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">{host.name}</p>
              <p className="text-xs text-slate-500">{host.address}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sky-600">S${host.pricePerMonth}<span className="text-xs text-slate-400 font-normal">/mo</span></p>
            <p className="text-xs text-slate-400">{host.availableM3} m³ free</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs bg-slate-50 text-slate-600 rounded-full px-2 py-0.5">⭐ {host.rating}</span>
          <span className="text-xs bg-slate-50 text-slate-600 rounded-full px-2 py-0.5">{host.reviewCount} reviews</span>
          {host.climate_controlled && (
            <span className="text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-0.5">❄️ Climate</span>
          )}
          <span className="text-xs bg-emerald-50 text-emerald-600 rounded-full px-2 py-0.5">Trust {host.trustScore}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          <TrustCard host={host} />
        </div>
      )}

      <div className="px-4 pb-4">
        <button
          onClick={() => onBook?.(host)}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
        >
          Book storage with {host.name.split(' ')[0]}
        </button>
      </div>
    </div>
  );
}
