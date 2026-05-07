'use client';
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const USE_CASES = [
  {
    id: 'security',
    cat: 'Active Surveillance',
    title: 'Security & Surveillance',
    body: 'Extract speech from silent CCTV footage for investigation purposes. Our model processes raw pixels to reconstruct dialogue without acoustic data.',
    color: '#4285F4',
    size: 'wide', // 2x1
    viz: 'radar'
  },
  {
    id: 'forensic',
    cat: 'Digital Evidence',
    title: 'Forensic Analysis',
    body: 'Analyse video evidence and reconstruct conversations from high-definition footage.',
    color: '#F4B400',
    size: 'small', // 1x1
    viz: 'magnifier'
  },
  {
    id: 'archives',
    cat: 'Historical Recovery',
    title: 'Historical Archives',
    body: 'Recover dialogue from silent films and historical footage without audio.',
    color: '#A142F4',
    size: 'small', // 1x1
    viz: 'reel'
  },
  {
    id: 'accessibility',
    cat: 'Inclusive Tech',
    title: 'Accessibility First',
    body: 'Providing a seamless communication layer for the deaf and hard of hearing community. Silent lip-reading turned into real-time text and synthesized voice.',
    color: '#34A853',
    size: 'tall', // 1x2
    viz: 'transcript'
  },
  {
    id: 'media',
    cat: 'Content Restoration',
    title: 'Media Recovery',
    body: 'Restore content from videos with corrupted or missing audio tracks.',
    color: '#EA4335',
    size: 'small', // 1x1
    viz: 'waves'
  },
  {
    id: 'monitoring',
    cat: 'Remote Intelligence',
    title: 'Remote Monitoring',
    body: 'Understand conversations from visual-only feeds in noisy environments.',
    color: '#00ACC1',
    size: 'small', // 1x1
    viz: 'pulse'
  },
];

