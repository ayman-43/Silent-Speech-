'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import type { ResultData } from './types';

const HTTP_URL = process.env.NEXT_PUBLIC_BACKEND_HTTP ?? 'http://localhost:8000';

interface Props {
  onResult: (result: ResultData) => void;
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

type CaptureState = 'idle' | 'recording' | 'processing' | 'error';

export default function WebcamCapture({ onResult, onBack }: Props) {
  const videoRef       = useRef<HTMLVideoElement>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const streamRef      = useRef<MediaStream | null>(null);
  const [hasStream,  setHasStream]  = useState(false);
  const [state,      setState]      = useState<CaptureState>('idle');
  const [elapsed,    setElapsed]    = useState(0);
  const [permErr,    setPermErr]    = useState<string | null>(null);
  const [errMsg,     setErrMsg]     = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, frameRate: 25 }, audio: false })
      .then(s => {
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setHasStream(true);
      })
      .catch(err => setPermErr(err.message ?? 'Camera permission denied'));

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!hasStream || !streamRef.current) return;
    chunksRef.current = [];
    setElapsed(0);
    setErrMsg(null);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';

    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setState('processing');

      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext  = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const form = new FormData();
      form.append('file', blob, `recording.${ext}`);

      try {
        const res = await fetch(`${HTTP_URL}/infer`, { method: 'POST', body: form });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Server ${res.status}${body ? ': ' + body : ''}`);
        }
        const data = await res.json();
        const raw        = (data.raw        as string) ?? '';
        const corrected  = (data.corrected  as string) ?? '';
        const candidates = (data.candidates as Array<{ text: string; score: number }>) ?? [];
        onResult({ raw, corrected, candidates, input: 'webcam' });
        setState('idle');
      } catch (err: unknown) {
        setErrMsg(err instanceof Error ? err.message : 'Upload failed');
        setState('error');
      }
    };

    recorder.start(200); // collect chunks every 200ms
    setState('recording');

    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  }, [hasStream, onResult]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const canRecord = hasStream && state === 'idle';
  const isRecording = state === 'recording';
  const isProcessing = state === 'processing';

  const statusColor  = isRecording ? '#ff4f4f' : isProcessing ? '#f0c040' : hasStream ? 'var(--accent)' : 'var(--fg-3)';
  const statusLabel  = isRecording
    ? `● REC · ${elapsed}s`
    : isProcessing
    ? 'PROCESSING…'
    : state === 'error'
    ? 'ERROR'
    : hasStream
    ? 'READY'
    : 'WAITING FOR CAMERA…';

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
        border: `1px solid ${isRecording ? 'rgba(255,79,79,0.4)' : 'var(--fg-4)'}`,
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
          border: `1px solid ${isRecording ? 'rgba(255,79,79,0.5)' : 'rgba(184,216,248,0.25)'}`,
          borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em',
          transition: 'border-color 300ms ease', whiteSpace: 'nowrap',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: statusColor,
            boxShadow: isRecording ? '0 0 8px rgba(255,79,79,0.8)' : isProcessing ? '0 0 8px rgba(240,192,64,0.8)' : 'none',
            animation: (isRecording || isProcessing) ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
          }} />
          <span style={{ color: statusColor }}>{statusLabel}</span>
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

        {/* Processing overlay */}
        {isProcessing && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(6,6,8,0.7)', fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.15em', color: '#f0c040', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ width: 32, height: 32, border: '2px solid #f0c040', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
            DECODING WITH BEAM SEARCH…
          </div>
        )}

        {/* Scan line while recording */}
        {isRecording && (
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 60,
            background: 'linear-gradient(180deg, transparent, rgba(184,216,248,0.06), transparent)',
            animation: 'scan-line 2.4s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* Error message */}
      {errMsg && (
        <div onClick={() => { setErrMsg(null); setState('idle'); }} style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.05em', color: '#ff8b8b',
          background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.35)',
          borderRadius: 6, padding: '8px 20px', cursor: 'pointer',
        }}>
          ⚠ {errMsg} &nbsp;×
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={onBack}
          disabled={isProcessing}
          style={{
            padding: '10px 20px', background: 'transparent', border: '1px solid var(--fg-4)',
            borderRadius: 99, cursor: isProcessing ? 'default' : 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.1em', color: isProcessing ? 'var(--fg-3)' : 'var(--fg-2)',
            transition: 'all 160ms ease', opacity: isProcessing ? 0.4 : 1,
          }}
          onMouseEnter={e => {
            if (!isProcessing) {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-2)';
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = isProcessing ? 'var(--fg-3)' : 'var(--fg-2)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--fg-4)';
          }}
        >
          ← BACK
        </button>

        {!isRecording ? (
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

      <style>{`
        @keyframes scan-line {
          0%   { top: 0%; }
          50%  { top: calc(100% - 60px); }
          100% { top: 0%; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
