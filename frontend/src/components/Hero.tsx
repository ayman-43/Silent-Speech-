'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import LiquidEther from './LiquidEther';
import Shuffle from './Shuffle';

const BARS = 64;

function WaveformViz({ phase, time }: { phase: number; time: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate rotation, max 15 degrees
    const rotateX = ((y - centerY) / centerY) * -15;
    const rotateY = ((x - centerX) / centerX) * 15;
    
    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setRotate({ x: 0, y: 0 });
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  return (
    <div 
      className="wf"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: "1000px" }}
    >
      <div 
        className="wf-frame"
        style={{
          transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
          transition: isHovering ? "none" : "transform 0.5s ease",
          transformStyle: "preserve-3d"
        }}
      >
        <div className="wf-corner wf-corner-tl" style={{ transform: isHovering ? "translateZ(30px)" : "translateZ(0)", transition: "transform 0.3s ease" }} />
        <div className="wf-corner wf-corner-tr" style={{ transform: isHovering ? "translateZ(30px)" : "translateZ(0)", transition: "transform 0.3s ease" }} />
        <div className="wf-corner wf-corner-bl" style={{ transform: isHovering ? "translateZ(30px)" : "translateZ(0)", transition: "transform 0.3s ease" }} />
        <div className="wf-corner wf-corner-br" style={{ transform: isHovering ? "translateZ(30px)" : "translateZ(0)", transition: "transform 0.3s ease" }} />

        <div className="wf-stage" style={{ transform: isHovering ? "translateZ(60px)" : "translateZ(0)", transition: "transform 0.3s ease", transformStyle: "preserve-3d" }}>
          {/* Phase 0: sound wave */}
          <div className={`wf-layer wf-wave${phase === 0 ? ' on' : ''}`} style={{ transformStyle: "preserve-3d" }}>
            <div className="wf-label" style={{ transform: isHovering ? "translateZ(20px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
              <span className="wf-label-dot" />
              <span>AUDIO INPUT — TRADITIONAL</span>
            </div>
            <div className="wf-bars" style={{ transform: isHovering ? "translateZ(40px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
              {Array.from({ length: BARS }).map((_, i) => {
                const amp = Math.abs(Math.sin(i * 0.4 + time * 4) * Math.cos(i * 0.13 + time * 2));
                return (
                  <span
                    key={i}
                    className="wf-bar"
                    style={{ height: `${10 + amp * 90}%`, opacity: 0.3 + amp * 0.7 }}
                  />
                );
              })}
            </div>
            <div className="wf-foot" style={{ transform: isHovering ? "translateZ(10px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
              <span className="wf-tick">−2.4s</span>
              <span className="wf-tick">−1.2s</span>
              <span className="wf-tick">0.0s</span>
            </div>
          </div>

          {/* Phase 1: silence */}
          <div className={`wf-layer wf-silence${phase === 1 ? ' on' : ''}`} style={{ transformStyle: "preserve-3d" }}>
            <div className="wf-label" style={{ transform: isHovering ? "translateZ(20px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
              <span className="wf-label-dot wf-label-dot-mute" />
              <span>NO AUDIO REQUIRED</span>
            </div>
            <div className="wf-flatline" style={{ transform: isHovering ? "translateZ(40px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
              <svg viewBox="0 0 800 100" preserveAspectRatio="none">
                <line x1="0" y1="50" x2="800" y2="50" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />
              </svg>
              <div className="wf-silence-text">silence</div>
            </div>
            <div className="wf-foot" style={{ transform: isHovering ? "translateZ(10px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
              <span className="wf-tick">microphone — off</span>
              <span className="wf-tick wf-tick-accent">vision — active</span>
            </div>
          </div>

          {/* Phase 2: text emerging */}
          <div className={`wf-layer wf-text${phase === 2 ? ' on' : ''}`} style={{ transformStyle: "preserve-3d" }}>
            <div className="wf-label" style={{ transform: isHovering ? "translateZ(20px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
              <span className="wf-label-dot wf-label-dot-on" />
              <span>VISUAL INFERENCE — DECODED</span>
            </div>
            <div className="wf-words" style={{ transform: isHovering ? "translateZ(40px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
              <span className="wf-word" style={{ ['--d' as string]: '0ms' }}>communication</span>
              <span className="wf-word" style={{ ['--d' as string]: '120ms' }}>beyond</span>
              <span className="wf-word wf-word-accent" style={{ ['--d' as string]: '240ms' }}>voice</span>
              <span className="wf-cursor" />
            </div>
            <div className="wf-foot" style={{ transform: isHovering ? "translateZ(10px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
              <span className="wf-tick">confidence 0.97</span>
              <span className="wf-tick">38ms · on-device</span>
            </div>
          </div>
        </div>

        <div className="wf-phases" style={{ transform: isHovering ? "translateZ(30px)" : "translateZ(0)", transition: "transform 0.3s ease" }}>
          <span className={`wf-phase${phase === 0 ? ' on' : ''}`}>01 &nbsp; sound</span>
          <span className={`wf-phase${phase === 1 ? ' on' : ''}`}>02 &nbsp; silence</span>
          <span className={`wf-phase${phase === 2 ? ' on' : ''}`}>03 &nbsp; meaning</span>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  const [phase, setPhase] = useState(0);
  const [time, setTime] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      setTime(t);
      const cycle = t % 9;
      if (cycle < 2.5) setPhase(0);
      else if (cycle < 4.5) setPhase(1);
      else setPhase(2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="hero">
      <div className="hero-liquid">
        <LiquidEther
          colors={['#5227FF', '#7B6CF6', '#B497CF']}
          autoDemo={true}
          autoSpeed={0.5}
          autoIntensity={2.2}
          resolution={0.5}
          mouseForce={20}
          cursorSize={100}
        />
      </div>
      <div className="hero-bg">
        <div className="hero-grain" />
        <div className="hero-glow" />
      </div>

      <nav className="nav">
        <div className="nav-mark">
          <span className="nav-dot" />
          <span className="nav-name">SilentSpeech</span>
        </div>
        <div className="nav-links">
          <a href="#demo">Demo</a>
          <a href="#privacy">Edge AI</a>
          <a href="#use-cases">Use cases</a>
          <a href="#vision">Vision</a>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <a href="/dashboard" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px', minHeight: 'auto' }}>
            <span>Try Demo</span>
          </a>
        </div>
      </nav>

      <div className="hero-inner">
        <div className="hero-eyebrow">
          <span className="eyebrow-line" />
          <span className="eyebrow-text">VISUAL SPEECH RECOGNITION · EDGE AI</span>
          <span className="eyebrow-line" />
        </div>

        <h1 className="hero-title">
          <Shuffle
            text="Communication"
            tag="span"
            className="hero-title-line"
            shuffleDirection="up"
            animationMode="evenodd"
            stagger={0.022}
            duration={0.42}
            ease="power3.out"
            shuffleTimes={1}
            triggerOnce={true}
            triggerOnHover={true}
            textAlign="center"
            threshold={0}
            rootMargin="0px"
          />
          <Shuffle
            text="beyond voice."
            tag="span"
            className="hero-title-line hero-title-line-accent"
            shuffleDirection="up"
            animationMode="evenodd"
            stagger={0.022}
            duration={0.42}
            ease="power3.out"
            shuffleTimes={1}
            triggerOnce={true}
            triggerOnHover={true}
            textAlign="center"
            threshold={0}
            rootMargin="0px"
          />
        </h1>

        <p className="hero-sub">
          SilentSpeak AI reads silent lip movements through a single camera and turns them into language —
          on-device, in real time. No microphone. No cloud. No noise.
        </p>

        <div className="hero-actions">
          <a href="#demo" className="btn btn-primary">
            <span>See it in motion</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8m0 0L7 3m4 4l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#vision" className="btn btn-ghost">
            <span>Read the vision</span>
          </a>
        </div>

        <div className="hero-viz">
          <WaveformViz phase={phase} time={time} />
        </div>

        <div className="hero-meta">
          <div className="meta-item">
            <span className="meta-num">0</span>
            <span className="meta-label">audio recorded</span>
          </div>
          <div className="meta-divider" />
          <div className="meta-item">
            <span className="meta-num">~38<span className="meta-unit">ms</span></span>
            <span className="meta-label">inference latency</span>
          </div>
          <div className="meta-divider" />
          <div className="meta-item">
            <span className="meta-num">100<span className="meta-unit">%</span></span>
            <span className="meta-label">on-device</span>
          </div>
          <div className="meta-divider" />
          <div className="meta-item">
            <span className="meta-num">12<span className="meta-unit">k+</span></span>
            <span className="meta-label">phoneme patterns</span>
          </div>
        </div>
      </div>

      <div className="hero-scroll">
        <span className="scroll-label">Scroll</span>
        <span className="scroll-line" />
      </div>
    </section>
  );
}
