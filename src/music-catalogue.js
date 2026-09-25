import {ensureMetaMoi} from './meta-moi.js';

export const JULY = {
  id:'18-juillet-2019', album:'18 juillet 2019', artist:'AA', cover:null,
  tracks:[
    {slug:'wanheda',title:'Wanheda',src:'/music/18-juillet-2019/wanheda.mp3',duration:234.672},
    {slug:'quand-je-vois-je-pense',title:'Quand je vois je pense',src:'/music/18-juillet-2019/quand-je-vois-je-pense.mp3',duration:198.243},
    {slug:'un-fil-entre-deux-infinis',title:'Un fil entre deux infinis',src:'/music/18-juillet-2019/un-fil-entre-deux-infinis.mp3',duration:198.624},
  ],
};
export const retiredSong = slug => ['ma-folie','rendors-toi'].includes(slug);
export const julySong = slug => JULY.tracks.some(t=>t.slug===slug);
export const visibleSong = (song,unlocked) => !retiredSong(song.slug)&&(!julySong(song.slug)||unlocked);
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
