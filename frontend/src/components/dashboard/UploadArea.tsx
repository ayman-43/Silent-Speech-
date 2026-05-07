'use client';
import { useRef, useState, useCallback } from 'react';

interface Props {
  onFile: (file: File) => void;
  onBack: () => void;
}

function Corner({ v, h, size = 12 }: { v: 'top' | 'bottom'; h: 'left' | 'right'; size?: number }) {
  return (
    <span style={{
      position: 'absolute', width: size, height: size,
      borderTop: v === 'top' ? '1.5px solid var(--accent)' : 'none',
      borderBottom: v === 'bottom' ? '1.5px solid var(--accent)' : 'none',
      borderLeft: h === 'left' ? '1.5px solid var(--accent)' : 'none',
      borderRight: h === 'right' ? '1.5px solid var(--accent)' : 'none',
      top: v === 'top' ? 10 : 'auto',
      bottom: v === 'bottom' ? 10 : 'auto',
      left: h === 'left' ? 10 : 'auto',
      right: h === 'right' ? 10 : 'auto',
      opacity: 0.55,
    }} />
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadArea({ onFile, onBack }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);

  const pick = useCallback((file: File) => {
    if (file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|avi|mov|mkv)$/i)) {
      setSelected(file);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) pick(file);
  }, [pick]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) pick(file);
  }, [pick]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 28, padding: 32,
    }}>
      {/* Eyebrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--fg-3)' }}>
        <span style={{ width: 24, height: 1, background: 'linear-gradient(90deg, transparent, var(--fg-4))' }} />
        VIDEO FILE UPLOAD
        <span style={{ width: 24, height: 1, background: 'linear-gradient(90deg, var(--fg-4), transparent)' }} />
      </div>

      {/* Drop zone */}
      <div
        onClick={() => !selected && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 520, minHeight: 220,
          border: `2px dashed ${dragging ? 'var(--accent)' : selected ? 'rgba(184,216,248,0.35)' : 'var(--fg-4)'}`,
          borderRadius: 12,
          background: dragging
            ? 'rgba(184,216,248,0.05)'
            : selected
            ? 'rgba(184,216,248,0.03)'
            : 'linear-gradient(180deg, var(--bg-2), var(--bg-1))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 36,
          cursor: selected ? 'default' : 'pointer',
          transition: 'border-color 200ms ease, background 200ms ease',
        }}
      >
        <Corner v="top" h="left" />
        <Corner v="top" h="right" />
        <Corner v="bottom" h="left" />
        <Corner v="bottom" h="right" />

        {selected ? (
          <>
            <div style={{ color: 'var(--accent)', opacity: 0.8 }}>
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="4" width="30" height="36" rx="3" />
                <path d="M16 22l6 6 6-6M22 28V14" />
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg-0)', marginBottom: 4 }}>
                {selected.name}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)', letterSpacing: '0.05em' }}>
                {formatSize(selected.size)} · {selected.type || 'video'}
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setSelected(null); if (inputRef.current) inputRef.current.value = ''; }}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
                color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer',
                padding: '3px 8px', transition: 'color 140ms ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)'; }}
            >
              × REMOVE
            </button>
          </>
        ) : (
          <>
            <div style={{ color: 'var(--fg-3)', opacity: dragging ? 1 : 0.7, transition: 'opacity 200ms ease' }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke={dragging ? 'var(--accent)' : 'currentColor'} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 200ms ease' }}>
                <path d="M24 32V14M16 22l8-8 8 8" />
                <path d="M10 36v3a2 2 0 002 2h24a2 2 0 002-2v-3" />
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, letterSpacing: '-0.015em', color: dragging ? 'var(--fg-0)' : 'var(--fg-1)', marginBottom: 6, transition: 'color 200ms ease' }}>
                {dragging ? 'Drop to upload' : 'Drop your video here'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.05em' }}>
                MP4 · WEBM · AVI · MOV · MKV
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)', letterSpacing: '0.1em' }}>
              — or click to browse —
            </div>
          </>
        )}
      </div>

      <input ref={inputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleInput} />

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

        {selected && (
          <button
            onClick={() => onFile(selected)}
            style={{
              padding: '11px 32px', background: 'var(--accent)',
              border: 'none', borderRadius: 99, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
              color: 'var(--bg-0)', fontWeight: 600, transition: 'all 160ms ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(184,216,248,0.25)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
              (e.currentTarget as HTMLButtonElement).style.transform = '';
            }}
          >
            ANALYSE →
          </button>
        )}
      </div>
    </div>
  );
}
