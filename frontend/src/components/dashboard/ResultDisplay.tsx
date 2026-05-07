'use client';
import { useState, useCallback } from 'react';

interface Props {
  raw: string;
  corrected: string;
  candidates: Array<{ text: string; score: number }>;
  input: 'webcam' | 'upload';
  onReset: () => void;
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
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
      <rect x="2.5" y="2.5" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function Corner({ v, h }: { v: 'top' | 'bottom'; h: 'left' | 'right' }) {
  return (
    <span style={{
      position: 'absolute', width: 12, height: 12,
      borderTop: v === 'top' ? '1.5px solid var(--accent)' : 'none',
      borderBottom: v === 'bottom' ? '1.5px solid var(--accent)' : 'none',
      borderLeft: h === 'left' ? '1.5px solid var(--accent)' : 'none',
      borderRight: h === 'right' ? '1.5px solid var(--accent)' : 'none',
      top: v === 'top' ? 10 : 'auto',
      bottom: v === 'bottom' ? 10 : 'auto',
      left: h === 'left' ? 10 : 'auto',
      right: h === 'right' ? 10 : 'auto',
    }} />
  );
}

export default function ResultDisplay({ raw, corrected, candidates, input, onReset }: Props) {
  const [showCandidates, setShowCandidates] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const displayText = corrected || raw || '(no output)';

  const speak = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utt = new SpeechSynthesisUtterance(displayText);
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, [displayText, speaking]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100%', gap: 20,
      padding: '40px 32px', maxWidth: 760, margin: '0 auto', width: '100%',
    }}>
      {/* Eyebrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--accent)', alignSelf: 'flex-start' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)', animation: 'pulse-dot 2s ease-in-out infinite', flexShrink: 0 }} />
        TRANSCRIPT · {input === 'webcam' ? 'LIVE SESSION' : 'VIDEO FILE'}
      </div>

      {/* Main result card */}
      <div style={{
        position: 'relative', width: '100%',
        background: 'linear-gradient(180deg, var(--bg-2), var(--bg-1))',
        border: '1px solid rgba(184,216,248,0.15)',
        borderRadius: 12, padding: '28px 28px 24px',
        animation: 'fade-up 0.5s ease both',
      }}>
        <Corner v="top" h="left" />
        <Corner v="top" h="right" />
        <Corner v="bottom" h="left" />
        <Corner v="bottom" h="right" />

        {/* Corrected text + speaker */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            flex: 1,
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(20px, 3vw, 34px)',
            lineHeight: 1.35, letterSpacing: '-0.02em', fontWeight: 500,
            color: 'var(--fg-0)',
          }}>
            {displayText}
          </div>
          <button
            onClick={speak}
            title={speaking ? 'Stop reading' : 'Read aloud'}
            style={{
              flexShrink: 0, marginTop: 4,
              width: 38, height: 38,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: speaking ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${speaking ? 'rgba(184,216,248,0.4)' : 'var(--fg-4)'}`,
              borderRadius: '50%', cursor: 'pointer',
              color: speaking ? 'var(--accent)' : 'var(--fg-2)',
              transition: 'all 180ms ease',
            }}
            onMouseEnter={e => {
              if (!speaking) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(184,216,248,0.06)';
              }
            }}
            onMouseLeave={e => {
              if (!speaking) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-4)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
              }
            }}
          >
            {speaking ? <StopIcon /> : <SpeakerIcon />}
          </button>
        </div>

        {/* Raw VSR */}
        {raw && corrected && raw !== corrected && (
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--fg-4)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--fg-3)', marginBottom: 8, textTransform: 'uppercase' }}>
              Raw VSR
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-2)', letterSpacing: '0.03em', lineHeight: 1.5 }}>
              {raw}
            </div>
          </div>
        )}
      </div>

      {/* N-best */}
      {candidates.length > 0 && (
        <div style={{ width: '100%' }}>
          <button
            onClick={() => setShowCandidates(c => !c)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 14px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--fg-4)',
              borderRadius: showCandidates ? '6px 6px 0 0' : 6,
              cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.12em', color: 'var(--fg-2)', transition: 'all 160ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-3)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-4)'; }}
          >
            <span>N-BEST HYPOTHESES · {candidates.length}</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>{showCandidates ? '▲' : '▼'}</span>
          </button>

          {showCandidates && (
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--fg-4)', borderTop: 'none', borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
              {candidates.map((c, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 72px',
                  gap: 12, padding: '9px 14px',
                  borderBottom: i < candidates.length - 1 ? '1px solid var(--fg-4)' : 'none',
                  alignItems: 'center',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.08em' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: i === 0 ? 'var(--fg-0)' : 'var(--fg-2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.text}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', textAlign: 'right', letterSpacing: '0.04em' }}>
                    {c.score.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, alignSelf: 'center' }}>
        <button
          onClick={onReset}
          style={{
            padding: '11px 28px', background: 'var(--fg-0)',
            border: 'none', borderRadius: 99, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
            color: 'var(--bg-0)', fontWeight: 600, transition: 'all 160ms ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-bright)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(184,216,248,0.18)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--fg-0)';
            (e.currentTarget as HTMLButtonElement).style.transform = '';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
          }}
        >
          + NEW SESSION
        </button>
      </div>
    </div>
  );
}
