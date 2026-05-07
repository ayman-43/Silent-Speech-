'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import HistoryPanel from './HistoryPanel';
import WebcamCapture from './WebcamCapture';
import UploadArea from './UploadArea';
import ResultPopup from './ResultPopup';
import type { HistoryEntry, ResultData } from './types';

type Mode = 'idle' | 'webcam' | 'upload';


const HTTP_URL = process.env.NEXT_PUBLIC_BACKEND_HTTP ?? 'http://localhost:8000';

// ── Icons ──────────────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="12" width="26" height="20" rx="3" />
      <path d="M31 18l8-4v16l-8-4" />
      <circle cx="18" cy="22" r="5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 28V14M15 21l7-7 7 7" />
      <path d="M9 32v3a2 2 0 002 2h22a2 2 0 002-2v-3" />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M33 21v-7a3.5 3.5 0 00-7 0v9M19 21v-11a3.5 3.5 0 00-7 0v11M12 21a3.5 3.5 0 00-7 0v7a15 15 0 0015 15h7a15 15 0 0015-15v-9a3.5 3.5 0 00-7 0" />
    </svg>
  );
}

function CornerMark({ v, h }: { v: 'top' | 'bottom'; h: 'left' | 'right' }) {
  return (
    <span style={{
      position: 'absolute', width: 10, height: 10,
      borderTop: v === 'top' ? '1.5px solid var(--accent)' : 'none',
      borderBottom: v === 'bottom' ? '1.5px solid var(--accent)' : 'none',
      borderLeft: h === 'left' ? '1.5px solid var(--accent)' : 'none',
      borderRight: h === 'right' ? '1.5px solid var(--accent)' : 'none',
      top: v === 'top' ? 8 : 'auto', bottom: v === 'bottom' ? 8 : 'auto',
      left: h === 'left' ? 8 : 'auto', right: h === 'right' ? 8 : 'auto',
      opacity: 0.5,
    }} />
  );
}

function ActionCard({ icon, label, desc, badge, accent, accentColor, onClick }: {
  icon: React.ReactNode; label: string; desc: string; badge: string;
  accent?: boolean; accentColor?: string; onClick: () => void;
}) {
  const color = accentColor ?? 'var(--accent)';
  const borderDefault = accent ? `rgba(184,216,248,0.2)` : 'var(--fg-4)';
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', width: 210, padding: '32px 24px',
        background: accent
          ? `linear-gradient(180deg, ${color}12, ${color}04)`
          : 'linear-gradient(180deg, var(--bg-2), var(--bg-1))',
        border: `1px solid ${borderDefault}`,
        borderRadius: 10, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        textAlign: 'center', transition: 'all 200ms ease',
        color: color,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = 'translateY(-3px)';
        el.style.borderColor = color + '80';
        el.style.boxShadow = `0 12px 40px ${color}14`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = '';
        el.style.borderColor = borderDefault;
        el.style.boxShadow = '';
      }}
    >
      <CornerMark v="top" h="left" /><CornerMark v="top" h="right" />
      <CornerMark v="bottom" h="left" /><CornerMark v="bottom" h="right" />
      {icon}
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--fg-0)', marginBottom: 6 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-2)', letterSpacing: '0.06em' }}>{desc}</div>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em',
        color: accent ? color : 'var(--fg-3)',
        padding: '4px 10px', border: `1px solid ${accent ? color + '50' : 'var(--fg-4)'}`, borderRadius: 99,
      }}>
        {badge}
      </div>
    </button>
  );
}

