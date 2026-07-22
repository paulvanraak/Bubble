// Minimal stroke-based icon set (no emoji) - all inherit currentColor.
const svg = (inner, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

export const ICONS = {
  cart: svg('<circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none"/><path d="M2.5 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6"/>'),
  trophy: svg('<path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a3 3 0 0 0 3 4"/><path d="M17 5h3a3 3 0 0 1-3 4"/><path d="M12 13v3"/><path d="M8 20h8"/><path d="M9 20c0-1.7.9-2.6 3-2.6s3 .9 3 2.6"/>'),
  palette: svg('<path d="M12 3a9 8 0 1 0 0 16c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a4 4 0 0 0 4-4c0-4.4-3.6-8.2-8-8.2z"/><circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="7.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.2" cy="8" r="1.1" fill="currentColor" stroke="none"/>'),
  recycle: svg('<path d="M7 19H4.8a2 2 0 0 1-1.7-3l1.2-2"/><path d="M9.3 5 7.2 8.5"/><path d="M13.5 5H17a2 2 0 0 1 1.7 1l1.1 2"/><path d="M17 19h2.3l-1.6-2.8"/><path d="M9 19h6"/><path d="M5 8.5 3 5"/><path d="M15 3.5 17 7"/><path d="M12 19l-2 2 2 2"/><path d="M14.5 3.5l2 1.2-1.2 2"/><path d="M4.8 16l-2-1.2 1.2-2"/>'),
  flame: svg('<path d="M12 22c4 0 6.5-2.5 6.5-6 0-2.5-1.3-4-2.5-5.5-.2 1.5-1 2.3-1.8 2.3-1 0-1.2-1.2-1-2.3.4-2-.3-4-2-5.5C10.5 7 9 9 9 11.5c0 .8.3 1.4.5 2-1.3-.4-2-1.6-2.2-3C6.3 11.8 5.5 13.6 5.5 16c0 3.5 2.5 6 6.5 6z"/>'),
  speakerOn: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>'),
  speakerOff: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l5 6"/><path d="M21 9l-5 6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  bubble: svg('<circle cx="12" cy="12" r="8"/><path d="M9 8.5c-1.3 1-2 2.2-2 3.8" stroke-width="1.4" opacity="0.6"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  collection: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>'),
  star: svg('<path d="M12 3.5l2.4 5.3 5.7.6-4.3 3.9 1.2 5.7L12 16.2l-5 2.8 1.2-5.7-4.3-3.9 5.7-.6L12 3.5z"/>'),
};

export function icon(name, cls = 'icon') {
  return `<span class="${cls}">${ICONS[name] || ''}</span>`;
}
