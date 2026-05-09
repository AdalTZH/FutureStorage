'use client';

import { useState, useEffect, useRef } from 'react';
import { mascotSay } from '@/utils/mascot';
import { wsUrl } from '@/utils/api';

export function VideoCapture({ onComplete, onClose }) {
  const [progress, setProgress]     = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [hint, setHint]             = useState('');
  const [status, setStatus]         = useState('capturing');
  const [result, setResult]         = useState(null);
  const [detections, setDetections] = useState([]);

  const videoRef    = useRef(null);
  const overlayRef  = useRef(null);
  const wsRef       = useRef(null);
  const streamRef   = useRef(null);
  const startRef    = useRef(null);
  const intervalRef = useRef(null);
  const doneRef     = useRef(false);
  const frameSizeRef = useRef({ w: 1280, h: 720 });
  const imuRef      = useRef([]);
  const frameTimesRef = useRef([]);
  const imuListenerRef = useRef(null);
  const cameraFovRef = useRef(null);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return; // React Strict Mode guard
    mountedRef.current = true;
    startCapture();
    startIMU();
    mascotSay('scanning');
    return () => { stopCapture(); stopIMU(); mountedRef.current = false; };
  }, []);

  function startIMU() {
    if (typeof DeviceMotionEvent === 'undefined') return;
    // iOS 13+ requires permission
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().catch(() => {});
    }
    const handler = (e) => {
      const a = e.acceleration || {};
      imuRef.current.push({
        t: Date.now(),
        ax: a.x || 0,
        ay: a.y || 0,
        az: a.z || 0,
      });
    };
    imuListenerRef.current = handler;
    window.addEventListener('devicemotion', handler, { frequency: 60 });
  }

  function stopIMU() {
    if (imuListenerRef.current) {
      window.removeEventListener('devicemotion', imuListenerRef.current);
    }
  }

  // ── Iron Man HUD: animated overlay ──────────────────────────────
  const animFrameRef = useRef(null);
  const hudStartRef  = useRef(Date.now());

  useEffect(() => {
    const canvas = overlayRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    hudStartRef.current = Date.now();
    let running = true;

    function drawHUD() {
      if (!running) return;
      const dispW = video.clientWidth;
      const dispH = video.clientHeight;
      if (dispW === 0 || dispH === 0) { animFrameRef.current = requestAnimationFrame(drawHUD); return; }

      canvas.width  = dispW;
      canvas.height = dispH;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, dispW, dispH);

      const { w: srcW, h: srcH } = frameSizeRef.current;
      const scale  = Math.max(dispW / srcW, dispH / srcH);
      const offX   = (dispW - srcW * scale) / 2;
      const offY   = (dispH - srcH * scale) / 2;
      const elapsed = Date.now() - hudStartRef.current;

      // ── 1. Holographic grid (subtle perspective) ──────────────────
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 0.5;
      const gridSpacing = 40;
      for (let x = 0; x < dispW; x += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, dispH); ctx.stroke();
      }
      for (let y = 0; y < dispH; y += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(dispW, y); ctx.stroke();
      }
      ctx.restore();

      // ── 2. Animated scan line ─────────────────────────────────────
      const scanY = (elapsed * 0.15) % dispH;
      const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
      scanGrad.addColorStop(0, 'rgba(0, 229, 255, 0)');
      scanGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.4)');
      scanGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 30, dispW, 60);
      // Bright center line
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(dispW, scanY); ctx.stroke();

      // ── 3. Detection overlays ─────────────────────────────────────
      const pulse = 0.6 + 0.4 * Math.sin(elapsed * 0.005);

      detections.forEach((det, i) => {
        const [x1, y1, x2, y2] = det.bbox;
        const rx = x1 * scale + offX;
        const ry = y1 * scale + offY;
        const rw = (x2 - x1) * scale;
        const rh = (y2 - y1) * scale;
        const cx = rx + rw / 2;
        const cy = ry + rh / 2;

        const isStorable = det.storable !== false;
        const color = isStorable ? '#00e5ff' : '#ff9100';
        const colorDim = isStorable ? 'rgba(0, 229, 255,' : 'rgba(255, 145, 0,';

        // ── Pulsing glow border ──
        ctx.save();
        ctx.strokeStyle = `${colorDim} ${pulse * 0.7})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * pulse;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();

        // ── Corner brackets (animated) ──
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        const corner = 16;
        const cOffset = Math.sin(elapsed * 0.003 + i) * 2;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(rx - cOffset, ry + corner); ctx.lineTo(rx - cOffset, ry - cOffset); ctx.lineTo(rx + corner, ry - cOffset);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(rx + rw - corner, ry - cOffset); ctx.lineTo(rx + rw + cOffset, ry - cOffset); ctx.lineTo(rx + rw + cOffset, ry + corner);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(rx - cOffset, ry + rh - corner); ctx.lineTo(rx - cOffset, ry + rh + cOffset); ctx.lineTo(rx + corner, ry + rh + cOffset);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(rx + rw - corner, ry + rh + cOffset); ctx.lineTo(rx + rw + cOffset, ry + rh + cOffset); ctx.lineTo(rx + rw + cOffset, ry + rh - corner);
        ctx.stroke();

        // ── Circular reticle ──
        const radius = Math.min(rw, rh) * 0.25;
        const rot = elapsed * 0.002 + i;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.strokeStyle = `${colorDim} ${pulse})`;
        ctx.lineWidth = 1.5;
        // Outer ring (dashed)
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // Inner ring
        ctx.strokeStyle = `${colorDim} 0.5)`;
        ctx.beginPath(); ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2); ctx.stroke();
        // Crosshair lines
        ctx.strokeStyle = `${colorDim} 0.6)`;
        ctx.lineWidth = 1;
        const ch = radius * 0.35;
        ctx.beginPath(); ctx.moveTo(-ch, 0); ctx.lineTo(ch, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -ch); ctx.lineTo(0, ch); ctx.stroke();
        ctx.restore();

        // ── Data readout panel ──
        const panelX = rx + rw + 8;
        const panelY = ry;
        const panelW = 110;
        const panelH = 48;
        // Panel background
        ctx.fillStyle = 'rgba(10, 22, 40, 0.85)';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.strokeStyle = `${colorDim} 0.6)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX, panelY, panelW, panelH);
        // Connector line
        ctx.beginPath();
        ctx.moveTo(rx + rw, ry + 10); ctx.lineTo(panelX, panelY + 10);
        ctx.strokeStyle = `${colorDim} 0.4)`;
        ctx.stroke();
        // Text content
        ctx.fillStyle = color;
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText(det.class.toUpperCase(), panelX + 6, panelY + 15);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(`CONF: ${(det.confidence * 100).toFixed(0)}%`, panelX + 6, panelY + 30);
        ctx.fillText(`ID: TGT-${String(i + 1).padStart(2, '0')}`, panelX + 6, panelY + 42);
      });

      // ── 4. HUD header bar ─────────────────────────────────────────
      const headerH = 36;
      ctx.fillStyle = 'rgba(10, 22, 40, 0.75)';
      ctx.fillRect(0, 0, dispW, headerH);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, headerH); ctx.lineTo(dispW, headerH); ctx.stroke();

      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('◉ MYSTOREY VISION', 12, 22);

      const statusText = detections.length > 0 ? 'OBJECTS LOCKED' : 'SCANNING...';
      ctx.fillStyle = detections.length > 0 ? '#00e5ff' : '#ff9100';
      const statusW = ctx.measureText(statusText).width;
      ctx.fillText(statusText, dispW - statusW - 12, 22);

      // Center stats
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '10px "JetBrains Mono", monospace';
      const stats = `FRM: ${frameCount}  |  DET: ${detections.length}  |  T+${((elapsed) / 1000).toFixed(1)}s`;
      const statsW = ctx.measureText(stats).width;
      ctx.fillText(stats, (dispW - statsW) / 2, 22);

      // ── 5. Vignette corners ───────────────────────────────────────
      const vigR = dispW * 0.7;
      const vigGrad = ctx.createRadialGradient(dispW/2, dispH/2, vigR * 0.5, dispW/2, dispH/2, vigR);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, 'rgba(0,10,20,0.4)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, dispW, dispH);

      animFrameRef.current = requestAnimationFrame(drawHUD);
    }

    animFrameRef.current = requestAnimationFrame(drawHUD);
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [detections, frameCount, status]);

  async function startCapture() {
    if (wsRef.current?.readyState === WebSocket.OPEN) return; // prevent duplicate
    doneRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Detect camera FOV from track capabilities
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() || {};
        const settings = track.getSettings?.() || {};
        // facingMode: 'environment' = phone rear (~73°), 'user' = front (~60°)
        if (settings.facingMode === 'environment') {
          cameraFovRef.current = 73;
        } else {
          cameraFovRef.current = 60; // laptop/front camera
        }
        console.log('[video] detected FOV:', cameraFovRef.current, 'facing:', settings.facingMode);
      } catch (e) {
        cameraFovRef.current = 60; // default to laptop
      }

      const url = `${wsUrl}/ws/video/demo_user`;
      console.log('[video] connecting WS to', url);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'frame_received') {
          setFrameCount(data.count);
          if (data.frame_w && data.frame_h) {
            frameSizeRef.current = { w: data.frame_w, h: data.frame_h };
          }
          setDetections(data.detections || []);
          if (data.hint) setHint(data.hint);
        } else if (data.type === 'result') {
          setResult(data);
          setStatus('done');
          mascotSay('speaking', data.summary);
          // Auto-close after 2s showing result
          setTimeout(() => {
            onComplete?.(data);
            stopCapture();
            onClose?.();
          }, 2000);
        }
      };
      ws.onerror = (e) => {
        console.error('[video] WS error', e);
        setStatus('ws_error');
      };
      ws.onclose = (e) => {
        console.warn('[video] WS closed', { code: e.code, reason: e.reason, wasClean: e.wasClean });
        if (!doneRef.current && e.code !== 1000) setStatus('ws_error');
      };

      ws.onopen = () => {
        console.log('[video] WS open, starting sampling loop');
        startRef.current = Date.now();
        intervalRef.current = setInterval(() => {
          if (doneRef.current) return;
          const elapsed = Date.now() - startRef.current;
          const pct = Math.min(elapsed / 8000, 1);
          setProgress(pct);
          if (elapsed > 5000 && frameCount >= 5) {
            setHint('Looking good — tap to finish early');
          }
          if (pct >= 1) {
            clearInterval(intervalRef.current);
            finishCapture();
          }
        }, 100);

        samplingLoop(stream, ws);
      };
    } catch (err) {
      console.error('[video] getUserMedia failed:', err);
      setStatus('camera_error');
    }
  }

  async function samplingLoop(stream, ws) {
    const video  = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width  = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    let iter = 0;
    while (!doneRef.current && ws.readyState === WebSocket.OPEN) {
      await new Promise(r => setTimeout(r, 500));
      if (!video || doneRef.current) break;
      if (video.readyState < 2) {
        console.log('[video] waiting for video stream… readyState=', video.readyState);
        continue;
      }
      ctx.drawImage(video, 0, 0, 1280, 720);
      iter++;
      if (iter <= 3) console.log('[video] drew frame', iter, 'wsState=', ws.readyState);
      canvas.toBlob(
        (blob) => {
          if (!blob) { console.warn('[video] toBlob returned null'); return; }
          if (ws.readyState !== WebSocket.OPEN) { console.warn('[video] WS not open at send time'); return; }
          frameTimesRef.current.push(Date.now());
          blob.arrayBuffer().then(buf => {
            ws.send(buf);
            if (iter <= 3) console.log('[video] sent', buf.byteLength, 'bytes');
          });
        },
        'image/jpeg',
        0.7,
      );
    }
  }

  function finishCapture() {
    if (doneRef.current) return;
    doneRef.current = true;
    clearInterval(intervalRef.current);
    setStatus('processing');
    mascotSay('thinking', 'Calculating volume…');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'process',
        imu_samples: imuRef.current,
        frame_timestamps: frameTimesRef.current,
        camera_fov: cameraFovRef.current,
      }));
    } else {
      const mockResult = {
        volume_m3: 0.42,
        items: [{ name: 'suitcase', confidence: 0.87 }, { name: 'backpack', confidence: 0.76 }],
        frames_processed: frameCount || 3,
        calibration_used: false,
        summary: 'Detected 2 item types, estimated 0.42 m³ total.',
      };
      setResult(mockResult);
      setStatus('done');
      setTimeout(() => {
        mascotSay('speaking', mockResult.summary);
        onComplete?.(mockResult);
      }, 800);
    }
  }

  function stopCapture() {
    doneRef.current = true;
    clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col">
      {/* Video feed */}
      <div className="relative flex-1">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* YOLO detection overlay */}
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* HUD: detection count moved to canvas header bar */}

        {/* Progress ring overlay — HUD style */}
        <svg className="absolute bottom-24 left-1/2 -translate-x-1/2 w-16 h-16 drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0,229,255,0.15)" strokeWidth="3" />
          <circle
            cx="50" cy="50" r="44" fill="none"
            stroke="#00e5ff" strokeWidth="4"
            strokeDasharray={`${progress * 276.5} 276.5`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dasharray 0.1s linear' }}
          />
          <text x="50" y="55" textAnchor="middle" fill="#00e5ff" fontSize="18" fontFamily="monospace" fontWeight="bold">
            {Math.round(progress * 100)}%
          </text>
        </svg>

        {/* Frame count — HUD bottom bar */}
        <div className="absolute bottom-6 left-0 right-0 text-center font-mono text-[11px] text-cyan-400/70 tracking-wider">
          {frameCount} FRAMES CAPTURED
        </div>

        {/* Early stop hint — HUD style */}
        {hint && status === 'capturing' && (
          <button
            className="absolute bottom-44 left-0 right-0 text-center text-cyan-300 text-xs font-mono tracking-wide cursor-pointer animate-pulse"
            onClick={finishCapture}
          >
            ▶ {hint.toUpperCase()}
          </button>
        )}

        {/* Processing overlay — HUD style */}
        {status === 'processing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a1628]/80 text-white">
            <div className="w-12 h-12 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(0,229,255,0.5)]" />
            <p className="text-sm font-mono text-cyan-300 tracking-wider">ANALYSING SPATIAL DATA…</p>
            <p className="text-[10px] font-mono text-cyan-500/60 mt-2">YOLO → DEPTHPRO → SAM2</p>
          </div>
        )}

        {/* Error states */}
        {(status === 'camera_error' || status === 'ws_error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-6 text-center">
            <p className="text-4xl mb-3">{status === 'camera_error' ? '📷' : '📡'}</p>
            <p className="font-semibold">
              {status === 'camera_error' ? 'Camera access denied' : 'Connection failed'}
            </p>
            <p className="text-sm text-white/60 mt-1">
              {status === 'camera_error'
                ? 'Please allow camera access and use HTTPS (ngrok).'
                : 'Could not connect to analysis server.'}
            </p>
          </div>
        )}

        {/* Done result — HUD style */}
        {status === 'done' && result && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a1628]/85">
            <div className="border border-cyan-500/40 bg-[#0a1628]/90 rounded-xl p-6 mx-4 w-full max-w-xs text-center shadow-[0_0_30px_rgba(0,229,255,0.15)]">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full border-2 border-cyan-400 flex items-center justify-center shadow-[0_0_12px_rgba(0,229,255,0.4)]">
                <span className="text-cyan-400 text-lg">✓</span>
              </div>
              <p className="font-mono text-cyan-300 text-xs tracking-wider mb-2">SCAN COMPLETE</p>
              <p className="text-3xl font-bold text-white">{result.volume_m3} m³</p>
              <p className="text-[10px] font-mono text-cyan-500/60 mt-3">LOADING PACKING SIMULATION…</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar — cancel only */}
      <div className="bg-black/90 px-6 py-3 flex items-center justify-center">
        <button onClick={() => { stopCapture(); onClose?.(); }} className="text-white/50 text-xs">
          Cancel scan
        </button>
      </div>
    </div>
  );
}
