'use client';
import { useRef, useEffect, useState, useCallback } from 'react';

interface GestureHand {
  name: string;
  confidence: number;
  hand_label: string;
  emoji: string;
  finger_states: boolean[];
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';
const FINGER_LABELS = ['T', 'I', 'M', 'R', 'P'];

function FingerDots({ states }: { states: boolean[] }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {FINGER_LABELS.map((label, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: states[i] ? 'var(--accent)' : 'var(--fg-4)',
            boxShadow: states[i] ? '0 0 6px var(--accent)' : 'none',
            transition: 'all 100ms ease',
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function GestureCard({ hand, index }: { hand: GestureHand; index: number }) {
  const color = hand.hand_label === 'Right' ? '#50dc50' : '#50a0f0';
  return (
    <div style={{
      background: 'rgba(0,0,0,0.55)', border: `1px solid ${color}33`,
      borderRadius: 10, padding: '14px 18px', minWidth: 200,
      backdropFilter: 'blur(12px)',
      animation: 'fade-in-card 0.15s ease both',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em',
          color, textTransform: 'uppercase',
        }}>
          {hand.hand_label} hand
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)',
        }}>
          {Math.round(hand.confidence * 100)}%
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600,
        color: 'var(--fg-0)', letterSpacing: '-0.02em', marginBottom: 12,
        lineHeight: 1,
      }}>
        {hand.name.replace(/_/g, ' ')}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, color, letterSpacing: '0.08em',
        marginBottom: 12,
      }}>
        {hand.emoji}
      </div>
      <FingerDots states={hand.finger_states} />
    </div>
  );
}

