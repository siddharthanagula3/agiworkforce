import { useState } from 'react';
import { Mic, X, Check, Shield } from 'lucide-react';

interface AudioSource {
  id: string;
  name: string;
  note: string;
}

const SOURCES: AudioSource[] = [
  { id: 'macbook', name: 'MacBook Pro Microphone', note: 'Default' },
  { id: 'airpods', name: 'AirPods Pro', note: 'Bluetooth' },
  { id: 'display', name: 'Studio Display Mic', note: 'USB-C' },
  { id: 'external', name: 'Shure MV7', note: 'USB' },
];

export interface MicSettingsProps {
  onClose: () => void;
  onSettings?: () => void;
}

export function MicSettings({ onClose, onSettings }: MicSettingsProps) {
  // On-device is the default per product lock
  const [source, setSource] = useState('macbook');
  const [hold, setHold] = useState(true);
  const [trim, setTrim] = useState(true);

  return (
    <>
      {/* Scrim */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={onClose} />

      {/* Popover */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: 48,
          right: 0,
          width: 264,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
          zIndex: 50,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Mic size={13} style={{ color: 'var(--text-3)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>
            Voice input
          </span>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-3)',
              display: 'flex',
              padding: 2,
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Source selection */}
        <div style={{ padding: '8px 0' }}>
          <div
            style={{
              padding: '2px 12px 6px',
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Source
          </div>
          {SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 12px',
                border: 'none',
                background: source === s.id ? 'var(--bg-soft)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {/* Radio dot */}
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: `2px solid ${source === s.id ? 'var(--teal)' : 'var(--border)'}`,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {source === s.id && (
                  <div
                    style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)' }}
                  />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: 'var(--text-1)',
                    fontWeight: source === s.id ? 600 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.note}</div>
              </div>

              {source === s.id && (
                <Check
                  size={12}
                  strokeWidth={2.5}
                  style={{ color: 'var(--teal)', flexShrink: 0 }}
                />
              )}
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

        {/* Toggles */}
        <div style={{ padding: '8px 0' }}>
          {/* Hold to record */}
          <div
            onClick={() => setHold(!hold)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 12px',
              cursor: 'pointer',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)' }}>
                Hold to record
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Tap to start, tap to stop when off
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHold(!hold);
              }}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                border: 'none',
                background: hold ? 'var(--teal)' : 'var(--border)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: hold ? 17 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  transition: 'left 0.18s',
                }}
              />
            </button>
          </div>

          {/* Auto-trim */}
          <div
            onClick={() => setTrim(!trim)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 12px',
              cursor: 'pointer',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)' }}>
                Auto-trim silence
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Cut leading/trailing pauses
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTrim(!trim);
              }}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                border: 'none',
                background: trim ? 'var(--teal)' : 'var(--border)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: trim ? 17 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  transition: 'left 0.18s',
                }}
              />
            </button>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Footer — on-device is the default, never Cloud */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}>
          <Shield size={12} style={{ color: 'var(--teal)', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', flex: 1 }}>
            On-device · Whisper-small
          </span>
          <button
            onClick={onSettings}
            style={{
              fontSize: 11,
              color: 'var(--teal)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Settings
          </button>
        </div>
      </div>
    </>
  );
}
