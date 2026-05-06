const USE_CASES = [
  {
    id: 'access',
    cat: 'Accessibility',
    title: 'A voice for those without one.',
    body: 'For people living with ALS, vocal-cord paralysis, post-laryngectomy recovery, or speech-affecting conditions — speak by mouthing.',
    metric: '70M+',
    metricLabel: 'people with speech disorders worldwide',
  },
  {
    id: 'medical',
    cat: 'Recovery',
    title: 'Speak through the silence.',
    body: 'Surgical recovery, intubation, laryngitis. SilentSpeak gives a temporary voice when the throat needs to rest.',
    metric: '14 days',
    metricLabel: 'avg. post-op vocal rest',
  },
  {
    id: 'public',
    cat: 'Discreet comms',
    title: 'Quiet by design.',
    body: 'Libraries, hospitals, classrooms, late-night calls. Communicate without disturbing anyone in the room.',
    metric: '0 dB',
    metricLabel: 'acoustic footprint',
  },
  {
    id: 'tactical',
    cat: 'Defense',
    title: 'Silent, encrypted, on-mission.',
    body: 'Covert and noise-sensitive operations. No audio signature. No spectrum to jam. Visual-only, end-to-end.',
    metric: 'air-gapped',
    metricLabel: 'no network required',
  },
  {
    id: 'wear',
    cat: 'Wearables · AR/VR',
    title: 'The next input modality.',
    body: 'Smart glasses, AR headsets, ambient computing. Subvocal control without microphones or controllers.',
    metric: '<40ms',
    metricLabel: 'end-to-end latency',
  },
  {
    id: 'hci',
    cat: 'Next-gen HCI',
    title: 'Beyond keyboards.',
    body: 'A new layer of human-computer interaction. Intent recognition without typing, tapping, or speaking aloud.',
    metric: 'visual',
    metricLabel: 'intent recognition',
  },
];

