const taglines = [
  'Speak Without Sound.',
  'Your Lips Are Enough.',
  'Communication Beyond Voice.',
  'Silence, Understood.',
  'Where Vision Becomes Speech.',
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-marquee">
        <div className="footer-marquee-track">
          {[...taglines, ...taglines].map((t, i) => (
            <span key={i} className="footer-tag">
              <em>{t}</em>
              <span className="footer-tag-dot">●</span>
            </span>
          ))}
        </div>
      </div>

      <div className="footer-cols">
        <div className="footer-col footer-brand">
          <div className="nav-mark">
            <span className="nav-dot" />
            <span className="nav-name">SilentSpeak<span className="nav-tld">.ai</span></span>
          </div>
          <p>Visual speech recognition, on the edge.<br />Founded 2026.</p>
        </div>

        <div className="footer-col">
          <h4>Product</h4>
          <a href="#">Live demo</a>
          <a href="#">SDK</a>
          <a href="#">Model card</a>
          <a href="#">Changelog</a>
        </div>

        <div className="footer-col">
          <h4>Privacy</h4>
          <a href="#">Architecture</a>
          <a href="#">Local-only mode</a>
          <a href="#">Audit trail</a>
          <a href="#">Threat model</a>
        </div>

        <div className="footer-col">
          <h4>Research</h4>
          <a href="#">VSR-Bench 2026</a>
          <a href="#">Papers</a>
          <a href="#">Open weights</a>
          <a href="#">Citations</a>
        </div>
      </div>

      <div className="footer-base">
        <span className="cta-mono">© 2026 SilentSpeak Labs</span>
        <span className="cta-mono">Edge AI · Visual Speech Recognition</span>
        <span className="cta-mono">v3.2 · model integrity 0xa84f...c901</span>
      </div>
    </footer>
  );
}
