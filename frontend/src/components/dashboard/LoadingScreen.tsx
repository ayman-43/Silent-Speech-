'use client';
import { useEffect, useState } from 'react';

const STAGES = [
  'Detecting facial landmarks…',
  'Running visual encoder…',
  'Decoding with beam search…',
  'Correcting with language model…',
];

export default function LoadingScreen() {
  const [stageIdx, setStageIdx] = useState(0);
  const [bars]    = useState(() => Array.from({ length: 32 }, () => Math.random()));

  useEffect(() => {
    const t = setInterval(() => {
      setStageIdx(i => (i + 1) % STAGES.length);
    }, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10">

      {/* waveform visualiser */}
      <div
        style={{
          position: 'relative',
          padding: '32px 40px',
          background: 'var(--bg-1)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        {/* corner marks */}
        {['top-0 left-0','top-0 right-0','bottom-0 left-0','bottom-0 right-0'].map((pos, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 10, height: 10,
              border: '1.5px solid var(--accent)',
              borderRadius: 1,
              opacity: 0.6,
              top:    pos.includes('top')    ? 8 : 'auto',
              bottom: pos.includes('bottom') ? 8 : 'auto',
              left:   pos.includes('left')   ? 8 : 'auto',
              right:  pos.includes('right')  ? 8 : 'auto',
              borderTopWidth:    pos.includes('top')    ? 1.5 : 0,
              borderBottomWidth: pos.includes('bottom') ? 1.5 : 0,
              borderLeftWidth:   pos.includes('left')   ? 1.5 : 0,
              borderRightWidth:  pos.includes('right')  ? 1.5 : 0,
            }}
          />
        ))}

        {/* animated bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64, width: 220 }}>
          {bars.map((base, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: `var(--accent)`,
                borderRadius: 2,
                opacity: 0.7,
                animation: `vsr-bar ${0.6 + base * 0.8}s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.03}s`,
                height: `${20 + base * 80}%`,
              }}
            />
          ))}
        </div>
      </div>

      {/* status label */}
      <div style={{ textAlign: 'center' }}>
        <p
          key={stageIdx}
          style={{
            fontSize: 13,
            letterSpacing: '0.1em',
            color: 'var(--accent)',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
            animation: 'fade-up 0.4s ease both',
          }}
        >
          {STAGES[stageIdx]}
        </p>
        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center' }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: 6, height: 6,
                borderRadius: '50%',
                background: 'var(--accent)',
                animation: 'pulse-dot 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes vsr-bar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1);   }
        }
      `}</style>
    </div>
  );
}