function MicroViz({ type, color }: { type: string; color: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (type === 'radar') {
        gsap.to('.radar-sweep', {
          rotate: 360,
          duration: 4,
          repeat: -1,
          ease: 'none'
        });
        gsap.to('.radar-dot', {
          opacity: 0,
          duration: 1,
          repeat: -1,
          stagger: 0.5,
          yoyo: true
        });
      } else if (type === 'transcript') {
        gsap.to('.ts-line', {
          y: -100,
          duration: 10,
          repeat: -1,
          ease: 'none'
        });
      } else if (type === 'pulse') {
        gsap.to('.pulse-ring', {
          scale: 3,
          opacity: 0,
          duration: 2,
          repeat: -1,
          ease: 'power1.out',
          stagger: 0.6
        });
      } else if (type === 'waves') {
        gsap.to('.wave-bar', {
          height: '80%',
          duration: 0.4,
          repeat: -1,
          yoyo: true,
          stagger: 0.05,
          ease: 'sine.inOut'
        });
      }
    }, container);
    return () => ctx.revert();
  }, [type]);

  return (
    <div ref={container} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {type === 'radar' && (
        <div style={{ position: 'absolute', inset: '20px', borderRadius: '50%', border: `1px solid ${color}20` }}>
          <div className="radar-sweep" style={{ position: 'absolute', inset: 0, background: `conic-gradient(from 0deg, ${color}40, transparent 90deg)`, borderRadius: '50%' }} />
          <div className="radar-dot" style={{ position: 'absolute', top: '30%', left: '40%', width: '4px', height: '4px', background: color, borderRadius: '50%', boxShadow: `0 0 10px ${color}` }} />
          <div className="radar-dot" style={{ position: 'absolute', top: '60%', left: '70%', width: '4px', height: '4px', background: color, borderRadius: '50%', boxShadow: `0 0 10px ${color}` }} />
        </div>
      )}
      {type === 'transcript' && (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="ts-line" style={{ height: '4px', background: i % 3 === 0 ? color : 'var(--fg-4)', width: `${40 + Math.random() * 50}%`, borderRadius: '2px', opacity: 0.3 }} />
          ))}
        </div>
      )}
      {type === 'pulse' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '8px', height: '8px', background: color, borderRadius: '50%' }} />
          <div className="pulse-ring" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', border: `1px solid ${color}`, borderRadius: '50%' }} />
          <div className="pulse-ring" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', border: `1px solid ${color}`, borderRadius: '50%' }} />
        </div>
      )}
      {type === 'waves' && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', padding: '20px', height: '100%' }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="wave-bar" style={{ flex: 1, background: color, height: '20%', borderRadius: '1px', opacity: 0.4 }} />
          ))}
        </div>
      )}
      {type === 'reel' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
           <div style={{ width: '40px', height: '40px', border: `2px dashed ${color}`, borderRadius: '50%', animation: 'spin 10s linear infinite' }} />
        </div>
      )}
      {type === 'magnifier' && (
        <div style={{ padding: '15px' }}>
          <div style={{ width: '100%', height: '100%', border: `1px solid ${color}30`, borderRadius: '4px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '20%', left: '20%', width: '30px', height: '30px', border: `1px solid ${color}`, borderRadius: '50%', background: `${color}10` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function UseCases() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(headerRef.current, {
        y: 40, opacity: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: headerRef.current, start: 'top 85%' }
      });

      cardsRef.current.forEach((card, i) => {
        if (!card) return;
        gsap.from(card, {
          scale: 0.9, opacity: 0, duration: 0.8, delay: i * 0.05, ease: 'power2.out',
          scrollTrigger: { trigger: card, start: 'top 90%' }
        });
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="usecases" id="use-cases" style={{ background: 'var(--bg-0)', padding: '160px var(--pad-x)', position: 'relative' }}>
      <div ref={headerRef} style={{ textAlign: 'center', marginBottom: '100px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '24px' }}>
          Active Monitoring
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 8vw, 64px)', fontWeight: 500, color: 'var(--fg-0)', marginBottom: '24px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          Built for every <em style={{ color: 'var(--accent)', fontWeight: 400 }}>possibility.</em>
        </h2>
      </div>

      <div className="uc-bento" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gridAutoRows: 'minmax(280px, auto)',
        gap: '16px',
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {USE_CASES.map((c, i) => (
          <article 
            key={c.id} 
            ref={el => { cardsRef.current[i] = el; }}
            style={{
              gridColumn: c.size === 'wide' ? 'span 2' : 'span 1',
              gridRow: c.size === 'tall' ? 'span 2' : 'span 1',
              background: 'linear-gradient(145deg, rgba(25, 25, 35, 0.4), rgba(10, 10, 15, 0.6))',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '24px',
              padding: '32px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'default'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `${c.color}60`;
              e.currentTarget.style.background = 'linear-gradient(145deg, rgba(35, 35, 55, 0.6), rgba(10, 10, 15, 0.8))';
              e.currentTarget.style.transform = 'scale(1.01) translateY(-4px)';
              e.currentTarget.style.boxShadow = `0 30px 60px -20px ${c.color}20`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.background = 'linear-gradient(145deg, rgba(25, 25, 35, 0.4), rgba(10, 10, 15, 0.6))';
              e.currentTarget.style.transform = 'scale(1) translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ position: 'absolute', top: 0, right: 0, width: '150px', height: '150px', opacity: 0.6 }}>
              <MicroViz type={c.viz} color={c.color} />
            </div>

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: c.color, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '12px' }}>
                {c.cat}
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: c.size === 'wide' ? '28px' : '22px', fontWeight: 600, color: 'var(--fg-0)', marginBottom: '16px', letterSpacing: '-0.01em' }}>
                {c.title}
              </h3>
            </div>

            <p style={{ position: 'relative', zIndex: 1, color: 'var(--fg-2)', fontSize: '15px', lineHeight: 1.6, maxWidth: '280px' }}>
              {c.body}
            </p>

            <div style={{ position: 'absolute', bottom: '-20px', right: '-20px', width: '100px', height: '100px', background: c.color, filter: 'blur(60px)', opacity: 0.05, pointerEvents: 'none' }} />
          </article>
        ))}
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 1000px) {
          .uc-bento { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .uc-bento { grid-template-columns: 1fr !important; }
          .uc-bento > article { grid-column: span 1 !important; grid-row: span 1 !important; }
        }
      `}</style>
    </section>
  );
}
