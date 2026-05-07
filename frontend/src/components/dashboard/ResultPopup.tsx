'use client';
import { useState, useCallback, useEffect } from 'react';
import type { ResultData } from './types';

interface Props {
  result: ResultData | null;
  show: boolean;
  onClose: () => void;
  onTryAgain: () => void;
}

function SpeakerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5H2a.5.5 0 00-.5.5v3a.5.5 0 00.5.5h1.5l3.5 2.5V3L3.5 5.5z" />
      <path d="M10.5 5a3.5 3.5 0 010 5M12.5 3a6.5 6.5 0 010 9" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="2" y="2" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export default function ResultPopup({ result, show, onClose, onTryAgain }: Props) {
  const [showCandidates, setShowCandidates] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (show) {
      setTimeout(() => setMounted(true), 10);
      setShowCandidates(false);
    } else {
      setMounted(false);
      if (speaking) { window.speechSynthesis?.cancel(); setSpeaking(false); }
    }
  }, [show, speaking]);

  const speak = useCallback(() => {
    if (!result || !('speechSynthesis' in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const txt = result.corrected || result.raw || '';
    if (!txt) return;
    const utt = new SpeechSynthesisUtterance(txt);
    utt.onstart = () => setSpeaking(true);
    utt.onend   = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, [result, speaking]);

  if (!show && !mounted) return null;

  const displayText = result ? (result.corrected || result.raw || '(no output)') : '';

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        background: `rgba(6,6,8,${mounted ? '0.75' : '0'})`,
        backdropFilter: mounted ? 'blur(8px)' : 'none',
        transition: 'background 300ms ease, backdrop-filter 300ms ease',
      }}
    >
      {/* Panel */}
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%)',
          borderTop: '1px solid rgba(184,216,248,0.18)',
          borderRadius: '16px 16px 0 0',
          padding: '28px 32px 36px',
          maxWidth: 760,
          width: '100%',
          margin: '0 auto',
          transform: `translateY(${mounted ? '0' : '100%'})`,
          transition: 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        {/* Corner marks */}
        {(['tl','tr'] as const).map(pos => (
          <span key={pos} style={{
            position: 'absolute', width: 12, height: 12,
            borderTop: '1.5px solid var(--accent)',
            borderLeft: pos === 'tl' ? '1.5px solid var(--accent)' : 'none',
            borderRight: pos === 'tr' ? '1.5px solid var(--accent)' : 'none',
            top: 12,
            left: pos === 'tl' ? 12 : 'auto',
            right: pos === 'tr' ? 12 : 'auto',
          }} />
        ))}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)',
              animation: 'pulse-dot 2s ease-in-out infinite',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--accent)' }}>
              TRANSCRIPT READY · {result?.input === 'webcam' ? 'LIVE SESSION' : 'VIDEO FILE'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)', border: '1px solid var(--fg-4)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--fg-2)', fontSize: 14, transition: 'all 160ms ease',
              fontFamily: 'var(--font-mono)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-4)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; }}
          >
            ×
          </button>
        </div>

        {/* Main transcript + speaker */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{
            flex: 1,
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(22px, 3.5vw, 40px)',
            fontWeight: 500, lineHeight: 1.3, letterSpacing: '-0.025em',
            color: 'var(--fg-0)',
            animation: 'fade-up 0.4s ease both',
          }}>
            {displayText}
          </div>
          <button
            onClick={speak}
            title={speaking ? 'Stop' : 'Read aloud'}
            style={{
              flexShrink: 0, marginTop: 4,
              width: 40, height: 40, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: speaking ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${speaking ? 'rgba(184,216,248,0.45)' : 'var(--fg-4)'}`,
              cursor: 'pointer', color: speaking ? 'var(--accent)' : 'var(--fg-2)',
              transition: 'all 180ms ease',
            }}
            onMouseEnter={e => {
              if (!speaking) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
              }
            }}
            onMouseLeave={e => {
              if (!speaking) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-4)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)';
              }
            }}
          >
            {speaking ? <StopIcon /> : <SpeakerIcon />}
          </button>
        </div>

        {/* Raw VSR (if different) */}
        {result?.raw && result.corrected && result.raw !== result.corrected && (
          <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--fg-4)', borderRadius: 6, marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--fg-3)', marginBottom: 6, textTransform: 'uppercase' }}>
              Raw VSR output
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-2)', letterSpacing: '0.03em', lineHeight: 1.5 }}>
              {result.raw}
            </div>
          </div>
        )}

        {/* N-best */}
        {result && result.candidates.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={() => setShowCandidates(c => !c)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.02)', border: '1px solid var(--fg-4)',
                borderRadius: showCandidates ? '6px 6px 0 0' : 6,
                cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.12em', color: 'var(--fg-2)', transition: 'color 160ms ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; }}
            >
              <span>N-BEST HYPOTHESES · {result.candidates.length}</span>
              <span style={{ fontSize: 9, opacity: 0.6 }}>{showCandidates ? '▲' : '▼'}</span>
            </button>
            {showCandidates && (
              <div style={{ border: '1px solid var(--fg-4)', borderTop: 'none', borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
                {result.candidates.map((c, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '28px 1fr 68px',
                    gap: 12, padding: '8px 14px',
                    borderBottom: i < result.candidates.length - 1 ? '1px solid var(--fg-4)' : 'none',
                    alignItems: 'center', background: i === 0 ? 'rgba(184,216,248,0.03)' : 'transparent',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: i === 0 ? 'var(--fg-0)' : 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.text}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', textAlign: 'right' }}>
                      {c.score.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--fg-4)', marginBottom: 20 }} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onTryAgain}
            style={{
              flex: 1, padding: '11px 0',
              background: 'var(--fg-0)', border: 'none', borderRadius: 99,
              cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.12em', color: 'var(--bg-0)', fontWeight: 600,
              transition: 'all 160ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-bright)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--fg-0)'; (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
          >
            + NEW SESSION
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '11px 24px',
              background: 'transparent', border: '1px solid var(--fg-4)', borderRadius: 99,
              cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.12em', color: 'var(--fg-2)',
              transition: 'all 160ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-4)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; }}
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
}
