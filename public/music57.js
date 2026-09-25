// The public album catalogue contains music metadata only, never game answers.
window.WC57 = Object.freeze({
  id:'57', artist: 'Vulpis', album: '57', cover: '/music/57/cover.png',
  tracks: Object.freeze([
    { slug: '13h20', title: '13h20', src: '/music/57/13h20.mp3', duration: 144.456 },
    { slug: '30-vins-divins', title: '30 vins divins', src: '/music/57/30-vins-divins.mp3', duration: 230.374 },
    { slug: 'sans-indice-dans-les-des', title: 'Sans indices dans les dés', src: '/music/57/sans-indices-dans-les-des.mp3', duration: 224.808 },
    { slug: 'orange', title: 'Orange', src: '/music/57/orange.mp3', duration: 159.373 },
  ].map(Object.freeze)),
});

window.WCIcon = (name) => {
  const paths = {
    play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
    previous: '<path d="M5 5v14M19 5 8 12l11 7z"/>',
    next: '<path d="M19 5v14M5 5l11 7L5 19z"/>',
    repeat: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
    volume: '<path d="m11 5-6 4H2v6h3l6 4zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    book: '<path d="M12 5v15M3 3c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z"/>',
  };
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.play}</svg>`;
};