export default function GestureCapture() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef     = useRef<WebSocket | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus]   = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [permErr, setPermErr] = useState<string | null>(null);
  const [hands, setHands]     = useState<GestureHand[]>([]);
  const [fps, setFps]         = useState(0);
  const fpsCountRef           = useRef(0);
  const fpsTimerRef           = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws/gesture`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen  = () => {};
    ws.onclose = () => setStatus('error');
    ws.onerror = () => setStatus('error');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'ready') setStatus('ready');
        if (msg.type === 'gesture') {
          setHands(msg.hands ?? []);
          fpsCountRef.current += 1;
        }
        if (msg.type === 'error') setStatus('error');
      } catch {}
    };

    return () => { ws.close(); };
  }, []);

  // ── Camera ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, frameRate: 20 }, audio: false })
      .then(s => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(err => setPermErr(err.message ?? 'Camera denied'));
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  // ── Frame sender ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'ready') return;
    const sendFrame = () => {
      const ws     = wsRef.current;
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !video || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 640, 480);
      canvas.toBlob(blob => {
        if (!blob || !ws || ws.readyState !== WebSocket.OPEN) return;
        blob.arrayBuffer().then(buf => ws.send(buf));
      }, 'image/jpeg', 0.75);
    };
    timerRef.current = setInterval(sendFrame, 1000 / 20);  // 20 fps
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  // ── FPS counter ────────────────────────────────────────────────────────────
  useEffect(() => {
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current);
      fpsCountRef.current = 0;
    }, 1000);
    return () => { if (fpsTimerRef.current) clearInterval(fpsTimerRef.current); };
  }, []);

  const statusColor = status === 'ready' ? 'var(--accent)' : status === 'error' ? '#ff4f4f' : 'var(--fg-3)';
  const statusLabel = status === 'ready' ? 'LIVE' : status === 'error' ? 'ERROR' : 'CONNECTING…';

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 24px', gap: 28,
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em',
          color: 'var(--fg-3)', marginBottom: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'linear-gradient(90deg,transparent,var(--fg-4))' }} />
          GESTURE RECOGNITION
          <span style={{ width: 28, height: 1, background: 'linear-gradient(90deg,var(--fg-4),transparent)' }} />
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(24px,4vw,40px)',
          fontWeight: 500, letterSpacing: '-0.03em', color: 'var(--fg-0)', margin: 0,
        }}>
          Real-time hand <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>gesture</em> detection
        </h1>
      </div>

      {/* Camera frame */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 640,
        border: `1px solid ${status === 'ready' ? 'rgba(184,216,248,0.25)' : 'var(--fg-4)'}`,
        borderRadius: 12, overflow: 'hidden',
        background: 'var(--bg-2)', aspectRatio: '4/3',
        transition: 'border-color 300ms',
      }}>
        {/* Corner marks */}
        {(['tl','tr','bl','br'] as const).map(pos => (
          <span key={pos} style={{
            position: 'absolute', width: 14, height: 14, zIndex: 10,
            borderTop:    (pos==='tl'||pos==='tr') ? '2px solid var(--accent)' : 'none',
            borderBottom: (pos==='bl'||pos==='br') ? '2px solid var(--accent)' : 'none',
            borderLeft:   (pos==='tl'||pos==='bl') ? '2px solid var(--accent)' : 'none',
            borderRight:  (pos==='tr'||pos==='br') ? '2px solid var(--accent)' : 'none',
            top:    (pos==='tl'||pos==='tr') ? 12 : 'auto',
            bottom: (pos==='bl'||pos==='br') ? 12 : 'auto',
            left:   (pos==='tl'||pos==='bl') ? 12 : 'auto',
            right:  (pos==='tr'||pos==='br') ? 12 : 'auto',
            opacity: 0.7,
          }} />
        ))}

        {/* Status badge */}
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 14px', background: 'rgba(0,0,0,0.65)',
          border: `1px solid ${statusColor}44`, borderRadius: 99,
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em',
          whiteSpace: 'nowrap',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: statusColor,
            boxShadow: status === 'ready' ? `0 0 8px ${statusColor}` : 'none',
            animation: status === 'ready' ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
          }} />
          <span style={{ color: statusColor }}>{statusLabel}</span>
          {status === 'ready' && fps > 0 && (
            <span style={{ color: 'var(--fg-3)', marginLeft: 4 }}>{fps} fps</span>
          )}
        </div>

        {permErr ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--fg-2)', fontFamily: 'var(--font-mono)',
            fontSize: 12, textAlign: 'center', padding: 24,
          }}>
            {permErr}
          </div>
        ) : (
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }}
          />
        )}

        <canvas ref={canvasRef} width={640} height={480} style={{ display: 'none' }} />

        {/* Gesture overlay cards */}
        {hands.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 10,
            display: 'flex', gap: 12, justifyContent: 'center', padding: '0 16px',
            flexWrap: 'wrap',
          }}>
            {hands.map((h, i) => <GestureCard key={i} hand={h} index={i} />)}
          </div>
        )}

        {/* "No hands" hint */}
        {status === 'ready' && hands.length === 0 && (
          <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10, fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.14em', color: 'var(--fg-3)',
            padding: '5px 14px', background: 'rgba(0,0,0,0.5)', borderRadius: 99,
            whiteSpace: 'nowrap',
          }}>
            Show your hand to the camera
          </div>
        )}
      </div>

      {/* Gesture legend */}
      <div style={{
        width: '100%', maxWidth: 640,
        border: '1px solid var(--fg-4)', borderRadius: 10,
        background: 'var(--bg-1)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--fg-4)',
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em',
          color: 'var(--fg-3)', textTransform: 'uppercase',
        }}>
          Supported gestures · {30}+
        </div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 0,
        }}>
          {[
            ['Closed Fist','FIST'], ['Open Palm','PALM'], ['Thumbs Up','THU+'],
            ['Thumbs Down','THU-'], ['Peace / V','PEACE'], ['Rock','ROCK'],
            ['OK','OK'], ['Pinch','PINCH'], ['ILoveYou','ILY'], ['Call Me','CALL'],
            ['Pointing Up','UP'], ['Pointing Down','DOWN'], ['Pointing Left','LEFT'],
            ['Pointing Right','RIGHT'], ['Three','3'], ['Four','4'],
            ['Crossed Fingers','CROSS'], ['Vulcan Salute','VULCAN'], ['Spider-Man','SPIDY'],
            ['Claw','CLAW'], ['Duck / Beak','DUCK'], ['Middle Finger','MF'],
          ].map(([name, code], i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
              borderBottom: '1px solid var(--fg-4)',
              borderRight: '1px solid var(--fg-4)',
              width: '50%', boxSizing: 'border-box',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                color: 'var(--accent)', minWidth: 44,
              }}>
                {code}
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-2)' }}>
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Back link */}
      <a href="/" style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
        color: 'var(--fg-3)', textDecoration: 'none', padding: '8px 20px',
        border: '1px solid var(--fg-4)', borderRadius: 99,
        transition: 'all 160ms ease',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--fg-0)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--fg-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--fg-3)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--fg-4)'; }}
      >
        ← Back to home
      </a>

      <style>{`
        @keyframes pulse-dot {
          0%,100% { opacity:1; }
          50%      { opacity:0.4; }
        }
        @keyframes fade-in-card {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
}
