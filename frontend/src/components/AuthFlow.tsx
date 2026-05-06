'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTilt } from './useTilt';
import { useRouter } from 'next/navigation';
import Aurora from './Aurora';
import { signIn } from 'next-auth/react';

import { useSession, signOut } from 'next-auth/react';

export default function AuthFlow({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const { data: session } = useSession();
  const [mode, setMode] = useState(initialMode);
  const tilt = useTilt(10);
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push('/');
    }
  }, [session, router]);

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/' });
  };

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
          style={{ ...tilt.style, width: '100%', maxWidth: '440px', height: '680px', position: 'relative' }}
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
              position: 'absolute', inset: 0, padding: '40px 32px', 
              backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(0deg)',
              display: 'flex', flexDirection: 'column'
            }}>
              <div className="cta-corner cta-tl" />
              <div className="cta-corner cta-tr" />
              <div className="cta-corner cta-bl" />
              <div className="cta-corner cta-br" />
              
              <div>
                <div className="cta-status" style={{ marginBottom: '24px' }}>
                  <span className="cta-status-dot" />
                  <span>Welcome Back</span>
                </div>

                <h1 className="cta-title" style={{ fontSize: '32px', marginBottom: '8px' }}>
                  Login to <em>SilentSpeech</em>
                </h1>
                <p className="cta-sub" style={{ marginBottom: '24px', fontSize: '15px' }}>
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--fg-4)' }} />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', textTransform: 'uppercase' }}>or</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--fg-4)' }} />
                  </div>

                  <button 
                    type="button" 
                    className="btn btn-ghost" 
                    onClick={handleGoogleSignIn}
                    style={{ 
                      width: '100%', 
                      justifyContent: 'center', 
                      padding: '12px', 
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--fg-4)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
                    </svg>
                    <span style={{ fontSize: '14px', marginLeft: '12px' }}>Continue with Google</span>
                  </button>
                </form>

                <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--fg-4)', fontSize: '13px', color: 'var(--fg-2)' }}>
                  Don't have an account? <button onClick={toggleMode} style={{ color: 'var(--fg-0)', textDecoration: 'underline' }}>Sign up here</button>
                </div>
              </div>
            </div>

            {/* --- BACK FACE (SIGNUP) --- */}
            <div className="cta-frame" style={{ 
              position: 'absolute', inset: 0, padding: '40px 32px', 
              backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)',
              display: 'flex', flexDirection: 'column'
            }}>
              <div className="cta-corner cta-tl" />
              <div className="cta-corner cta-tr" />
              <div className="cta-corner cta-bl" />
              <div className="cta-corner cta-br" />
              
              <div>
                <div className="cta-status" style={{ marginBottom: '16px' }}>
                  <span className="cta-status-dot" />
                  <span>Join the Preview</span>
                </div>

                <h1 className="cta-title" style={{ fontSize: '32px', marginBottom: '8px' }}>
                  Create an <em>Account</em>
                </h1>
                <p className="cta-sub" style={{ marginBottom: '16px', fontSize: '15px' }}>
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--fg-4)' }} />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', textTransform: 'uppercase' }}>or</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--fg-4)' }} />
                  </div>

                  <button 
                    type="button" 
                    className="btn btn-ghost" 
                    onClick={handleGoogleSignIn}
                    style={{ 
                      width: '100%', 
                      justifyContent: 'center', 
                      padding: '12px', 
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--fg-4)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
                    </svg>
                    <span style={{ fontSize: '14px', marginLeft: '12px' }}>Sign up with Google</span>
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
