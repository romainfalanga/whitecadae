// Public entry points for the album and its escape game.
async function pageOrange() {
  const epoch = newEpoch();
  document.title = 'White Cadae';
  app.innerHTML = `<section class="orange-story" aria-labelledby="story-title">
    <h1 id="story-title" class="orange-title">Escape Game <span>Orange</span></h1>
    <div class="orange-story-text"><p>Vulpis était en enfer. Il a écrit quatre morceaux dans un album intitulé <strong>57</strong>, puis trois autres dans un album intitulé <strong>114</strong>. Ces morceaux l’ont aidé à s’en échapper et à trouver le chemin vers son paradis. En mettant en musique ce qu’il traversait, en extériorisant ce qu’il portait en lui, il a laissé des signes dans ses textes.</p>
    <p>Dans ces morceaux, plusieurs grilles de lecture se superposent : les mêmes paroles peuvent raconter plusieurs choses à la fois. Un mot, une expression, un nombre, une sonorité ou un rapprochement entre deux passages peut révéler un autre sens. Ces codes cachés sont les <strong>signes</strong> que tu dois retrouver afin de comprendre les patterns qui te permettront de t’évader de l’enfer.</p>
    <p>Écoute, réécoute et lis les paroles pour découvrir les superpositions des grilles de lecture et trouver les signes.</p></div>
  <div id="orange-openings" class="orange-openings"></div></section>`;
  try {
    const data = await api("/api/orange");
    if (stale(epoch)) return;
    const groups=new Map();
    for(const item of data.openings){if(!groups.has(item.level))groups.set(item.level,[]);groups.get(item.level).push(item);}
    document.getElementById("orange-openings").innerHTML = [...groups].map(([level,items])=>`<div class="orange-opening${items.length>1?' is-grouped':''}"><span>Échelon ${level}</span><div class="opening-items">${items.map(item=>`<strong class="opening-title">${esc(item.title)}</strong>${item.paragraph?`<p class="orange-opening-story">${esc(item.paragraph)}</p>`:''}`).join('')}</div></div>`).join('');
  } catch { /* The original welcome remains readable if access loading fails. */ }
}

async function prepareMusicCover(album) {
  if(!album?.cover)return null;
  const image=new Image();
  image.className='music-cover';image.alt=`Pochette de l’album ${album.album}`;
  image.width=image.height=360;image.decoding='async';image.fetchPriority='high';
  if(image.decode){image.src=album.cover;try{await image.decode();}catch{}}
  else await new Promise(resolve=>{image.onload=image.onerror=resolve;image.src=album.cover;});
  return image;
}

async function pageMusique() {
  const epoch=newEpoch();
  const previousAlbum=WCPlayer.getAlbums()[0],preparedCover=prepareMusicCover(previousAlbum);
  document.title = 'Musiques · White Cadae';
  app.innerHTML='<div class="loading">Chargement…</div>';
  try {const data=await api('/api/music');if(stale(epoch))return;WCPlayer.setAlbums(data.albums);}
  catch(err){if(!stale(epoch))app.innerHTML=`<h1>Musiques</h1><p>${esc(err.message)}</p><a href="/musique" data-link>Réessayer</a>`;return;}
  const albums=WCPlayer.getAlbums();
  const firstCover=await (previousAlbum?.cover===albums[0]?.cover?preparedCover:prepareMusicCover(albums[0]));
  if(stale(epoch))return;
  app.innerHTML = `<h1 class="music-page-title">Musiques</h1>${albums.map((album,index)=>`<section class="music-release" id="album-${esc(album.id)}" aria-labelledby="album-title-${esc(album.id)}"><div class="music-album">
    ${index===0&&firstCover?'<span id="music-primary-cover"></span>':album.cover?`<img class="music-cover" loading="lazy" decoding="async" src="${esc(album.cover)}" alt="Pochette de l’album ${esc(album.album)}" width="360" height="360">`:'<div class="music-date-art" aria-hidden="true"><span>18</span><span>juillet</span><span>2019</span></div>'}
    <div><h2 id="album-title-${esc(album.id)}">${esc(album.album)}</h2><p class="music-artist">${esc(album.artist)}</p><p class="music-meta">${album.tracks.length} morceau${album.tracks.length>1?'x':''}</p></div>
  </div>
  <div class="music-list" aria-label="Les morceaux de ${esc(album.album)} dans l’ordre">
    <ol>${album.tracks.map((t, i) => `<li id="track-${t.slug}" data-track-row="${t.slug}">
      <span class="track-number">${String(t.number || i + 1).padStart(2, '0')}</span>
      <button class="track-play" data-play-track="${t.slug}" aria-label="Écouter ${esc(t.title)}">${WCIcon('play')}<span>${esc(t.title)}<small>${esc(album.artist)}</small></span></button>
      <a class="track-lyrics" href="/chanson/${t.slug}" data-link aria-label="Lire les paroles de ${esc(t.title)}">${WCIcon('book')}<span>Paroles</span></a>
      <span class="track-duration">${mmss(Math.floor(t.duration))}</span>
    </li>`).join('')}</ol>
  </div></section>`).join('')}`;
  if(firstCover)document.getElementById('music-primary-cover')?.replaceWith(firstCover);
  bindMusicButtons();
  if(/^#(?:album|track)-/.test(location.hash))document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

function bindMusicButtons() {
  document.querySelectorAll('[data-play-track]').forEach((button) => {
    button.onclick = () => WCPlayer.toggle(button.dataset.playTrack);
  });
  updateMusicButtons();
}

function updateMusicButtons() {
  const current = WCPlayer.snapshot();
  document.querySelectorAll('[data-play-track]').forEach((button) => {
    const t = WCPlayer.findTrack(button.dataset.playTrack);
    if(!t){button.disabled=true;return;}
    const playing = !current.playlistId && current.slug === t.slug && (current.playing || current.loading);
    const key=JSON.stringify([playing,t.title,t.artist]);
    if(button.dataset.playbackKey===key)return;
    button.dataset.playbackKey=key;
    const label = `${playing ? 'Mettre en pause' : 'Écouter'} ${t.title}`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(playing));
    button.innerHTML = button.classList.contains('track-play')
      ? `${WCIcon(playing ? 'pause' : 'play')}<span>${esc(t.title)}<small>${esc(t.artist)}</small></span>`
      : `${WCIcon(playing ? 'pause' : 'play')} ${playing ? 'Mettre en pause' : 'Écouter le morceau'}`;
  });
  document.querySelectorAll('[data-track-row]').forEach((row) => {
    row.classList.toggle('is-current', !current.playlistId && row.dataset.trackRow === current.slug);
  });
}
window.addEventListener('wc:music', updateMusicButtons);
