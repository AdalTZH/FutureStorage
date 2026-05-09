'use client';

import { useState, useEffect, useRef } from 'react';
import { Camera, Package, X, ChevronRight, Thermometer, MapPin, Star, Shield, Scan, Rocket, Globe, Info, Users, DollarSign, Home } from 'lucide-react';
import { mascotSay } from '@/utils/mascot';
import { api, wsUrl } from '@/utils/api';
import { VideoCapture } from '@/components/VideoCapture';
import { HostCard } from '@/components/HostCard';
import { CheckoutWrapper } from '@/components/Checkout/PaymentFlow';
import dynamic from 'next/dynamic';
const MapView = dynamic(() => import('@/components/MapView').then(m => m.MapView), { ssr: false });

export default function HomePage() {
  const [showVideo, setShowVideo]       = useState(false);
  const [hosts, setHosts]               = useState([]);
  const [inventory, setInventory]       = useState([]);
  const [climate, setClimate]           = useState(null);
  const [booking, setBooking]           = useState(null);
  const [scanResult, setScanResult]     = useState(null);
  const [accuracy, setAccuracy]         = useState(null);
  const [selectedHostId, setSelectedHostId] = useState(null);
  const [userLocation, setUserLocation]     = useState(null);
  const [distances, setDistances]           = useState({});
  const [showPanel, setShowPanel]           = useState(false);
  const [routeTrigger, setRouteTrigger]     = useState(0);
  const [showContributor, setShowContributor] = useState(false);
  const [contributorForm, setContributorForm] = useState({ name: '', location: '', spaceM3: '', contact: '' });
  const [contributorSubmitted, setContributorSubmitted] = useState(false);

  useEffect(() => {
    mascotSay('idle');
    api.hosts().then(d => setHosts(d.hosts || [])).catch(() => {});
    api.inventory().then(d => setInventory(d.items || [])).catch(() => {});
    api.climate('tampines').then(d => setClimate(d)).catch(() => {});
    api.accuracy().then(d => setAccuracy(d)).catch(() => {});
  }, []);

  // Compute straight-line distances when user location is known
  useEffect(() => {
    if (!userLocation || hosts.length === 0) return;
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dists = {};
    hosts.forEach(h => {
      if (!h.lat || !h.lng) return;
      const dLat = toRad(h.lat - userLocation[1]);
      const dLng = toRad(h.lng - userLocation[0]);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(userLocation[1])) * Math.cos(toRad(h.lat)) * Math.sin(dLng/2)**2;
      const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const deliveryFee = km < 5 ? 15 : km < 10 ? 25 : 35;
      dists[h.id] = { km: km.toFixed(1), deliveryFee };
    });
    setDistances(dists);
  }, [userLocation, hosts]);

  function handleScanComplete(result) {
    setScanResult(result);
    setShowVideo(false);
    mascotSay('happy', 'Shiok! Scan done!');
    setRouteTrigger(t => t + 1);
    // Request location if not yet known
    if (!userLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation([pos.coords.longitude, pos.coords.latitude]),
        () => {},
        { timeout: 5000 }
      );
    }
  }

  function handleBook(host) {
    const today = new Date();
    const end   = new Date(today);
    end.setMonth(end.getMonth() + 1);
    setBooking({
      id:           `bk_${Date.now()}`,
      hostId:       host.id,
      hostName:     host.name,
      address:      host.address,
      totalPrice:   host.pricePerMonth,
      durationDays: 30,
      startDate:    today.toISOString().split('T')[0],
      endDate:      end.toISOString().split('T')[0],
    });
  }

  async function triggerClimateAlert() {
    try {
      await api.proactiveTrigger({
        type: 'climate_alert',
        user_id: 'demo_user',
        district: 'tampines',
        temp_c: climate?.temperature_c || 34.5,
        flagged_items: ['Electronics', 'Candles', 'Vinyl records'],
      });
      mascotSay('alert', `It's ${climate?.temperature_c || 34.5}°C near your unit!`);
    } catch {}
  }

  return (
    <div className="min-h-screen bg-[#050b1a] relative z-10">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="glass border-b border-white/5 px-6 py-3.5 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Rocket size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: 'Orbitron, sans-serif' }}>FutureStorage Ecosystem</h1>
            <p className="text-[10px] text-slate-500 -mt-0.5 tracking-wider">AI-POWERED STORAGE · SINGAPORE → SPACE</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {climate && (
            <button
              onClick={triggerClimateAlert}
              className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-1.5 hover:bg-amber-400/20 transition-colors"
            >
              <Thermometer size={13} />
              {climate.temperature_c}°C
            </button>
          )}
          {accuracy && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-1.5">
              <Shield size={13} />
              {accuracy.baseline.pct}%
            </div>
          )}
          <button
            onClick={() => setShowPanel(true)}
            className="flex items-center gap-1.5 text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-1.5 hover:bg-violet-500/20 transition-colors"
          >
            <Info size={13} />
            Why FutureStorage?
          </button>
          <button
            onClick={() => setShowContributor(true)}
            className="relative flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/10 rounded-lg px-3 py-1.5 transition-all hover:bg-emerald-500/20 hover:text-emerald-200"
            style={{
              border: '1px solid rgba(16,185,129,0.5)',
              boxShadow: '0 0 10px rgba(16,185,129,0.3), 0 0 20px rgba(16,185,129,0.15), inset 0 0 8px rgba(16,185,129,0.05)',
            }}
          >
            <Home size={13} />
            Be a Contributor
          </button>
        </div>
      </header>

      {/* ── Main Grid: Left panel + Map ─────────────────────────── */}
      <div className="flex h-[calc(100vh-65px)]">

        {/* ── Left Panel ────────────────────────────────────────── */}
        <div className="w-[420px] min-w-[420px] border-r border-slate-800 flex flex-col overflow-hidden">

          {/* Scan Section */}
          <div className="p-5 border-b border-slate-800">
            {!scanResult ? (
              <button
                onClick={() => setShowVideo(true)}
                className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border-2 border-dashed border-cyan-500/30 hover:border-cyan-400/60 p-8 transition-all hover:shadow-[0_0_30px_rgba(6,182,212,0.1)]"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Scan size={28} className="text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">Scan Your Items</p>
                    <p className="text-xs text-slate-400 mt-1">Point your camera at items to measure volume</p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Scan Complete</p>
                  <button
                    onClick={() => setShowVideo(true)}
                    className="text-[11px] text-slate-400 hover:text-white transition-colors"
                  >
                    Rescan
                  </button>
                </div>

                {/* Primary storable item */}
                {(() => {
                  const storable = (scanResult.items || []).filter(i => i.storable !== false);
                  const primary = storable.length > 0
                    ? storable.reduce((best, it) => it.confidence > best.confidence ? it : best, storable[0])
                    : null;
                  return primary && (
                    <p className="text-sm text-cyan-300 mb-1 font-medium">
                      Primary item: <span className="text-white">{primary.name}</span>
                      <span className="text-slate-500 ml-1">({(primary.confidence * 100).toFixed(0)}%)</span>
                    </p>
                  );
                })()}

                <p className="text-3xl font-bold text-white">{scanResult.volume_m3} m³</p>
                <p className="text-sm text-slate-400 mt-1">{scanResult.summary}</p>

                {/* Object dimensions */}
                {scanResult.breakdown?.[0] && (
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    {scanResult.breakdown[0].class} — {scanResult.breakdown[0].width_m}×{scanResult.breakdown[0].height_m}×{scanResult.breakdown[0].depth_m}m
                  </p>
                )}

                {/* Low light warning */}
                {scanResult.low_light && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5 mt-2">
                    <p className="text-[11px] text-amber-400 font-medium">
                      ⚠️ Low light detected — try scanning with better lighting for accuracy
                    </p>
                  </div>
                )}

                {/* Detected objects */}
                {scanResult.items?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {scanResult.items.map((item, i) => (
                      <span key={i} className={`text-[11px] px-2.5 py-1 rounded-full border ${
                        item.storable !== false
                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                          : 'bg-slate-900 text-slate-600 border-slate-800 line-through'
                      }`}>
                        {item.name} {(item.confidence * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                )}
                {scanResult.items?.filter(i => i.storable === false).length > 0 && (
                  <p className="text-[10px] text-slate-600 mt-1">
                    Excluded (non-storable): {scanResult.items.filter(i => i.storable === false).map(i => i.name).join(', ')}
                  </p>
                )}

                {/* Expandable technical details */}
                <details className="mt-4 group">
                  <summary className="text-[11px] text-slate-500 cursor-pointer select-none hover:text-slate-300 flex items-center gap-1">
                    <ChevronRight size={10} className="group-open:rotate-90 transition-transform" />
                    Technical details
                  </summary>
                  <div className="mt-3 space-y-3">

                    {/* 3D dimension visualization */}
                    {scanResult.breakdown?.[0] && (
                      <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                        <p className="text-[10px] text-slate-500 font-semibold mb-2">Object dimensions</p>
                        <div className="flex items-end gap-1 h-16">
                          {(() => {
                            const b = scanResult.breakdown[0];
                            const maxDim = Math.max(b.width_m, b.height_m, b.depth_m);
                            const scale = maxDim > 0 ? 56 / maxDim : 1;
                            return (
                              <>
                                <div className="flex flex-col items-center">
                                  <div className="bg-emerald-400 rounded-sm" style={{ width: `${Math.max(b.width_m * scale, 4)}px`, height: `${Math.max(b.height_m * scale, 4)}px` }} />
                                  <span className="text-[9px] text-slate-500 mt-1">W×H</span>
                                </div>
                                <div className="flex flex-col items-center ml-3">
                                  <div className="bg-cyan-400 rounded-sm" style={{ width: `${Math.max(b.depth_m * scale, 4)}px`, height: `${Math.max(b.height_m * scale, 4)}px` }} />
                                  <span className="text-[9px] text-slate-500 mt-1">D×H</span>
                                </div>
                                <div className="ml-4 text-[10px] text-slate-400 font-mono self-center">
                                  <p><span className="text-emerald-400 font-bold">W</span> {b.width_m}m</p>
                                  <p><span className="text-emerald-400 font-bold">H</span> {b.height_m}m</p>
                                  <p><span className="text-cyan-400 font-bold">D</span> {b.depth_m}m</p>
                                  <p className="font-bold text-white mt-0.5">Vol: {b.volume_m3} m³</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Depth heatmap */}
                    {scanResult.depth_heatmap && (
                      <div className="rounded-xl overflow-hidden border border-slate-800">
                        <img
                          src={`data:image/jpeg;base64,${scanResult.depth_heatmap}`}
                          alt="Depth map"
                          className="w-full h-auto"
                        />
                        <div className="flex items-center justify-between px-2 py-1 bg-slate-900/80">
                          <p className="text-[9px] text-slate-500">Metric depth (DA2 Indoor)</p>
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm bg-red-500" />
                            <span className="text-[9px] text-slate-500">{scanResult.depth_stats?.min_m}m</span>
                            <span className="w-8 h-1.5 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-blue-600" />
                            <span className="text-[9px] text-slate-500">{scanResult.depth_stats?.max_m}m</span>
                            <span className="w-2 h-2 rounded-sm bg-blue-600" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Brightness gauge */}
                    <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                      <p className="text-[10px] text-slate-500 font-semibold mb-1.5">Frame quality</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-500 w-12">Brightness</span>
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              scanResult.avg_brightness < 40 ? 'bg-amber-400' : scanResult.avg_brightness < 100 ? 'bg-yellow-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${(scanResult.avg_brightness / 255) * 100}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono w-10 text-right">{scanResult.avg_brightness}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] text-slate-500 w-12">Usable</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: scanResult.frames_processed || 0 }, (_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-sm ${i < ((scanResult.frames_processed || 0) - (scanResult.dark_frames || 0)) ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          ))}
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {(scanResult.frames_processed || 0) - (scanResult.dark_frames || 0)}/{scanResult.frames_processed || 0}
                        </span>
                      </div>
                    </div>

                    {/* Full pipeline table */}
                    <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                      <p className="text-[10px] text-slate-500 font-semibold mb-1.5">Pipeline</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                        <span className="text-slate-500">Method</span>
                        <span className="text-slate-300 font-mono">{scanResult.method === 'sfm' ? 'SfM triangulation' : scanResult.breakdown?.[0]?.method === 'hybrid_sfm_depth' ? 'Hybrid (SfM + Depth)' : 'Metric depth + FOV'}</span>
                        <span className="text-slate-500">Depth</span>
                        <span className="text-slate-300 font-mono">DA2 Metric Indoor (ViT-S)</span>
                        <span className="text-slate-500">Segmentation</span>
                        <span className="text-slate-300 font-mono">SAM 2 Tiny (video)</span>
                        <span className="text-slate-500">Detection</span>
                        <span className="text-slate-300 font-mono">YOLOv8m (CUDA)</span>
                        <span className="text-slate-500">FOV</span>
                        <span className="text-slate-300 font-mono">60° (webcam)</span>
                        <span className="text-slate-500">Frames</span>
                        <span className="text-slate-300 font-mono">{scanResult.frames_processed} @ 2fps</span>
                        <span className="text-slate-500">Detections</span>
                        <span className="text-slate-300 font-mono">{scanResult.total_detections} total</span>
                        {scanResult.imu_samples > 0 && (
                          <>
                            <span className="text-slate-500">IMU</span>
                            <span className="text-slate-300 font-mono">{scanResult.imu_samples} samples @ 60Hz</span>
                          </>
                        )}
                        {scanResult.breakdown?.[0]?.sfm_points && (
                          <>
                            <span className="text-slate-500">SfM points</span>
                            <span className="text-slate-300 font-mono">{scanResult.breakdown[0].sfm_points} triangulated</span>
                          </>
                        )}
                        {scanResult.breakdown?.[0]?.method && (
                          <>
                            <span className="text-slate-500">Scale</span>
                            <span className="text-slate-300 font-mono">
                              {scanResult.breakdown[0].method === 'sfm_imu' ? 'IMU displacement' : scanResult.breakdown[0].method === 'sfm_depth' ? 'Depth prior' : 'Metric model'}
                            </span>
                          </>
                        )}
                        <span className="text-slate-500">Depth range</span>
                        <span className="text-slate-300 font-mono">{scanResult.depth_stats?.min_m}–{scanResult.depth_stats?.max_m}m</span>
                        <span className="text-slate-500">Median dist</span>
                        <span className="text-slate-300 font-mono">{scanResult.depth_stats?.median_m}m</span>
                        <span className="text-slate-500">Calibration</span>
                        <span className="text-slate-300 font-mono">{scanResult.calibration_used ? 'Reference found' : 'No reference'}</span>
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* Host Listings */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-white">{hosts.length} Hosts Available</p>
              <p className="text-[11px] text-slate-500">Near you in SG</p>
            </div>

            {hosts.map(host => (
              <div
                key={host.id}
                onClick={() => setSelectedHostId(host.id)}
                className={`rounded-xl border p-4 cursor-pointer transition-all ${
                  selectedHostId === host.id
                    ? 'bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.08)]'
                    : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                    {host.name.split(' ').map(w => w[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white text-sm">{host.name}</p>
                      <p className="text-cyan-400 font-bold text-sm">S${host.pricePerMonth}<span className="text-slate-500 font-normal text-[11px]">/mo</span></p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <MapPin size={11} className="text-slate-500" />
                      <p className="text-xs text-slate-400 truncate">{host.address}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 text-[11px] text-amber-400">
                        <Star size={11} fill="currentColor" /> {host.rating}
                      </span>
                      <span className="text-[11px] text-slate-500">{host.reviewCount} reviews</span>
                      <span className="text-[11px] text-slate-500">{host.availableM3} m³ free</span>
                      {host.climate_controlled && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-400/10 rounded px-1.5 py-0.5">Climate</span>
                      )}
                      {distances[host.id] && (
                        <span className={`text-[10px] rounded px-1.5 py-0.5 font-semibold ${
                          parseFloat(distances[host.id].km) < 10
                            ? 'text-cyan-300 bg-cyan-400/10'
                            : 'text-amber-300 bg-amber-400/10'
                        }`}>
                          {parseFloat(distances[host.id].km) < 10 ? 'LOCAL' : 'REGIONAL'}
                        </span>
                      )}
                    </div>
                    {distances[host.id] && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] text-cyan-400 font-mono">{distances[host.id].km} km away</span>
                        <span className="text-[11px] text-slate-400">·</span>
                        <span className="text-[11px] text-emerald-400">Delivery S${distances[host.id].deliveryFee}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBook(host); }}
                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold py-2 rounded-lg transition-colors"
                  >
                    Book Now
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedHostId(host.id); }}
                    className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-2 rounded-lg transition-colors"
                  >
                    View on Map
                  </button>
                </div>
              </div>
            ))}

            {/* Premium Orbital Card */}
            <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-900/30 via-slate-900/50 to-cyan-900/20 p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-violet-500/10 to-transparent rounded-bl-full" />
              <div className="flex items-start gap-3 relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white shrink-0 shadow-[0_0_12px_rgba(124,58,237,0.4)]">
                  <Rocket size={18} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white text-sm">Premium Orbital Storage</p>
                    <span className="text-[9px] text-violet-300 bg-violet-500/20 rounded px-1.5 py-0.5 font-bold tracking-wider">ORBITAL</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Multi-year storage via SpaceX & Amazon Global Logistics. For high-net-worth clients relocating or rebuilding.
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] text-violet-300">From S$200/mo</span>
                    <span className="text-[11px] text-slate-500">+ insurance</span>
                    <span className="text-[10px] text-slate-600">T&C applies</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowPanel(true)}
                className="w-full mt-3 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white text-xs font-semibold py-2 rounded-lg transition-all shadow-[0_0_20px_rgba(124,58,237,0.15)]"
              >
                Learn More
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: Map ────────────────────────────────────────── */}
        <div className="flex-1 relative">
          <MapView
            hosts={hosts.filter(h => h.lng && h.lat)}
            selectedHostId={selectedHostId}
            onSelectHost={h => setSelectedHostId(h.id)}
            onUserLocation={coord => setUserLocation(coord)}
            autoRoute={routeTrigger}
          />
          {/* Map overlay label */}
          <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 font-mono">
            {hosts.filter(h => h.lng && h.lat).length} locations · Singapore
          </div>
        </div>
      </div>

      {/* ── Video capture overlay ──────────────────────────────── */}
      {showVideo && (
        <VideoCapture
          onComplete={handleScanComplete}
          onClose={() => setShowVideo(false)}
        />
      )}

      {/* ── Checkout modal ─────────────────────────────────────── */}
      {booking && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="font-semibold text-white">Confirm Booking</p>
                <p className="text-sm text-slate-400">{booking.hostName} · {booking.address}</p>
              </div>
              <button onClick={() => setBooking(null)} className="text-slate-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 mb-5 space-y-2 text-sm border border-slate-700/50">
              <div className="flex justify-between">
                <span className="text-slate-400">Duration</span>
                <span className="text-white">30 days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">From</span>
                <span className="text-white">{booking.startDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Until</span>
                <span className="text-white">{booking.endDate}</span>
              </div>
              <div className="border-t border-slate-700 pt-2 flex justify-between font-semibold">
                <span className="text-slate-300">Total</span>
                <span className="text-cyan-400">S${booking.totalPrice}</span>
              </div>
            </div>
            <CheckoutWrapper
              booking={booking}
              onSuccess={() => {
                setBooking(null);
                mascotSay('booking_done', 'Booking confirmed!');
                api.createBooking({
                  host_id:    booking.hostId,
                  start_date: booking.startDate,
                  end_date:   booking.endDate,
                  items:      scanResult?.items || [],
                  total_sgd:  booking.totalPrice,
                  volume_m3:  scanResult?.volume_m3 || 0,
                }).catch(() => {});
              }}
            />
          </div>
        </div>
      )}
      {/* ── Contributor Slide-out Panel ──────────────────────── */}
      {showContributor && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowContributor(false)} />
          <div className="absolute top-0 right-0 h-full w-[460px] max-w-full overflow-y-auto shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #050b1a 0%, #0a1f14 50%, #0a0e1f 100%)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-7">
                <div>
                  <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>Storage Contributor</h2>
                  <p className="text-xs text-slate-500 mt-1 tracking-widest uppercase">Earn from your spare space</p>
                </div>
                <button onClick={() => setShowContributor(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                  <X size={20} />
                </button>
              </div>

              {/* Earnings highlights */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { icon: <DollarSign size={16} />, value: 'S$70–200', label: 'per month', color: 'emerald' },
                  { icon: <Users size={16} />, value: '2,400+', label: 'active hosts', color: 'cyan' },
                  { icon: <Shield size={16} />, value: '100%', label: 'insured', color: 'violet' },
                ].map((stat, i) => (
                  <div key={i} className={`rounded-xl p-3 text-center border ${
                    stat.color === 'emerald' ? 'bg-emerald-500/8 border-emerald-500/20' :
                    stat.color === 'cyan' ? 'bg-cyan-500/8 border-cyan-500/20' :
                    'bg-violet-500/8 border-violet-500/20'
                  }`}>
                    <div className={`flex justify-center mb-1 ${
                      stat.color === 'emerald' ? 'text-emerald-400' :
                      stat.color === 'cyan' ? 'text-cyan-400' : 'text-violet-400'
                    }`}>{stat.icon}</div>
                    <p className="text-sm font-bold text-white">{stat.value}</p>
                    <p className="text-[10px] text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* How it works */}
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3" style={{ fontFamily: 'Orbitron, sans-serif' }}>How it works</p>
              <div className="space-y-2 mb-6">
                {[
                  { step: '01', title: 'Register your space', desc: 'List your garage, spare room, or warehouse. Takes 5 minutes.' },
                  { step: '02', title: 'We verify & onboard', desc: 'Our team confirms your space meets safety standards.' },
                  { step: '03', title: 'Accept bookings', desc: 'Renters find you on the map. You approve each booking.' },
                  { step: '04', title: 'Get paid monthly', desc: 'Automatic payouts to your bank. No hassle.' },
                ].map((s, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl bg-white/[0.02] border border-white/5 p-3">
                    <span className="text-[11px] font-bold text-emerald-400 font-mono w-6 shrink-0">{s.step}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{s.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Register Interest Form */}
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3" style={{ fontFamily: 'Orbitron, sans-serif' }}>Register Interest</p>
              {contributorSubmitted ? (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-5 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                    <Shield size={22} className="text-emerald-400" />
                  </div>
                  <p className="font-semibold text-white mb-1">You're on the list!</p>
                  <p className="text-xs text-slate-400">We'll reach out within 2 business days to verify your space.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { key: 'name', label: 'Your name', placeholder: 'Jane Tan' },
                    { key: 'location', label: 'Location / postal code', placeholder: 'e.g. Tampines, 520312' },
                    { key: 'spaceM3', label: 'Approx. available space (m³)', placeholder: 'e.g. 8' },
                    { key: 'contact', label: 'Email or phone', placeholder: 'jane@example.com' },
                  ].map(field => (
                    <div key={field.key}>
                      <label className="block text-[11px] text-slate-400 mb-1">{field.label}</label>
                      <input
                        type="text"
                        value={contributorForm[field.key]}
                        onChange={e => setContributorForm(f => ({ ...f, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      if (!contributorForm.name || !contributorForm.contact) return;
                      setContributorSubmitted(true);
                      mascotSay('happy', 'Welcome to the FutureStorage network!');
                    }}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all mt-1"
                    style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)', boxShadow: '0 0 20px rgba(16,185,129,0.2)' }}
                  >
                    Register as Contributor
                  </button>
                </div>
              )}

              <p className="text-[10px] text-slate-600 mt-6 text-center leading-relaxed">
                By registering, you agree to FutureStorage's Host Terms. All spaces are subject to verification. Earnings vary based on location and availability.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Why FutureStorage Slide-out Panel ─────────────────── */}
      {showPanel && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPanel(false)} />
          <div className="absolute top-0 right-0 h-full w-[500px] max-w-full overflow-y-auto shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #050b1a 0%, #0d1b36 50%, #0a0e1f 100%)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="p-6">

              {/* Panel header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>Why FutureStorage?</h2>
                  <p className="text-xs text-slate-500 mt-1 tracking-widest uppercase">The Future of Personal Storage</p>
                </div>
                <button onClick={() => setShowPanel(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                  <X size={20} />
                </button>
              </div>

              {/* ── VIZ 1: Storage Orbit Diagram ───────────────────── */}
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4" style={{ fontFamily: 'Orbitron, sans-serif' }}>Your Storage Universe</p>
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 mb-6 flex items-center justify-center">
                <div className="relative" style={{ width: 220, height: 220 }}>
                  {/* Orbital rings */}
                  {[
                    { r: 30, color: '#06b6d4', opacity: 0.5, label: '' },
                    { r: 68, color: '#f59e0b', opacity: 0.3, label: '' },
                    { r: 106, color: '#7c3aed', opacity: 0.2, label: '' },
                  ].map((ring, i) => (
                    <div key={i} className="absolute rounded-full border" style={{
                      width: ring.r * 2, height: ring.r * 2,
                      top: 110 - ring.r, left: 110 - ring.r,
                      borderColor: ring.color,
                      borderWidth: 1,
                      opacity: ring.opacity + 0.5,
                      boxShadow: `0 0 12px ${ring.color}40`,
                    }} />
                  ))}
                  {/* Pulsing center (Your Home) */}
                  <div className="absolute rounded-full flex items-center justify-center text-[10px] font-bold text-slate-900"
                    style={{ width: 46, height: 46, top: 87, left: 87, background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)', boxShadow: '0 0 20px rgba(6,182,212,0.6)' }}>
                    HOME
                  </div>
                  {/* Local node */}
                  <div className="absolute rounded-full flex items-center justify-center"
                    style={{ width: 28, height: 28, top: 68, left: 150, background: '#06b6d4', boxShadow: '0 0 10px #06b6d4' }}>
                    <span className="text-[8px] font-bold text-slate-900">SG</span>
                  </div>
                  {/* Regional node */}
                  <div className="absolute rounded-full flex items-center justify-center"
                    style={{ width: 28, height: 28, top: 155, left: 44, background: '#f59e0b', boxShadow: '0 0 10px #f59e0b80' }}>
                    <span className="text-[8px] font-bold text-slate-900">MY</span>
                  </div>
                  {/* Orbital node */}
                  <div className="absolute rounded-full flex items-center justify-center"
                    style={{ width: 28, height: 28, top: 12, left: 90, background: '#7c3aed', boxShadow: '0 0 14px #7c3aed80' }}>
                    <span className="text-[8px] font-bold text-white">✦</span>
                  </div>
                  {/* Labels */}
                  <div className="absolute text-[9px] text-cyan-400 font-mono" style={{ top: 65, left: 183 }}>LOCAL</div>
                  <div className="absolute text-[9px] text-amber-400 font-mono" style={{ top: 157, left: 14 }}>REGIONAL</div>
                  <div className="absolute text-[9px] text-violet-400 font-mono" style={{ top: 6, left: 120 }}>ORBITAL</div>
                </div>
              </div>

              {/* ── VIZ 2: Item Routing Matrix ──────────────────────── */}
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3" style={{ fontFamily: 'Orbitron, sans-serif' }}>Smart Item Routing</p>
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 mb-6">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="col-span-2 flex justify-between px-1">
                    <span className="text-[10px] text-slate-600">← Low Value</span>
                    <span className="text-[10px] text-slate-400 font-semibold">VALUE</span>
                    <span className="text-[10px] text-slate-600">High Value →</span>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-slate-400 font-semibold tracking-wider whitespace-nowrap">FREQUENCY</div>
                  <div className="grid grid-cols-2 gap-2 ml-2">
                    {[
                      { freq: 'High', val: 'High', tier: 'LOCAL', color: 'cyan', example: '📱 Electronics', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.25)' },
                      { freq: 'High', val: 'Low', tier: 'LOCAL', color: 'cyan', example: '👟 Daily items', bg: 'rgba(6,182,212,0.06)', border: 'rgba(6,182,212,0.15)' },
                      { freq: 'Low', val: 'High', tier: 'REGIONAL', color: 'amber', example: '🎸 Instruments', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
                      { freq: 'Low', val: 'Low', tier: 'ORBITAL', color: 'violet', example: '🛶 Kayak / Sofa', bg: 'rgba(124,58,237,0.1)', border: 'rgba(124,58,237,0.25)' },
                    ].map((cell, i) => (
                      <div key={i} className="rounded-lg p-3 text-center" style={{ background: cell.bg, border: `1px solid ${cell.border}` }}>
                        <p className="text-[10px] text-slate-500 mb-1">{cell.freq} freq · {cell.val} val</p>
                        <p className="text-base mb-1">{cell.example}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          cell.color === 'cyan' ? 'text-cyan-300 bg-cyan-400/10' :
                          cell.color === 'amber' ? 'text-amber-300 bg-amber-400/10' :
                          'text-violet-300 bg-violet-400/10'
                        }`}>{cell.tier}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── VIZ 3: Price Comparison Bars ───────────────────── */}
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3" style={{ fontFamily: 'Orbitron, sans-serif' }}>Cost Comparison / Month</p>
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 mb-6 space-y-3">
                {[
                  { label: 'SG Self-Storage', price: 350, max: 350, color: '#ef4444', pct: 100 },
                  { label: 'Local Host (FutureStorage)', price: 82, max: 350, color: '#06b6d4', pct: 23 },
                  { label: 'Regional MY (FutureStorage)', price: 32, max: 350, color: '#f59e0b', pct: 9 },
                  { label: 'Orbital Premium', price: 200, max: 350, color: '#7c3aed', pct: 57 },
                ].map((row, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">{row.label}</span>
                      <span className="font-mono text-white">S${row.price}/mo</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${row.pct}%`, background: row.color, boxShadow: `0 0 6px ${row.color}80` }} />
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-slate-600 pt-1">* Estimates. Orbital pricing excludes insurance & logistics fees.</p>
              </div>

              {/* ── Storage Tier Cards ─────────────────────────────── */}
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3" style={{ fontFamily: 'Orbitron, sans-serif' }}>Storage Tiers</p>
              <div className="space-y-3 mb-6">
                <div className="rounded-xl p-4 border border-cyan-500/20 bg-cyan-500/5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-cyan-400" />
                      <span className="text-sm font-bold text-cyan-300">Local</span>
                      <span className="text-[10px] text-cyan-400 bg-cyan-400/10 rounded px-1.5 py-0.5 font-mono">SG · &lt;10km</span>
                    </div>
                    <span className="text-sm font-bold text-white">S$70–95<span className="text-slate-500 text-[11px] font-normal">/mo</span></span>
                  </div>
                  <p className="text-xs text-slate-400">Frequent access, valuables, climate-controlled. Trusted hosts nearby.</p>
                </div>
                <div className="rounded-xl p-4 border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Globe size={13} className="text-amber-400" />
                      <span className="text-sm font-bold text-amber-300">Regional</span>
                      <span className="text-[10px] text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5 font-mono">MY · JB / KL</span>
                    </div>
                    <span className="text-sm font-bold text-white">S$25–40<span className="text-slate-500 text-[11px] font-normal">/mo</span></span>
                  </div>
                  <p className="text-xs text-slate-400">Bulk, seasonal, low-use items. Malaysia warehouses at fraction of SG cost.</p>
                </div>
                <div className="rounded-xl p-4 border border-violet-500/25 relative overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(6,182,212,0.06) 100%)' }}>
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-violet-500/10 to-transparent rounded-bl-full" />
                  <div className="flex items-center justify-between mb-1 relative">
                    <div className="flex items-center gap-2">
                      <Rocket size={13} className="text-violet-400" />
                      <span className="text-sm font-bold text-violet-300">Orbital</span>
                      <span className="text-[10px] text-violet-300 bg-violet-500/20 rounded px-1.5 py-0.5 font-mono">PREMIUM</span>
                    </div>
                    <span className="text-sm font-bold text-white">S$200+<span className="text-slate-500 text-[11px] font-normal">/mo</span></span>
                  </div>
                  <p className="text-xs text-slate-400 relative mb-2">SpaceX & Amazon Global Logistics. Multi-year + insurance. Ideal for overseas relocation.</p>
                  <div className="flex flex-wrap gap-1.5 relative">
                    {['Insurance', 'Multi-year', 'Legal T&C'].map(tag => (
                      <span key={tag} className="text-[10px] text-slate-400 bg-slate-800/80 border border-slate-700/50 rounded px-2 py-0.5">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* CTA */}
              <div className="rounded-xl p-5 text-center border border-white/5 bg-white/[0.02]">
                <p className="text-sm font-semibold text-white mb-1">Ready to launch?</p>
                <p className="text-xs text-slate-400 mb-4">Scan your items and we'll recommend the perfect storage tier.</p>
                <button
                  onClick={() => { setShowPanel(false); setShowVideo(true); }}
                  className="w-full text-sm font-bold py-3 rounded-xl text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #06b6d4, #7c3aed)', boxShadow: '0 0 24px rgba(6,182,212,0.2)' }}
                >
                  Scan Items Now
                </button>
              </div>

              <p className="text-[10px] text-slate-600 mt-6 text-center leading-relaxed">
                FutureStorage is a technology platform. Storage partners are independently verified hosts. Insurance products are subject to availability and underwriter approval. Cross-border storage is subject to local laws and customs regulations.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
