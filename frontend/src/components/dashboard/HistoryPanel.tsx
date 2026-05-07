'use client';
import { signOut } from 'next-auth/react';
import type { HistoryEntry } from './types';

interface Props {
  user: { name: string | null; email: string | null; image: string | null };
  history: HistoryEntry[];
  selectedId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function HistoryPanel({ user, history, selectedId, onSelect, onClear }: Props) {
  const initial = (user.name ?? user.email ?? '?')[0].toUpperCase();

  return (
    <div style={{
      width: 272, flexShrink: 0,
      background: 'var(--bg-1)',
      borderRight: '1px solid var(--fg-4)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
    }}>
      {/* User card */}
      <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--fg-4)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {user.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={user.image}
              alt={user.name ?? ''}
              referrerPolicy="no-referrer"
              style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--fg-4)', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'var(--accent-soft)', border: '1px solid rgba(184,216,248,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--accent)',
            }}>
              {initial}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 500,
              letterSpacing: '-0.01em', color: 'var(--fg-0)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {user.name ?? 'User'}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
              letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {user.email}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px',
            background: 'rgba(184,216,248,0.05)', border: '1px solid rgba(184,216,248,0.1)',
            borderRadius: 4,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
              boxShadow: '0 0 6px var(--accent)', flexShrink: 0,
              animation: 'pulse-dot 2s ease-in-out infinite',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--accent)' }}>
              ACTIVE
            </span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            style={{
              padding: '6px 10px', background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--fg-4)', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--fg-2)',
              transition: 'color 160ms ease, border-color 160ms ease',
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
            SIGN OUT
          </button>
        </div>
      </div>

      {/* History header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 8px', flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--fg-3)', textTransform: 'uppercase' }}>
          Sessions · {history.length}
        </span>
        {history.length > 0 && (
          <button
            onClick={onClear}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, transition: 'color 160ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)'; }}
          >
            clear
          </button>
        )}
      </div>

      {/* History list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
        {history.length === 0 ? (
          <div style={{ padding: '32px 12px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.12em', marginBottom: 8 }}>
              NO SESSIONS YET
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-4)', lineHeight: 1.5 }}>
              Your transcriptions<br />will appear here
            </div>
          </div>
        ) : (
          history.map(entry => {
            const isSelected = selectedId === entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => onSelect(entry)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 2,
                  background: isSelected ? 'rgba(184,216,248,0.07)' : 'transparent',
                  border: `1px solid ${isSelected ? 'rgba(184,216,248,0.18)' : 'transparent'}`,
                  borderRadius: 6, cursor: 'pointer', transition: 'all 140ms ease',
                  display: 'block',
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
                }}
                onMouseLeave={e => {
                  if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                    color: entry.input === 'webcam' ? 'var(--accent)' : 'var(--fg-2)',
                    padding: '2px 5px',
                    border: `1px solid ${entry.input === 'webcam' ? 'rgba(184,216,248,0.3)' : 'var(--fg-4)'}`,
                    borderRadius: 2, flexShrink: 0,
                  }}>
                    {entry.input === 'webcam' ? 'LIVE' : 'FILE'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.05em' }}>
                    {timeAgo(entry.timestamp)}
                  </span>
                </div>
                <div style={{
                  fontSize: 12, color: isSelected ? 'var(--fg-0)' : 'var(--fg-1)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  lineHeight: 1.4,
                }}>
                  {entry.corrected || entry.raw || '(empty)'}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
