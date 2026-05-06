'use client';
import { useEffect, useState } from 'react';

const LEDGER_EVENTS = [
  { tag: 'FRAME', label: 'frame.captured', detail: '1280×720 · 33ms', status: 'local' },
  { tag: 'INFER', label: 'landmarks.extract', detail: '68 points · 2.4ms', status: 'local' },
  { tag: 'INFER', label: 'sequence.encode', detail: '16 frames · 7.1ms', status: 'local' },
  { tag: 'NET', label: 'cloud.sync', detail: 'blocked · policy=local', status: 'blocked' },
  { tag: 'INFER', label: 'phoneme.decode', detail: 'conf 0.97 · 4.0ms', status: 'local' },
  { tag: 'BUF', label: 'buffer.write', detail: 'RAM · ephemeral', status: 'local' },
  { tag: 'NET', label: 'telemetry.beacon', detail: 'blocked · zero egress', status: 'blocked' },
  { tag: 'OUT', label: 'transcript.emit', detail: '"meet me at six"', status: 'local' },
  { tag: 'BUF', label: 'buffer.flush', detail: 'RAM cleared · 0 bytes persisted', status: 'local' },
  { tag: 'NET', label: 'analytics.send', detail: 'blocked · no telemetry', status: 'blocked' },
  { tag: 'AUDIO', label: 'mic.request', detail: 'denied · permission never asked', status: 'blocked' },
  { tag: 'INFER', label: 'model.warm', detail: '12.4 MB · resident', status: 'local' },
];

type LedgerRow = typeof LEDGER_EVENTS[0] & { id: number; time: string };

