import {ensureMetaMoi} from './meta-moi.js';

export const JULY = {
  id:'18-juillet-2019', album:'18 juillet 2019', artist:'AA', cover:'/music/18-juillet-2019/cover.jpeg', coverType:'image/jpeg', lyricAlbums:['18-juillet-2019'],
  tracks:[
    {slug:'wanheda',title:'Wanheda',src:'/music/18-juillet-2019/wanheda.mp3',duration:234.672,minLevel:5},
    {slug:'quand-je-vois-je-pense',title:'Quand je vois je pense',src:'/music/18-juillet-2019/quand-je-vois-je-pense.mp3',duration:198.243,minLevel:6},
    {slug:'un-fil-entre-deux-infinis',title:'Un fil entre deux infinis',src:'/music/18-juillet-2019/un-fil-entre-deux-infinis.mp3',duration:198.624,minLevel:7},
  ],
};
export const FAIS_MIEUX = {
  id:'fais-mieux',album:'Fais Mieux',artist:'White Cadae',cover:'/music/fais-mieux/cover.png',coverType:'image/png',lyricAlbums:['114','fais-mieux'],
  tracks:[
    // Preserve the existing lyric URL and its references; only the display title is used in the UI.
    {slug:'la-matiere-dense',title:'La matière danse',src:'/music/fais-mieux/la-matiere-danse.mp3',duration:78.653854,minLevel:10},
    {slug:'les-probabilites',title:'Les probabilités',src:'/music/fais-mieux/les-probabilites.mp3',duration:93,minLevel:12},
    {slug:'fais-mieux',title:'Fais Mieux',src:'/music/fais-mieux/fais-mieux.mp3',duration:80.149271,minLevel:14},
  ],
};
export const RELEASES=[JULY,FAIS_MIEUX];
export const gatedTrack=slug=>RELEASES.flatMap(album=>album.tracks).find(track=>track.slug===slug);
export const gatedAlbum=slug=>RELEASES.find(album=>album.lyricAlbums.includes(slug));
export const retiredSong = slug => ['ma-folie','rendors-toi'].includes(slug);
export const canListen = (track,access) => !!access&&(access.admin||access.level>=track.minLevel);
export function musicAlbums(access){return RELEASES.flatMap(({lyricAlbums,...album})=>{const tracks=album.tracks.filter(track=>canListen(track,access));return tracks.length?[{...album,tracks}]:[];});}
export const visibleSong = (song,access) => !retiredSong(song.slug)&&(!gatedTrack(song.slug)||canListen(gatedTrack(song.slug),access));
const ready=new WeakMap();
export async function ensureMusicCatalogue(env) {
  if(ready.has(env.DB))return ready.get(env.DB);
  const pending=(async()=>{
    await ensureMetaMoi(env);
    const id='0031-meta-moi-single';
    if(await env.DB.prepare('SELECT id FROM site_content_migrations WHERE id=?1').bind(id).first())return;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO albums(title,slug,is_single,position)
        SELECT 'Meta moi','meta-moi',1,COALESCE(MAX(position),0)+1 FROM albums WHERE true
        ON CONFLICT(slug) DO NOTHING`),
      env.DB.prepare("UPDATE songs SET album_id=(SELECT id FROM albums WHERE slug='meta-moi'),track_number=1 WHERE slug='meta-moi' AND album_id IS NULL"),
      env.DB.prepare('INSERT OR IGNORE INTO site_content_migrations(id) VALUES(?1)').bind(id),
    ]);
  })();
  ready.set(env.DB,pending);
  try{await pending;}catch(error){ready.delete(env.DB);throw error;}
}
