'use client';
import { useRef, useEffect, useState, useCallback } from 'react';

interface Props {
  wsReady: boolean;
  onFrame: (buf: ArrayBuffer) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onBack: () => void;
}

function Corner({ v, h }: { v: 'top' | 'bottom'; h: 'left' | 'right' }) {
  return (
    <span style={{
      position: 'absolute', zIndex: 10, width: 16, height: 16,
      borderTop: v === 'top' ? '2px solid var(--accent)' : 'none',
      borderBottom: v === 'bottom' ? '2px solid var(--accent)' : 'none',
      borderLeft: h === 'left' ? '2px solid var(--accent)' : 'none',
      borderRight: h === 'right' ? '2px solid var(--accent)' : 'none',
      top: v === 'top' ? 12 : 'auto',
      bottom: v === 'bottom' ? 12 : 'auto',
      left: h === 'left' ? 12 : 'auto',
      right: h === 'right' ? 12 : 'auto',
      opacity: 0.75,
    }} />
  );
}

export default function WebcamCapture({ wsReady, onFrame, onStartRecording, onStopRecording, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasStream, setHasStream] = useState(false);
  const [recording, setRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [permErr, setPermErr] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, frameRate: 25 }, audio: false })
      .then(s => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setHasStream(true);
      })
      .catch(err => setPermErr(err.message ?? 'Camera permission denied'));

    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  const startRecording = useCallback(() => {
    if (!hasStream || !wsReady) return;
    setRecording(true);
    setFrameCount(0);
    onStartRecording();

    intervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 640, 480);
      canvas.toBlob(blob => {
        if (!blob) return;
        blob.arrayBuffer().then(buf => {
          onFrame(buf);
          setFrameCount(c => c + 1);
        });
      }, 'image/jpeg', 0.85);
    }, 1000 / 25);
  }, [hasStream, wsReady, onFrame, onStartRecording]);

  const stopRecording = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRecording(false);
    onStopRecording();
  }, [onStopRecording]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const canRecord = hasStream && wsReady && !recording;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 24, padding: 32,
    }}>
      {/* Eyebrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--fg-3)' }}>
        <span style={{ width: 24, height: 1, background: 'linear-gradient(90deg, transparent, var(--fg-4))' }} />
        LIVE WEBCAM INPUT
        <span style={{ width: 24, height: 1, background: 'linear-gradient(90deg, var(--fg-4), transparent)' }} />
      </div>

      {/* Video frame */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(180deg, var(--bg-2), var(--bg-1))',
        border: `1px solid ${recording ? 'rgba(255,79,79,0.4)' : 'var(--fg-4)'}`,
        borderRadius: 8, overflow: 'hidden',
        width: '100%', maxWidth: 600,
        aspectRatio: '4/3',
        transition: 'border-color 300ms ease',
      }}>
        <Corner v="top" h="left" />
        <Corner v="top" h="right" />
        <Corner v="bottom" h="left" />
        <Corner v="bottom" h="right" />

        {/* Status badge */}
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', background: 'rgba(0,0,0,0.65)',
          border: `1px solid ${recording ? 'rgba(255,79,79,0.5)' : wsReady ? 'rgba(184,216,248,0.3)' : 'var(--fg-4)'}`,
          borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em',
          transition: 'border-color 300ms ease',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: recording ? '#ff4f4f' : wsReady ? 'var(--accent)' : 'var(--fg-3)',
            boxShadow: recording ? '0 0 8px rgba(255,79,79,0.8)' : wsReady ? '0 0 6px var(--accent)' : 'none',
            animation: (recording || wsReady) ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
          }} />
          <span style={{ color: recording ? '#ff8b8b' : wsReady ? 'var(--accent)' : 'var(--fg-3)' }}>
            {recording ? `● REC · ${frameCount} frames` : wsReady ? 'READY' : 'CONNECTING…'}
          </span>
        </div>

        {permErr ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--fg-2)', fontFamily: 'var(--font-mono)',
            fontSize: 12, textAlign: 'center', padding: 24,
          }}>
            {permErr}
          </div>
        ) : (
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }}
          />
        )}

        <canvas ref={canvasRef} width={640} height={480} style={{ display: 'none' }} />

        {/* Scan line while recording */}
        {recording && (
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 60,
            background: 'linear-gradient(180deg, transparent, rgba(184,216,248,0.06), transparent)',
            animation: 'scan-line 2.4s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={onBack}
          style={{
            padding: '10px 20px', background: 'transparent', border: '1px solid var(--fg-4)',
            borderRadius: 99, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.1em', color: 'var(--fg-2)', transition: 'all 160ms ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-2)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-4)';
          }}
        >
          ← BACK
        </button>

        {!recording ? (
          <button
            onClick={startRecording}
            disabled={!canRecord}
            style={{
              padding: '11px 32px',
              background: canRecord ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              border: 'none', borderRadius: 99,
              cursor: canRecord ? 'pointer' : 'default',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
              color: canRecord ? 'var(--bg-0)' : 'var(--fg-3)',
              fontWeight: 600, transition: 'all 160ms ease',
            }}
            onMouseEnter={e => {
              if (canRecord) {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(184,216,248,0.25)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
              (e.currentTarget as HTMLButtonElement).style.transform = '';
            }}
          >
            ● START RECORDING
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={{
              padding: '11px 32px', background: '#c0392b',
              border: 'none', borderRadius: 99, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
              color: '#fff', fontWeight: 600, transition: 'all 160ms ease',
              boxShadow: '0 0 20px rgba(192,57,43,0.4)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
          >
            ■ STOP & ANALYSE
          </button>
        )}
      </div>

      {!wsReady && !permErr && !recording && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.12em', animation: 'fade-up 0.4s ease both' }}>
          Waiting for backend connection…
        </div>
      )}

      <style>{`
        @keyframes scan-line {
          0%   { top: 0%; }
          50%  { top: calc(100% - 60px); }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  );
}