function IdleScreen({ onWebcam, onUpload, onGesture }: {
  onWebcam: () => void; onUpload: () => void; onGesture: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 48, padding: '40px 32px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--accent)', marginBottom: 20 }}>
          <span style={{ width: 32, height: 1, background: 'linear-gradient(90deg, transparent, var(--accent))' }} />
          SILENT SPEECH AI
          <span style={{ width: 32, height: 1, background: 'linear-gradient(90deg, var(--accent), transparent)' }} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3.5vw, 44px)', fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 12, color: 'var(--fg-0)' }}>
          Choose your mode
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.06em' }}>
          Live webcam · Upload video · Gesture recognition
        </p>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        <ActionCard
          icon={<CameraIcon />}
          label="Live Webcam"
          desc="Real-time lip reading via camera"
          badge="● LIVE"
          accent
          onClick={onWebcam}
        />
        <ActionCard
          icon={<UploadIcon />}
          label="Upload Video"
          desc="Analyse a pre-recorded clip"
          badge="MP4 / WEBM"
          onClick={onUpload}
        />
        <ActionCard
          icon={<HandIcon />}
          label="Gesture Detection"
          desc="30+ hand gestures in real time"
          badge="MEDIAPIPE"
          accentColor="#a0e0b0"
          onClick={onGesture}
        />
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [mode, setMode]             = useState<Mode>('idle');
  const [result, setResult]         = useState<ResultData | null>(null);
  const [showPopup, setShowPopup]   = useState(false);
  const [history, setHistory]       = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    try { const s = localStorage.getItem('ss-history'); if (s) setHistory(JSON.parse(s)); } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem('ss-history', JSON.stringify(history));
  }, [history]);

  const handleResult = useCallback((data: ResultData) => {
    setResult(data);
    setShowPopup(true);
    setMode('idle');
    setHistory(prev => {
      const id = crypto.randomUUID();
      const entry: HistoryEntry = {
        id, timestamp: Date.now(),
        input: data.input, raw: data.raw, corrected: data.corrected, candidates: data.candidates,
      };
      setSelectedId(id);
      return [entry, ...prev].slice(0, 50);
    });
  }, []);

  const handleUploadFile = useCallback(async (file: File) => {
    setError(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${HTTP_URL}/infer`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      const raw        = (data.raw        as string) ?? '';
      const corrected  = (data.corrected  as string) ?? '';
      const candidates = (data.candidates as Array<{ text: string; score: number }>) ?? [];
      handleResult({ raw, corrected, candidates, input: 'upload' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setMode('upload');
    }
  }, [handleResult]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-0)', overflow: 'hidden' }}>

      {/* Sidebar */}
      <HistoryPanel
        history={history}
        selectedId={selectedId}
        onSelect={entry => {
          setSelectedId(entry.id);
          setResult({ raw: entry.raw, corrected: entry.corrected, candidates: entry.candidates, input: entry.input });
          setShowPopup(true);
        }}
        onClear={() => { setHistory([]); setSelectedId(null); }}
      />

      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 28px', borderBottom: '1px solid var(--fg-4)',
          background: 'rgba(6,6,8,0.6)', backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-bright)',
              boxShadow: '0 0 14px var(--accent)', animation: 'pulse-dot 2.4s ease-in-out infinite',
            }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em' }}>
              SilentSpeak <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>AI</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            {mode === 'webcam' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)', animation: 'pulse-dot 1.6s ease-in-out infinite' }} />
                WEBCAM MODE
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
          {error && (
            <div
              onClick={() => setError(null)}
              style={{
                position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.35)',
                borderRadius: 6, padding: '8px 20px', zIndex: 20, whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.05em', color: '#ff8b8b',
                animation: 'fade-up 0.3s ease both', cursor: 'pointer',
              }}>
              ⚠ {error} &nbsp;×
            </div>
          )}

          <div style={{ height: '100%' }}>
            {mode === 'idle' && (
              <IdleScreen
                onWebcam={() => { setError(null); setMode('webcam'); }}
                onUpload={() => { setError(null); setMode('upload'); }}
                onGesture={() => router.push('/gesture')}
              />
            )}
            {mode === 'webcam' && (
              <WebcamCapture
                onResult={handleResult}
                onBack={() => { setError(null); setMode('idle'); }}
              />
            )}
            {mode === 'upload' && (
              <UploadArea
                onFile={handleUploadFile}
                onBack={() => { setError(null); setMode('idle'); }}
              />
            )}
          </div>
        </div>
      </div>

      <ResultPopup
        result={result}
        show={showPopup}
        onClose={() => setShowPopup(false)}
        onTryAgain={() => { setShowPopup(false); setMode('idle'); setError(null); }}
      />
    </div>
  );
}
