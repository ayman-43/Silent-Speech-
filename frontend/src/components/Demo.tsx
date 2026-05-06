'use client';
import { useEffect, useState, useMemo } from 'react';

const DEMO_SCRIPTS = [
  {
    id: 'meeting',
    label: 'Quiet meeting',
    context: 'Library · 14:32',
    phrase: 'I need five more minutes',
    words: ['I', 'need', 'five', 'more', 'minutes'],
    confidence: [0.99, 0.96, 0.92, 0.97, 0.94],
  },
  {
    id: 'medical',
    label: 'Voice loss',
    context: 'Recovery · day 3',
    phrase: 'Could you bring me water',
    words: ['Could', 'you', 'bring', 'me', 'water'],
    confidence: [0.93, 0.98, 0.91, 0.95, 0.99],
  },
  {
    id: 'tactical',
    label: 'Field comms',
    context: 'Encrypted · channel 4',
    phrase: 'Moving to position seven',
    words: ['Moving', 'to', 'position', 'seven'],
    confidence: [0.95, 0.98, 0.89, 0.97],
  },
];

function Landmarks({ tick, active }: { tick: number; active: boolean }) {
  const points = useMemo(() => {
    const pts: { x: number; y: number; r: number; group: string }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      pts.push({ x: 50 + Math.cos(a) * 22, y: 60 + Math.sin(a) * 9, r: 1.6, group: 'outer' });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      pts.push({ x: 50 + Math.cos(a) * 14, y: 60 + Math.sin(a) * 5, r: 1.2, group: 'inner' });
    }
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      pts.push({ x: 25 + t * 50, y: 78 + Math.sin(t * Math.PI) * -3, r: 1, group: 'jaw' });
    }
    pts.push({ x: 50, y: 38, r: 1.4, group: 'nose' });
    pts.push({ x: 46, y: 46, r: 1.1, group: 'nose' });
    pts.push({ x: 54, y: 46, r: 1.1, group: 'nose' });
    return pts;
  }, []);

  const outer = points.filter(p => p.group === 'outer');
  const inner = points.filter(p => p.group === 'inner');

  return (
    <svg className="vp-landmarks" viewBox="0 0 100 100" preserveAspectRatio="none">
      <g className="lm-lines">
        {outer.map((p, i) => {
          const next = outer[(i + 1) % outer.length];
          return <line key={i} x1={p.x} y1={p.y} x2={next.x} y2={next.y} />;
        })}
        {inner.map((p, i) => {
          const next = inner[(i + 1) % inner.length];
          return <line key={`i${i}`} x1={p.x} y1={p.y} x2={next.x} y2={next.y} />;
        })}
      </g>
      <g className="lm-dots">
        {points.map((p, i) => {
          const jitter = active ? Math.sin(tick * 4 + i * 0.7) * 0.4 : 0;
          const jitterY = active ? Math.cos(tick * 3.5 + i * 0.5) * 0.4 : 0;
          return (
            <circle
              key={i}
              cx={p.x + jitter}
              cy={p.y + jitterY}
              r={p.r}
              className={`lm-dot lm-${p.group}`}
            />
          );
        })}
      </g>
      <rect className="lm-bbox" x="22" y="48" width="56" height="24" />
    </svg>
  );
}

function PipelineStep({
  num, title, detail, active, last, children
}: {
  num: string; title: string; detail: string; active: boolean; last?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`pl-step${active ? ' active' : ''}${last ? ' last' : ''}`}>
      <div className="pl-rail">
        <span className="pl-node" />
        {!last && <span className="pl-connector" />}
      </div>
      <div className="pl-content">
        <div className="pl-head">
          <span className="pl-num">{num}</span>
          <span className="pl-title">{title}</span>
          <span className="pl-detail">{detail}</span>
        </div>
        <div className="pl-viz">{children}</div>
      </div>
    </div>
  );
}

