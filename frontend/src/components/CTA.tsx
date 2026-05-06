'use client';
import { useState } from 'react';

export default function CTA() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.includes('@')) setSubmitted(true);
  };

  return (
    <section className="cta">
      <div className="cta-frame">
        <div className="cta-corner cta-tl" />
        <div className="cta-corner cta-tr" />
        <div className="cta-corner cta-bl" />
        <div className="cta-corner cta-br" />

        <div className="cta-status">
          <span className="cta-status-dot" />
          <span className="cta-mono">PRIVATE PREVIEW · WAVE 02</span>
        </div>

        <h2 className="cta-title">
          Be early to <em>silent computing.</em>
        </h2>

        <p className="cta-sub">
          We&apos;re sending the SDK to a small group of researchers, accessibility teams, and product builders.
          Join the waitlist for an early invitation.
        </p>

        {!submitted ? (
          <form className="cta-form" onSubmit={onSubmit}>
            <div className="cta-input-wrap">
              <span className="cta-input-icon">@</span>
              <input
                type="email"
                placeholder="you@institution.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="cta-input"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary cta-submit">
              <span>Request access</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8m0 0L7 3m4 4l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        ) : (
          <div className="cta-confirm">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="10" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 11l3.5 3.5L16 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <strong>You&apos;re on the list.</strong>
              <span>We&apos;ll reach out from a real human, not a bot.</span>
            </div>
          </div>
        )}

        <div className="cta-meta">
          <span className="cta-mono">no spam</span>
          <span className="cta-sep">·</span>
          <span className="cta-mono">no audio data</span>
          <span className="cta-sep">·</span>
          <span className="cta-mono">unsubscribe anytime</span>
        </div>
      </div>
    </section>
  );
}
