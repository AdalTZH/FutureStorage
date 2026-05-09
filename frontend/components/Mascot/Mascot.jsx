'use client';

import { useEffect, useRef, useState } from 'react';
import { MascotSequencer } from '@/utils/mascotSequencer';
import '@/styles/mascot.css';

const ALL_FRAMES = [
  'mouth_M','mouth_A','mouth_E','mouth_O','mouth_F',
  'idle_center','idle_left','idle_right','blink_half','blink_closed',
  'listen_neutral','listen_perk','listen_lean','listen_open',
  'think_start','think_lookup','think_bubble_sm','think_bubble_lg',
  'scan_left','scan_mid_l','scan_mid_r','scan_right',
  'happy_stand','happy_crouch','happy_rise','happy_peak','happy_fall','happy_land',
  'book_hold','book_pull','book_pop','book_confetti','book_wide','book_settle',
  'alert_notice','alert_brow','alert_worried','alert_full',
  'error_start','error_sweat','error_wave1','error_wave2',
  'trans_idle_listen','trans_listen_scan','trans_scan_think','trans_think_speak',
  'trans_speak_happy','trans_listen_alert','trans_any_idle_1','trans_any_idle_2',
  'trans_idle_speak','trans_scan_book',
];

// State → emoji fallback color mapping
const STATE_COLORS = {
  idle:         { bg: '#e0f2fe', emoji: '📦' },
  listening:    { bg: '#dcfce7', emoji: '👂' },
  speaking:     { bg: '#fef9c3', emoji: '💬' },
  thinking:     { bg: '#ede9fe', emoji: '🤔' },
  scanning:     { bg: '#fff7ed', emoji: '🔍' },
  happy:        { bg: '#fce7f3', emoji: '🎉' },
  booking_done: { bg: '#d1fae5', emoji: '✅' },
  alert:        { bg: '#fef3c7', emoji: '⚠️' },
  error:        { bg: '#fee2e2', emoji: '😰' },
};

function getStateFromFrame(frame) {
  if (frame.startsWith('mouth'))     return 'speaking';
  if (frame.startsWith('idle') || frame.startsWith('blink')) return 'idle';
  if (frame.startsWith('listen'))    return 'listening';
  if (frame.startsWith('think'))     return 'thinking';
  if (frame.startsWith('scan'))      return 'scanning';
  if (frame.startsWith('happy'))     return 'happy';
  if (frame.startsWith('book'))      return 'booking_done';
  if (frame.startsWith('alert'))     return 'alert';
  if (frame.startsWith('error'))     return 'error';
  return 'idle';
}

export function Mascot({ speechText = '' }) {
  const [frame, setFrame]         = useState('idle_center');
  const [imgError, setImgError]   = useState(false);
  const sequencerRef              = useRef(null);
  const currentStateRef           = useRef('idle');
  const prevFrameRef              = useRef('idle_center');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    ALL_FRAMES.forEach(name => {
      const img = new Image();
      img.src = `/mascot/${name}.png`;
    });

    sequencerRef.current = new MascotSequencer(setFrame);
    sequencerRef.current.setState('idle', null);

    const handler = ({ detail }) => {
      const prev = currentStateRef.current;
      currentStateRef.current = detail.state;
      sequencerRef.current.setState(detail.state, prev);
    };
    window.addEventListener('mascot', handler);
    return () => {
      window.removeEventListener('mascot', handler);
      if (sequencerRef.current) {
        sequencerRef.current._running = false;
      }
    };
  }, []);

  useEffect(() => {
    if (frame !== prevFrameRef.current) {
      setImgError(false);
      prevFrameRef.current = frame;
    }
  }, [frame]);

  const currentState = getStateFromFrame(frame);
  const fallback = STATE_COLORS[currentState] || STATE_COLORS.idle;

  return (
    <div className="mascot-wrapper">
      {imgError ? (
        <div
          className="mascot-placeholder"
          style={{ backgroundColor: fallback.bg }}
          title={frame}
        >
          {fallback.emoji}
        </div>
      ) : (
        <img
          key={frame}
          src={`/mascot/${frame}.png`}
          alt={`MyStorey mascot — ${frame}`}
          className="mascot-img"
          draggable={false}
          onError={() => setImgError(true)}
        />
      )}
      {speechText && (
        <div className="speech-bubble">
          <p>{speechText}</p>
        </div>
      )}
    </div>
  );
}
