import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function MultiLineDropdown({
  label,
  items,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  disabled = false,
  getKey,
  getDisplay,
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0 });
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  };

  useEffect(() => {
    const onClickOutside = (event) => {
      const clickedInsideRoot = rootRef.current && rootRef.current.contains(event.target);
      const clickedInsideMenu = menuRef.current && menuRef.current.contains(event.target);
      if (!clickedInsideRoot && !clickedInsideMenu) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const handleResizeOrScroll = () => updateMenuPosition();
    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);

    return () => {
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [open]);

  const selected = items.find((item) => getKey(item) === value);
  const lines = selected ? getDisplay(selected) : [placeholder, ''];

  return (
    <div ref={rootRef} className="relative overflow-visible">
      {label ? <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p> : null}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full rounded-xl border border-gray-300 dark:border-white/10 bg-white/90 dark:bg-dark-800 px-3 py-2 text-left shadow-sm transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-cyan-400/60 focus:border-cyan-400'}`}
      >
        <div className="min-h-[2.6rem] flex flex-col justify-center leading-tight">
          <span className={`text-sm font-semibold ${selected ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{lines[0]}</span>
          <span className={`text-xs ${selected ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>{lines[1]}</span>
        </div>
      </button>

      {open && !disabled && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-dark-800 shadow-2xl overflow-hidden max-h-72 overflow-y-auto"
          style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
        >
          {items.map((item) => {
            const itemKey = getKey(item);
            const [line1, line2] = getDisplay(item);
            const active = itemKey === value;
            return (
              <button
                key={String(itemKey)}
                type="button"
                onClick={() => {
                  onChange(itemKey);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 border-b border-gray-100 dark:border-white/5 last:border-b-0 transition-colors ${active ? 'bg-cyan-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
              >
                <div className="flex flex-col leading-tight whitespace-normal break-words">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{line1}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300">{line2}</span>
                </div>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
