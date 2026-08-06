/* ============================================
   NEUROROUTE · Icon Set (SVG line icons)
   Usage: data-icon="name" on any element → replaced with inline SVG
   ============================================ */
const NR_ICONS = {
  // transport
  truck: '<path d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18a2 2 0 100-4 2 2 0 000 4zM18 18a2 2 0 100-4 2 2 0 000 4z"/>',
  box: '<path d="M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10"/>',
  ship: '<path d="M3 14l9-4 9 4-2 6H5zM12 10V4M8 6h8"/>',
  train: '<path d="M6 3h12v11H6zM6 9h12M9 18l-2 3M15 18l2 3M9 18h6"/><circle cx="9" cy="11.5" r="1"/><circle cx="15" cy="11.5" r="1"/>',
  plane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
  pin: '<path d="M12 21s-7-6-7-11a7 7 0 1114 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  // platform / ui
  grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
  handshake: '<path d="M3 12l4-4 3 2 4-3 7 5M7 16l3 3 4-4M3 12v4h2M21 12v4h-2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  brain: '<path d="M9 3a3 3 0 00-3 3 3 3 0 00-1 5 3 3 0 002 5 3 3 0 005 1V4a3 3 0 00-3-1zM15 3a3 3 0 013 3 3 3 0 011 5 3 3 0 01-2 5 3 3 0 01-5 1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  inbox: '<path d="M3 13l3-9h12l3 9v6H3zM3 13h5l1 2h6l1-2h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 9a6 6 0 1112 0c0 5 2 7 2 7H4s2-2 2-7zM10 21h4"/>',
  refresh: '<path d="M21 12a9 9 0 11-3-6.7M21 4v4h-4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0M16 6a3 3 0 010 6M21 20a6 6 0 00-4-5.6"/>',
  check: '<path d="M5 12l5 5L20 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v6M18 9v6"/>',
  doc: '<path d="M6 2h8l4 4v16H6zM14 2v4h4"/>',
  scroll: '<path d="M6 4h12v13a3 3 0 01-3 3H6a2 2 0 002-2V6a2 2 0 00-2-2zM18 4a2 2 0 012 2v2h-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  mail: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  telescope: '<path d="M3 14l11-4 2 5-11 4zM14 10l4-6 3 2-3 5M5 18l2 3M9 17l1 4"/>',
  link: '<path d="M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M16 8l-2 6-6 2 2-6z"/>',
  door: '<path d="M4 21V4a1 1 0 011-1h10a1 1 0 011 1v17M4 21h16M14 12h.01"/>',
  building: '<path d="M4 21V5a1 1 0 011-1h6a1 1 0 011 1v16M12 21V9a1 1 0 011-1h6a1 1 0 011 1v12M7 8h2M7 12h2M16 12h2M16 16h2"/>',
  rails: '<path d="M6 3L4 21M14 3l-2 18M2 8h14M2 14h12"/>',
  factory: '<path d="M3 21V10l5 3V10l5 3V7l5 3v11zM3 21h18"/>',
  warning: '<path d="M12 3l9 16H3zM12 9v5M12 17h.01"/>',
  split: '<path d="M6 3v6a3 3 0 003 3h6a3 3 0 013 3v6M6 3H3m3 0h3m9 18h-3m3 0h3"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 18l9 5 9-5"/>',
  fog: '<path d="M3 8h18M5 12h14M3 16h18M7 20h10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2"/>',
  tag: '<path d="M3 11l8-8 9 9-8 8zM3 11v6a2 2 0 002 2h6"/><circle cx="8.5" cy="8.5" r="1.5"/>',
  trendDown: '<path d="M3 7l6 6 4-4 8 8M21 17v-5h-5"/>',
  repeat: '<path d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  snowflake: '<path d="M12 2v20M4 6l16 12M20 6L4 18"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 11-12 0c0-4.5 6-11 6-11z"/>',
  car: '<path d="M4 16v-3l2-5h12l2 5v3M4 13h16M7 16a1.5 1.5 0 103 0M14 16a1.5 1.5 0 103 0"/>',
  leaf: '<path d="M5 19C5 9 13 4 20 4c0 8-5 15-13 15H5zM5 19c3-5 7-8 11-10"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>',
  award: '<circle cx="12" cy="9" r="5"/><path d="M9 13l-2 8 5-3 5 3-2-8"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
};

function nrRenderIcons(root) {
  (root||document).querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const path = NR_ICONS[name];
    if (!path) return;
    const size = el.getAttribute('data-size') || 24;
    el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    el.removeAttribute('data-icon');
  });
}
document.addEventListener('DOMContentLoaded', () => nrRenderIcons());