export default function Demo() {
  const [activeScript, setActiveScript] = useState(0);
  const [running, setRunning] = useState(true);
  const [tick, setTick] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);

  const script = DEMO_SCRIPTS[activeScript];

  useEffect(() => {
    setRevealed(0);
    setFrameIdx(0);
    setTick(0);
  }, [activeScript]);

  useEffect(() => {
    if (!running) return;
    let raf: number;
    const start = performance.now();
    const seed = tick;
    const loop = (now: number) => {
      const elapsed = (now - start) / 1000 + seed;
      setTick(elapsed);
      const wordsCount = script.words.length;
      const cycleLen = wordsCount * 0.7 + 1.5;
      const cyclePos = elapsed % cycleLen;
      const wordsShown = Math.min(wordsCount, Math.floor(cyclePos / 0.7));
      setRevealed(wordsShown);
      setFrameIdx(Math.floor(elapsed * 30) % 90);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, activeScript]);

  const latency = (36 + Math.sin(tick * 3) * 4).toFixed(0);

  return (
    <section className="demo" id="demo">
      <div className="demo-header">
        <div className="demo-header-left">
          <div className="sh-eyebrow">
            <span className="sh-eyebrow-line" />
            <span>LIVE DEMO · SCRIPTED RUN</span>
          </div>
          <h2 className="sh-title demo-title">See silence,<br /><em>understood.</em></h2>
          <p className="sh-sub">A scripted run-through of the inference pipeline. Lip-landmark sequences become text, frame by frame, on-device.</p>
          <div className="demo-header-stats">
            <div className="dhs-item"><span className="dhs-num">3</span><span className="dhs-lbl">scenarios</span></div>
            <div className="dhs-item"><span className="dhs-num">68</span><span className="dhs-lbl">landmarks tracked</span></div>
            <div className="dhs-item"><span className="dhs-num">30<span className="dhs-unit">fps</span></span><span className="dhs-lbl">capture rate</span></div>
            <div className="dhs-item"><span className="dhs-num">0.97<span className="dhs-unit">avg</span></span><span className="dhs-lbl">confidence</span></div>
          </div>
        </div>
        <div className="demo-header-3d">
          <div className="vp-corner vp-tl" />
          <div className="vp-corner vp-tr" />
          <div className="vp-corner vp-bl" />
          <div className="vp-corner vp-br" />
          <div className="d3-tag">
            <span className="ed-tag-dot" />
            SEQUENCE · t-{Math.floor((tick * 30) % 90)}
          </div>
          {/* Animated sequence viz in the 3d panel */}
          <svg viewBox="0 0 400 300" style={{ width: '100%', height: '100%', opacity: 0.7 }}>
            <defs>
              <radialGradient id="seqGlow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#b8d8f8" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#b8d8f8" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="200" cy="150" r="120" fill="url(#seqGlow)" />
            {Array.from({ length: 16 }).map((_, i) => {
              const a = (i / 16) * Math.PI * 2 + tick * 0.2;
              const r = 90 + Math.sin(tick * 2 + i) * 10;
              const x = 200 + Math.cos(a) * r;
              const y = 150 + Math.sin(a) * r;
              return <circle key={i} cx={x} cy={y} r={2} fill="#b8d8f8" opacity={0.5 + Math.sin(tick * 3 + i) * 0.3} />;
            })}
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i / 8) * Math.PI * 2 + tick * 0.5;
              const r = 50;
              const x = 200 + Math.cos(a) * r;
              const y = 150 + Math.sin(a) * r;
              return <circle key={`inner${i}`} cx={x} cy={y} r={1.5} fill="#e8f4ff" opacity={0.8} />;
            })}
            <circle cx="200" cy="150" r="20" fill="none" stroke="#b8d8f8" strokeWidth="0.5" opacity="0.4" />
            <text x="200" y="146" fontSize="8" fill="#b8d8f8" textAnchor="middle" fontFamily="monospace" letterSpacing="1">SEQUENCE</text>
            <text x="200" y="158" fontSize="7" fill="#82838c" textAnchor="middle" fontFamily="monospace" letterSpacing="0.5">ENCODING</text>
          </svg>
        </div>
      </div>

      <div className="demo-shell">
        <div className="demo-frame">
          <div className="demo-topbar">
            <div className="demo-topbar-l">
              <span className={`rec-dot${running ? ' live' : ''}`} />
              <span className="demo-mono">{running ? 'INFERRING' : 'PAUSED'}</span>
              <span className="demo-sep">·</span>
              <span className="demo-mono demo-dim">model · ssp-v3.2-edge</span>
            </div>
            <div className="demo-topbar-r">
              <span className="demo-mono demo-dim">frame</span>
              <span className="demo-mono">{String(frameIdx).padStart(3, '0')}/090</span>
              <span className="demo-sep">·</span>
              <span className="demo-mono demo-dim">latency</span>
              <span className="demo-mono">{latency}ms</span>
            </div>
          </div>

          <div className="demo-body">
            <div className="demo-viewport">
              <div className="vp-corner vp-tl" />
              <div className="vp-corner vp-tr" />
              <div className="vp-corner vp-bl" />
              <div className="vp-corner vp-br" />
              <div className="vp-context">
                <span className="vp-context-label">CONTEXT</span>
                <span className="vp-context-val">{script.context}</span>
              </div>
              <div className="vp-stage">
                <div className="vp-glow" />
                <Landmarks tick={tick} active={running} />
                <div className="vp-scan" style={{ transform: `translateY(${Math.sin(tick * 1.2) * 80}px)` }} />
                <div className="vp-roi">
                  <span className="roi-label">ROI · mouth region</span>
                </div>
              </div>
              <div className="vp-readout">
                <span className="demo-mono demo-dim">privacy</span>
                <span className="demo-mono">no frames stored · no audio</span>
              </div>
            </div>

            <div className="demo-pipeline">
              <PipelineStep num="01" title="Visual capture" detail="68 facial landmarks · 30 fps" active={tick > 0}>
                <div className="pl-meter">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <span
                      key={i}
                      className="pl-meter-bar"
                      style={{
                        height: `${30 + Math.abs(Math.sin(i * 0.5 + tick * 6)) * 70}%`,
                        opacity: 0.3 + Math.abs(Math.sin(i * 0.3 + tick * 4)) * 0.7,
                      }}
                    />
                  ))}
                </div>
              </PipelineStep>

              <PipelineStep num="02" title="Sequence model" detail="temporal CNN → transformer" active={tick > 0.4}>
                <div className="pl-tokens">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const lit = (Math.floor(tick * 8) + i) % 12 < 4;
                    return (
                      <span key={i} className={`pl-token${lit ? ' on' : ''}`}>
                        {(i * 73 % 256).toString(16).padStart(2, '0')}
                      </span>
                    );
                  })}
                </div>
              </PipelineStep>

              <PipelineStep
                num="03"
                title="Decoded transcript"
                detail={`${revealed}/${script.words.length} words · ${(0.94 + Math.sin(tick) * 0.04).toFixed(2)} avg conf`}
                active={revealed > 0}
                last
              >
                <div className="pl-transcript">
                  {script.words.map((w, i) => (
                    <span
                      key={i}
                      className={`pl-w${i < revealed ? ' on' : ''}${i === revealed - 1 ? ' fresh' : ''}`}
                    >
                      <span className="pl-w-text">{w}</span>
                      <span className="pl-w-conf">{script.confidence[i].toFixed(2)}</span>
                    </span>
                  ))}
                  {revealed < script.words.length && <span className="pl-cursor" />}
                </div>
              </PipelineStep>
            </div>
          </div>

          <div className="demo-controls">
            <div className="demo-scripts">
              {DEMO_SCRIPTS.map((s, i) => (
                <button
                  key={s.id}
                  className={`demo-script${i === activeScript ? ' active' : ''}`}
                  onClick={() => setActiveScript(i)}
                >
                  <span className="demo-script-num">0{i + 1}</span>
                  <span className="demo-script-label">{s.label}</span>
                  <span className="demo-script-phrase">&quot;{s.phrase}&quot;</span>
                </button>
              ))}
            </div>
            <button className="demo-toggle" onClick={() => setRunning(r => !r)}>
              {running ? (
                <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                  <rect width="3" height="12" rx="0.5" /><rect x="7" width="3" height="12" rx="0.5" />
                </svg>
              ) : (
                <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                  <path d="M0 0L10 6L0 12V0Z" />
                </svg>
              )}
              <span>{running ? 'Pause' : 'Resume'}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
