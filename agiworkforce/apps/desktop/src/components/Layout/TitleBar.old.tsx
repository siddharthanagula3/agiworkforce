import { useCallback, useEffect, useRef, useState } from 'react';
import { DockPosition, WindowActions } from '../../hooks/useWindowManager';

interface TitleBarProps {
  state: {
    pinned: boolean;
    alwaysOnTop: boolean;
    dock: DockPosition | null;
    focused: boolean;
  };
  actions: WindowActions;
}

const TitleBar = ({ state, actions }: TitleBarProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
    setMenuOpen(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const runAndClose = async (callback: () => Promise<void>) => {
    await callback();
    closeMenu();
  };

  return (
    <header
      className="title-bar"
      data-tauri-drag-region
      onDoubleClick={() => void actions.toggleMaximize()}
      onContextMenu={handleContextMenu}
    >
      <div className="title-bar__meta" data-tauri-drag-region>
        <span className="title-bar__logo" aria-hidden="true">
          AGI
        </span>
        <div className="title-bar__text" data-tauri-drag-region>
          <h1>AGI Workforce</h1>
          <p>{`${state.focused ? 'Ready' : 'Inactive'} | ${state.dock ? `Docked ${state.dock}` : 'Floating'}`}</p>
        </div>
      </div>
      <div className="title-bar__actions" data-tauri-drag-region="false">
        <button
          type="button"
          className={`title-bar__button ${state.pinned ? 'is-active' : ''}`}
          onClick={() => void actions.togglePinned()}
          aria-pressed={state.pinned}
          aria-label={state.pinned ? 'Unpin window' : 'Pin window'}
        >
          Pin
        </button>
        <button
          type="button"
          className={`title-bar__button ${state.alwaysOnTop ? 'is-active' : ''}`}
          onClick={() => void actions.toggleAlwaysOnTop()}
          aria-pressed={state.alwaysOnTop}
          aria-label={state.alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
        >
          AOT
        </button>
        <button
          type="button"
          className="title-bar__button"
          onClick={() => void actions.minimize()}
          aria-label="Minimize"
        >
          -
        </button>
        <button
          type="button"
          className="title-bar__button"
          onClick={() => void actions.toggleMaximize()}
          aria-label="Toggle maximize"
        >
          []
        </button>
        <button
          type="button"
          className="title-bar__button title-bar__button--danger"
          onClick={() => void actions.hide()}
          aria-label="Hide to tray"
        >
          X
        </button>
      </div>
      {menuOpen ? (
        <div
          className="title-bar__menu"
          ref={menuRef}
          style={{ top: `${menuPosition.y}px`, left: `${menuPosition.x}px` }}
        >
          <button type="button" onClick={() => runAndClose(() => actions.togglePinned())}>
            {state.pinned ? 'Unpin window' : 'Pin window'}
          </button>
          <button type="button" onClick={() => runAndClose(() => actions.toggleAlwaysOnTop())}>
            {state.alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
          </button>
          <button type="button" onClick={() => runAndClose(() => actions.dock('left'))}>
            Dock left
          </button>
          <button type="button" onClick={() => runAndClose(() => actions.dock('right'))}>
            Dock right
          </button>
          <button type="button" onClick={() => runAndClose(() => actions.dock(null))}>
            Undock
          </button>
          <button type="button" onClick={() => runAndClose(() => actions.hide())}>
            Hide to tray
          </button>
        </div>
      ) : null}
    </header>
  );
};

export default TitleBar;
