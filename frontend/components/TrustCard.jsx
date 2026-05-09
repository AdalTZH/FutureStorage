'use client';

function TrustRow({ icon, label, sublabel }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-base">{icon}</span>
      <div className="flex-1">
        <span className="text-sm text-slate-700">{label}</span>
        {sublabel && <span className="text-xs text-slate-400 ml-2">{sublabel}</span>}
      </div>
      <span className="text-xs bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 font-medium">
        Verified
      </span>
    </div>
  );
}

function TrustMeter({ score }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-semibold text-slate-700">{score}/100</span>
    </div>
  );
}

export function TrustCard({ host }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 font-bold text-lg">
          {host.name?.[0] ?? '?'}
        </div>
        <div>
          <p className="font-semibold text-slate-800">{host.name}</p>
          <p className="text-sm text-slate-500">Host since {host.memberSince}</p>
        </div>
      </div>

      <div className="space-y-2">
        <TrustRow icon="✅" label="Phone verified"      sublabel="OTP confirmed" />
        <TrustRow icon="🏦" label="Bank account linked" sublabel="Account hash matched" />
        <TrustRow icon="⭐" label={`${host.rating} · ${host.reviewCount} reviews`} />
      </div>

      <hr className="border-slate-100" />

      <div className="flex justify-between items-center">
        <span className="text-sm text-slate-600">Trust score</span>
        <TrustMeter score={host.trustScore} />
      </div>

      <div className="bg-indigo-50 rounded-xl p-3 flex items-start gap-3">
        <span className="text-indigo-400 text-lg mt-0.5">🔵</span>
        <div>
          <p className="text-sm font-medium text-indigo-700">Singpass MyInfo integration</p>
          <p className="text-xs text-indigo-500 mt-0.5">
            Full identity verification via NDI — planned for Q1 2026.
            Hosts who verify will receive a priority badge.
          </p>
        </div>
      </div>
    </div>
  );
}