function UseCaseScene({ id }: { id: string }) {
  return (
    <div className="uc-scene">
      <svg viewBox="0 0 200 100" preserveAspectRatio="none">
        {id === 'access' && (
          <g>
            {Array.from({ length: 18 }).map((_, i) => {
              const h = 20 + Math.abs(Math.sin(i * 0.5)) * 50;
              return <rect key={i} x={10 + i * 10} y={50 - h / 2} width="3" height={h} fill="var(--accent)" opacity={0.3 + (i / 18) * 0.7} />;
            })}
            <text x="100" y="92" fontSize="6" fill="var(--fg-2)" textAnchor="middle" letterSpacing="2" fontFamily="monospace">YOUR VOICE — RESTORED</text>
          </g>
        )}
        {id === 'medical' && (
          <g>
            <path d="M0 50 L30 50 L40 30 L50 70 L60 50 L100 50" fill="none" stroke="var(--accent)" strokeWidth="1.2" opacity="0.7" />
            <line x1="100" y1="50" x2="200" y2="50" stroke="var(--fg-3)" strokeWidth="0.5" strokeDasharray="2 2" />
            <text x="150" y="38" fontSize="7" fill="var(--accent)" textAnchor="middle" fontFamily="monospace" letterSpacing="1">&quot;thank you&quot;</text>
          </g>
        )}
        {id === 'public' && (
          <g>
            <circle cx="60" cy="50" r="10" fill="none" stroke="var(--fg-2)" strokeWidth="0.6" opacity="0.5" />
            <circle cx="60" cy="50" r="20" fill="none" stroke="var(--fg-2)" strokeWidth="0.5" opacity="0.3" />
            <circle cx="60" cy="50" r="30" fill="none" stroke="var(--fg-2)" strokeWidth="0.4" opacity="0.15" />
            <line x1="40" y1="30" x2="80" y2="70" stroke="#ff6b6b" strokeWidth="1.5" />
            <text x="140" y="48" fontSize="7" fill="var(--accent)" textAnchor="middle" fontFamily="monospace" letterSpacing="1.5">SILENT</text>
            <text x="140" y="60" fontSize="7" fill="var(--accent)" textAnchor="middle" fontFamily="monospace" letterSpacing="1.5">UNDERSTOOD</text>
          </g>
        )}
        {id === 'tactical' && (
          <g>
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="100" stroke="var(--fg-3)" strokeWidth="0.3" opacity="0.4" />
            ))}
            {Array.from({ length: 5 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 25} x2="200" y2={i * 25} stroke="var(--fg-3)" strokeWidth="0.3" opacity="0.4" />
            ))}
            <circle cx="60" cy="60" r="3" fill="var(--accent)" />
            <circle cx="60" cy="60" r="8" fill="none" stroke="var(--accent)" strokeWidth="0.6" opacity="0.6" />
            <line x1="60" y1="60" x2="140" y2="40" stroke="var(--accent)" strokeWidth="0.8" strokeDasharray="3 2" />
            <circle cx="140" cy="40" r="2" fill="none" stroke="var(--accent)" strokeWidth="1" />
            <text x="148" y="42" fontSize="6" fill="var(--accent)" fontFamily="monospace" letterSpacing="1">WP-07</text>
          </g>
        )}
        {id === 'wear' && (
          <g>
            <circle cx="65" cy="50" r="22" fill="none" stroke="var(--fg-2)" strokeWidth="0.8" />
            <circle cx="135" cy="50" r="22" fill="none" stroke="var(--fg-2)" strokeWidth="0.8" />
            <line x1="87" y1="50" x2="113" y2="50" stroke="var(--fg-2)" strokeWidth="0.8" />
            <line x1="43" y1="50" x2="20" y2="46" stroke="var(--fg-2)" strokeWidth="0.8" />
            <line x1="157" y1="50" x2="180" y2="46" stroke="var(--fg-2)" strokeWidth="0.8" />
            <circle cx="65" cy="50" r="2" fill="var(--accent)" />
            <circle cx="135" cy="50" r="2" fill="var(--accent)" />
            <text x="100" y="92" fontSize="6" fill="var(--fg-2)" textAnchor="middle" letterSpacing="2" fontFamily="monospace">SUBVOCAL · AR</text>
          </g>
        )}
        {id === 'hci' && (
          <g>
            {Array.from({ length: 10 }).map((_, i) => (
              <rect key={`k${i}`} x={5 + i * 9} y="65" width="7" height="7" rx="1" fill="none" stroke="var(--fg-3)" strokeWidth="0.5" opacity="0.4" />
            ))}
            <line x1="50" y1="55" x2="150" y2="30" stroke="var(--accent)" strokeWidth="0.6" strokeDasharray="2 2" />
            <text x="150" y="22" fontSize="7" fill="var(--accent)" fontFamily="monospace" letterSpacing="1">intent</text>
            <text x="100" y="92" fontSize="6" fill="var(--fg-3)" textAnchor="middle" letterSpacing="2" fontFamily="monospace">KEYBOARD → INTENT</text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default function UseCases() {
  return (
    <section className="usecases" id="use-cases">
      <div className="sh">
        <div className="sh-eyebrow">
          <span className="sh-eyebrow-line" />
          <span>USE CASES</span>
        </div>
        <h2 className="sh-title">Six places<br /><em>silence becomes language.</em></h2>
        <p className="sh-sub">From accessibility to defense — the same model, the same quietness, the same on-device guarantee.</p>
      </div>

      <div className="uc-grid">
        {USE_CASES.map((c, i) => (
          <article key={c.id} className="uc-card" style={{ ['--i' as string]: i }}>
            <div className="uc-card-frame">
              <div className="uc-corner uc-tl" />
              <div className="uc-corner uc-tr" />
              <div className="uc-corner uc-bl" />
              <div className="uc-corner uc-br" />
              <div className="uc-cat">
                <span className="uc-cat-num">0{i + 1}</span>
                <span className="uc-cat-text">{c.cat}</span>
              </div>
              <UseCaseScene id={c.id} />
              <h3 className="uc-title">{c.title}</h3>
              <p className="uc-body">{c.body}</p>
              <div className="uc-metric">
                <span className="uc-metric-num">{c.metric}</span>
                <span className="uc-metric-label">{c.metricLabel}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
