'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTilt } from './useTilt';
import { useRouter } from 'next/navigation';
import Aurora from './Aurora';

export default function AuthFlow({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const [mode, setMode] = useState(initialMode);
  const tilt = useTilt(10);
  const router = useRouter();

  const isFlipped = mode === 'signup';

  const toggleMode = () => {
    const newMode = isFlipped ? 'login' : 'signup';
    setMode(newMode);
    // Optionally update the URL without refreshing
    window.history.pushState(null, '', `/${newMode}`);
  };

  return (
    <div className="auth-flow" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '600px', zIndex: 1, pointerEvents: 'none', opacity: 0.6, maskImage: 'linear-gradient(to bottom, black, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)' }}>
        <Aurora colorStops={['#b8d8f8', '#5227FF', '#060608']} blend={0.5} amplitude={1.2} speed={0.5} />
      </div>

      <nav className="nav" style={{ position: 'absolute', top: 0, width: '100%', zIndex: 10 }}>
        <div className="nav-mark">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="nav-dot" />
            <span className="nav-name">SilentSpeech</span>
          </Link>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn btn-ghost" 
            style={{ padding: '8px 16px', fontSize: '12px', minHeight: 'auto' }}
            onClick={toggleMode}
          >
            <span>{isFlipped ? 'Login' : 'Sign Up'}</span>
          </button>
        </div>
      </nav>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 24px 40px', position: 'relative', zIndex: 3, perspective: '2000px' }}>
        
        {/* Tilt Container */}
        <div 
          ref={tilt.ref}
          onMouseMove={tilt.handleMouseMove}
          onMouseEnter={tilt.handleMouseEnter}
          onMouseLeave={tilt.handleMouseLeave}
          style={{ ...tilt.style, width: '100%', maxWidth: '440px', height: '620px', position: 'relative' }}
        >
          {/* Flip Container */}
          <div 
            style={{ 
              width: '100%', 
              height: '100%', 
              position: 'relative',
              transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* --- FRONT FACE (LOGIN) --- */}
            <div className="cta-frame" style={{ 
              position: 'absolute', inset: 0, padding: '48px 32px', 
              backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(0deg)',
              display: 'flex', flexDirection: 'column'
            }}>
              <div className="cta-corner cta-tl" />
              <div className="cta-corner cta-tr" />
              <div className="cta-corner cta-bl" />
              <div className="cta-corner cta-br" />
              
              <div>
                <div className="cta-status" style={{ marginBottom: '32px' }}>
                  <span className="cta-status-dot" />
                  <span>Welcome Back</span>
                </div>

                <h1 className="cta-title" style={{ fontSize: '32px', marginBottom: '8px' }}>
                  Login to <em>SilentSpeech</em>
                </h1>
                <p className="cta-sub" style={{ marginBottom: '32px', fontSize: '15px' }}>
                  Continue your journey with visual speech recognition.
                </p>

                <form className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }} onSubmit={(e) => e.preventDefault()}>
                  <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--fg-2)', letterSpacing: '0.05em', textTransform: 'uppercase', paddingLeft: '16px' }}>Email Address</label>
                    <div className="cta-input-wrap">
                      <span className="cta-input-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                      </span>
                      <input type="email" className="cta-input" placeholder="you@example.com" required />
                    </div>
                  </div>

                  <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--fg-2)', letterSpacing: '0.05em', textTransform: 'uppercase', paddingLeft: '16px' }}>Password</label>
                    <div className="cta-input-wrap">
                      <span className="cta-input-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                      </span>
                      <input type="password" className="cta-input" placeholder="••••••••" required />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                    <a href="#" style={{ fontSize: '12px', color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>Forgot password?</a>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px', padding: '16px' }}>
                    <span>Sign In</span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7h8m0 0L7 3m4 4l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </form>

                <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--fg-4)', fontSize: '13px', color: 'var(--fg-2)' }}>
                  Don't have an account? <button onClick={toggleMode} style={{ color: 'var(--fg-0)', textDecoration: 'underline' }}>Sign up here</button>
                </div>
              </div>
            </div>

            {/* --- BACK FACE (SIGNUP) --- */}
            <div className="cta-frame" style={{ 
              position: 'absolute', inset: 0, padding: '48px 32px', 
              backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)',
              display: 'flex', flexDirection: 'column'
            }}>
              <div className="cta-corner cta-tl" />
              <div className="cta-corner cta-tr" />
              <div className="cta-corner cta-bl" />
              <div className="cta-corner cta-br" />
              
              <div>
                <div className="cta-status" style={{ marginBottom: '24px' }}>
                  <span className="cta-status-dot" />
                  <span>Join the Preview</span>
                </div>

                <h1 className="cta-title" style={{ fontSize: '32px', marginBottom: '8px' }}>
                  Create an <em>Account</em>
                </h1>
                <p className="cta-sub" style={{ marginBottom: '24px', fontSize: '15px' }}>
                  Experience the future of silent communication.
                </p>

                <form className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }} onSubmit={(e) => e.preventDefault()}>
                  <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--fg-2)', letterSpacing: '0.05em', textTransform: 'uppercase', paddingLeft: '16px' }}>Full Name</label>
                    <div className="cta-input-wrap">
                      <span className="cta-input-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      </span>
                      <input type="text" className="cta-input" placeholder="John Doe" required />
                    </div>
                  </div>

                  <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--fg-2)', letterSpacing: '0.05em', textTransform: 'uppercase', paddingLeft: '16px' }}>Email Address</label>
                    <div className="cta-input-wrap">
                      <span className="cta-input-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                      </span>
                      <input type="email" className="cta-input" placeholder="you@example.com" required />
                    </div>
                  </div>

                  <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--fg-2)', letterSpacing: '0.05em', textTransform: 'uppercase', paddingLeft: '16px' }}>Password</label>
                    <div className="cta-input-wrap">
                      <span className="cta-input-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                      </span>
                      <input type="password" className="cta-input" placeholder="••••••••" required minLength={8} />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px', padding: '16px' }}>
                    <span>Create Account</span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7h8m0 0L7 3m4 4l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </form>

                <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--fg-4)', fontSize: '13px', color: 'var(--fg-2)' }}>
                  Already have an account? <button onClick={toggleMode} style={{ color: 'var(--fg-0)', textDecoration: 'underline' }}>Login here</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      
      <div className="hero-bg" style={{ position: 'fixed', zIndex: 1, pointerEvents: 'none' }}>
        <div className="hero-grain" />
        <div className="hero-glow" style={{ top: '50%', left: '50%' }} />
      </div>
    </div>
  );
}