function PrivacyLedger({ t }: { t: number }) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const idRef = { current: 0 };

  useEffect(() => {
    let localId = 0;
    const interval = setInterval(() => {
      const ev = LEDGER_EVENTS[Math.floor(Math.random() * LEDGER_EVENTS.length)];
      const id = ++localId;
      const ts = new Date();
      const time = ts.toTimeString().slice(0, 8) + '.' + String(ts.getMilliseconds()).padStart(3, '0');
      setRows(prev => [...prev, { ...ev, id, time }].slice(-7));
    }, 900);
    return () => clearInterval(interval);
  }, []);

  const ramFill = ((t * 0.18) % 1);
  const ramPct = Math.min(100, ramFill * 100);
  const n = rows.length;

  return (
    <div className="pl">
      <div className="pl-head">
        <div className="pl-head-l">
          <span className="ed-tag-dot" />
          <span className="pl-head-title">DEVICE EVENT LEDGER</span>
        </div>
        <span className="pl-head-r">PROOF · OF · LOCALITY</span>
      </div>

      <div className="pl-body">
        <div className="pl-stream">
          {rows.map((r, i) => (
            <div
              key={r.id}
              className={`pl-row pl-row-${r.status}`}
              style={{ ['--i' as string]: i, ['--n' as string]: n }}
            >
              <span className="pl-time">{r.time}</span>
              <span className={`pl-tag pl-tag-${r.tag.toLowerCase()}`}>{r.tag}</span>
              <span className="pl-label">{r.label}</span>
              <span className="pl-detail">{r.detail}</span>
              <span className="pl-status">
                {r.status === 'local'
                  ? <><span className="pl-check">✓</span> LOCAL</>
                  : <><span className="pl-x">✗</span> BLOCKED</>}
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="pl-row pl-row-local pl-row-loading">
              <span className="pl-time">--:--:--</span>
              <span className="pl-label">awaiting frames…</span>
            </div>
          )}
        </div>

        <div className="pl-side">
          <div>
            <div className="pl-meter-head">
              <span>RAM · ROLLING BUFFER</span>
              <span className="pl-meter-val">{ramPct.toFixed(0)}%</span>
            </div>
            <div className="pl-meter-bar-outer">
              <div className="pl-meter-fill" style={{ width: ramPct + '%' }} />
            </div>
            <div className="pl-meter-foot">flushes every ~5s</div>
          </div>
          <div>
            <div className="pl-meter-head">
              <span>EGRESS · BYTES SENT</span>
              <span className="pl-meter-val pl-meter-val-zero">0</span>
            </div>
            <div className="pl-meter-bar-outer">
              <div className="pl-meter-fill pl-meter-fill-zero" style={{ width: '0%' }} />
            </div>
            <div className="pl-meter-foot">since boot</div>
          </div>
          <div>
            <div className="pl-meter-head">
              <span>INFERENCE</span>
              <span className="pl-meter-val">{(13.5 + Math.sin(t * 1.4) * 1.8).toFixed(1)}ms</span>
            </div>
            <div className="pl-pulse">
              <svg viewBox="0 0 200 32" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.2"
                  points={Array.from({ length: 60 }, (_, i) => {
                    const x = (i / 59) * 200;
                    const phase = t * 4 - i * 0.18;
                    const y = 16 + Math.sin(phase) * 5 * Math.exp(-Math.abs(((i + t * 12) % 30) - 15) * 0.4) * 2;
                    return `${x},${y}`;
                  }).join(' ')}
                />
              </svg>
            </div>
            <div className="pl-meter-foot">on-device · realtime</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EdgeAI() {
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="edge" id="privacy">
      <div className="sh">
        <div className="sh-eyebrow">
          <span className="sh-eyebrow-line" />
          <span>EDGE AI · PRIVACY</span>
        </div>
        <h2 className="sh-title">Your words.<br /><em>Your device. Nowhere else.</em></h2>
        <p className="sh-sub">Inference happens locally — no microphone access, no cloud round-trip, no continuous recording.</p>
      </div>

      <div className="edge-grid">
        <div className="edge-diagram">
          <div className="ed-frame">
            <div className="ed-corner ed-tl" />
            <div className="ed-corner ed-tr" />
            <div className="ed-corner ed-bl" />
            <div className="ed-corner ed-br" />

            <div className="ed-stage">
              <svg viewBox="0 0 600 360" className="ed-svg" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <radialGradient id="devGlow" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="ringFade" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
                    <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <circle cx="300" cy="180" r="160" fill="url(#devGlow)" />

                {[60, 100, 140].map((r, i) => (
                  <circle
                    key={i}
                    cx="300" cy="180" r={r}
                    fill="none" stroke="url(#ringFade)"
                    strokeWidth="0.6" strokeDasharray="2 6"
                    style={{ transformOrigin: '300px 180px', transform: `rotate(${t * (10 + i * 5)}deg)` }}
                  />
                ))}

                {Array.from({ length: 8 }).map((_, i) => {
                  const a = (i / 8) * Math.PI * 2 + t * 0.3;
                  const r = 130;
                  return (
                    <circle
                      key={`in${i}`}
                      cx={300 + Math.cos(a) * r}
                      cy={180 + Math.sin(a) * r}
                      r="1.5"
                      fill="var(--accent)"
                      opacity={0.4 + Math.sin(t * 2 + i) * 0.3}
                    />
                  );
                })}

                <g transform="translate(240, 130)">
                  <rect x="0" y="0" width="120" height="80" rx="6" fill="none" stroke="var(--fg-2)" strokeWidth="1" />
                  <rect x="6" y="6" width="108" height="60" rx="2" fill="rgba(255,255,255,0.02)" stroke="var(--fg-3)" strokeWidth="0.5" />
                  <text x="60" y="32" fontSize="6" fill="var(--fg-2)" textAnchor="middle" letterSpacing="1">MODEL</text>
                  <text x="60" y="42" fontSize="5" fill="var(--accent)" textAnchor="middle" letterSpacing="0.5" fontFamily="monospace">ssp-v3.2-edge</text>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <rect
                      key={i}
                      x={20 + i * 6.5} y="50"
                      width="3" height={4 + Math.abs(Math.sin(t * 3 + i)) * 8}
                      fill="var(--accent)" opacity={0.4 + Math.abs(Math.sin(t * 3 + i)) * 0.5}
                    />
                  ))}
                  <path d="M-10 80 L130 80 L120 88 L0 88 Z" fill="rgba(255,255,255,0.03)" stroke="var(--fg-3)" strokeWidth="0.5" />
                </g>

                <g>
                  <line x1="430" y1="180" x2="540" y2="180" stroke="var(--fg-3)" strokeWidth="0.5" strokeDasharray="3 3" />
                  <g transform="translate(540, 168)">
                    <path d="M0 12 Q0 4 8 4 Q12 0 18 4 Q26 4 26 12 Z" fill="none" stroke="var(--fg-3)" strokeWidth="0.8" />
                    <text x="13" y="22" fontSize="5" fill="var(--fg-3)" textAnchor="middle" letterSpacing="1">CLOUD</text>
                  </g>
                  <g transform="translate(478, 174)">
                    <circle cx="6" cy="6" r="9" fill="rgba(0,0,0,0.6)" stroke="#ff6b6b" strokeWidth="1" />
                    <line x1="2" y1="2" x2="10" y2="10" stroke="#ff6b6b" strokeWidth="1.2" />
                    <line x1="10" y1="2" x2="2" y2="10" stroke="#ff6b6b" strokeWidth="1.2" />
                  </g>
                  <text x="490" y="208" fontSize="6" fill="#ff6b6b" textAnchor="middle" letterSpacing="1.2" fontFamily="monospace">BLOCKED</text>
                </g>

                <g>
                  <line x1="60" y1="180" x2="170" y2="180" stroke="var(--accent)" strokeWidth="0.6" strokeDasharray="2 2" opacity="0.6" />
                  <text x="115" y="170" fontSize="6" fill="var(--accent)" textAnchor="middle" letterSpacing="1.2" fontFamily="monospace">VISUAL FRAMES</text>
                  <text x="115" y="195" fontSize="5" fill="var(--fg-2)" textAnchor="middle" letterSpacing="1" fontFamily="monospace">camera · local</text>
                  <circle cx={60 + ((t * 60) % 110)} cy="180" r="1.8" fill="var(--accent)" />
                </g>

                <g transform="translate(60, 280)">
                  <rect x="0" y="0" width="14" height="20" rx="7" fill="none" stroke="var(--fg-3)" strokeWidth="0.7" />
                  <line x1="-4" y1="-4" x2="18" y2="22" stroke="#ff6b6b" strokeWidth="1.2" />
                  <text x="22" y="14" fontSize="6" fill="var(--fg-3)" letterSpacing="1.2" fontFamily="monospace">MIC OFF</text>
                </g>

                <g transform="translate(490, 280)">
                  <rect x="0" y="0" width="22" height="14" rx="2" fill="none" stroke="var(--fg-3)" strokeWidth="0.7" />
                  <line x1="0" y1="4" x2="22" y2="4" stroke="var(--fg-3)" strokeWidth="0.5" />
                  <text x="-4" y="9" fontSize="6" fill="var(--fg-2)" textAnchor="end" letterSpacing="1" fontFamily="monospace">FRAMES · TEMP</text>
                </g>
              </svg>

              <div className="ed-tag ed-tag-tl">
                <span className="ed-tag-dot" />
                <span>ON-DEVICE</span>
              </div>
              <div className="ed-tag ed-tag-tr">
                <span>ZERO TELEMETRY</span>
              </div>
            </div>
          </div>

          <PrivacyLedger t={t} />
        </div>

        <div className="edge-pillars">
          {[
            { num: '01', title: 'Local-only inference', body: "The neural network runs on the user's device — phone, laptop, or embedded edge processor. Frames never leave." },
            { num: '02', title: 'No microphone, ever', body: 'The system requests no audio permission. There is no audio buffer to leak, subpoena, or transcribe.' },
            { num: '03', title: 'Ephemeral frame buffer', body: 'A short rolling window is held in RAM only — flushed every few seconds, never written to disk.' },
            { num: '04', title: 'Offline-capable', body: 'Works without a connection. No bandwidth tax. No outage tax. The model is the product.' },
          ].map((p, i) => (
            <div key={i} className="edge-pillar">
              <span className="edge-pillar-num">{p.num}</span>
              <div className="edge-pillar-body">
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
