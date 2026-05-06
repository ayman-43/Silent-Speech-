export default function Vision() {
  return (
    <section className="vision" id="vision">
      <div className="vision-inner">
        <div className="vision-eyebrow">
          <span className="eyebrow-line" />
          <span>MANIFESTO · 2026</span>
          <span className="eyebrow-line" />
        </div>

        <h2 className="vision-title">
          <span>For most of recorded history,</span>
          <span>communication required <em>noise</em>.</span>
          <span>The next form of it</span>
          <span className="vision-accent">won&apos;t.</span>
        </h2>

        <div className="vision-cols">
          <p>
            Speech is just one of many ways humans signal intent. It happens to be the loudest. SilentSpeak AI is a wager that
            the future of human–machine interaction will be quieter, more deliberate, and more private than what we have today.
          </p>
          <p>
            We are building toward a world where you can think a sentence, shape it with your mouth, and have it understood —
            without lifting a finger, without making a sound, without sending anything anywhere it shouldn&apos;t go.
          </p>
        </div>

        <div className="vision-principles">
          {[
            ['Quieter', 'No audio surface area'],
            ['Smarter', 'Sequence understanding, not pattern match'],
            ['Private', 'Inference is local. Permanent.'],
            ['Accessible', 'A voice for those without one'],
            ['Human', 'Communication, not surveillance'],
          ].map(([k, v], i) => (
            <div key={i} className="vp">
              <span className="vp-num">0{i + 1}</span>
              <span className="vp-key">{k}</span>
              <span className="vp-val">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
