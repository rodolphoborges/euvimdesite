// App EVS — vanilla, sem dependências
(function(){
  const isHome = !!document.getElementById('grade-home');
  function dataUrl(f){
    if (document.querySelector('meta[name="evs-depth"]')) return document.querySelector('meta[name="evs-depth"]').content + 'data/' + f;
    const inSub = /\/(videos|sobre|v)\//.test(location.pathname);
    return (inSub ? '../' : '') + 'data/' + f;
  }
  const fmt = d => { try { return new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});} catch { return '';} };
  const comp = n => { try { return new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(Number(n)); } catch { return n; } };
  const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CAT = {taticas:'Táticas',comentarios:'Comentários',noticias:'Notícias',entrevistas:'Entrevistas',lives:'Lives',shorts:'Shorts'};

  async function load(){
    const res = await fetch(dataUrl('videos.json'), {cache:'no-store'});
    if(!res.ok) throw new Error('feed');
    return res.json();
  }
  function linkFor(v){
    if(v.cat === 'shorts') return {href: v.url, ext: true};
    const inSub = /\/(videos|sobre|v)\//.test(location.pathname);
    const onHome = !inSub;
    return {href: onHome ? ('v/' + v.id + '.html') : ('../v/' + v.id + '.html'), ext: false};
  }
  function metaTxt(v){
    const parts = [CAT[v.cat] || v.cat, fmt(v.published)];
    if(v.views) parts.push(comp(v.views) + ' views');
    if(v.duration) parts.push(v.duration);
    return parts.join(' · ');
  }
  function row(v, i){
    const l = linkFor(v);
    const num = String(i + 1).padStart(2, '0');
    return `<li><a class="linha" href="${l.ext ? esc(v.url) : l.href}"${l.ext ? ' target="_blank" rel="noopener"' : ''}>` +
      `<span class="num">${num}</span>` +
      `<span class="linha-corpo"><span class="linha-kicker">${esc(metaTxt(v))}</span>` +
      `<span class="linha-titulo">${esc(v.title)}</span></span>` +
      `<img class="mini" loading="lazy" src="${esc(v.thumb)}" alt="" width="344" height="194">` +
      `<span class="seta" aria-hidden="true">→</span></a></li>`;
  }
  function shortItem(v){
    return `<a class="tira-item" href="${esc(v.url)}" target="_blank" rel="noopener">` +
      `<img loading="lazy" src="${esc(v.thumb)}" alt="">` +
      `<span>${esc(v.title)}</span></a>`;
  }
  function liteEmbed(el, id, title){
    el.innerHTML = `<button class="lite" aria-label="Assistir: ${esc(title)}">` +
      `<img loading="lazy" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="">` +
      `<i aria-hidden="true"></i><b>${esc(title)}</b></button>`;
    el.querySelector('button').addEventListener('click', () => {
      el.innerHTML = `<span class="player-frame"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${esc(title)}" allow="accelerometer;autoplay;encrypted-media;picture-in-picture" allowfullscreen></iframe></span>`;
    });
  }

  async function home(){
    try{
      const data = await load();
      const upd = document.getElementById('last-update');
      if(upd) upd.textContent = 'atualizado ' + fmt(data.updated);
      const longs = data.videos.filter(v=>v.cat!=='shorts');
      const shorts = data.videos.filter(v=>v.cat==='shorts').slice(0,8);
      // destaque = vídeo mais recente
      if(longs[0]){
        const v = longs[0], l = linkFor(v);
        const ht = document.getElementById('hero-titulo');
        if(ht) ht.innerHTML = `<a href="${l.href}">${esc(v.title)}</a>`;
        const hd = document.getElementById('hero-desc');
        if(hd && v.desc) hd.textContent = v.desc.slice(0, 220);
        const hc = document.getElementById('hero-cat');
        if(hc) hc.textContent = CAT[v.cat] || v.cat;
        const hm = document.getElementById('hero-meta');
        if(hm) hm.textContent = fmt(v.published) + (v.views ? ' · ' + comp(v.views) + ' views' : '') + (v.duration ? ' · ' + v.duration : '');
        const hl = document.getElementById('hero-link');
        if(hl) hl.href = l.href;
        liteEmbed(document.getElementById('destaque'), v.id, v.title);
      }
      const grade = document.getElementById('grade-home');
      let cat = 'all';
      const render = () => {
        const list = (cat==='all' ? longs : longs.filter(v=>v.cat===cat)).slice(0,12);
        grade.innerHTML = list.length
          ? list.map((v,i)=>row(v,i)).join('')
          : '<li class="vazio">Nada nesta editoria por enquanto.</li>';
      };
      document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{
        document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); cat = b.dataset.cat; render();
      }));
      render();
      document.getElementById('grade-shorts').innerHTML = shorts.map(shortItem).join('');
    }catch(e){
      const upd = document.getElementById('last-update');
      if(upd) upd.textContent = 'feed indisponível — abra no YouTube';
    }
  }

  async function listing(){
    const grade = document.getElementById('grade-all');
    if(!grade) return;
    try{
      const data = await load();
      const count = document.getElementById('count');
      if(count) count.textContent = `${data.videos.length} peças · atualizado ${fmt(data.updated)}`;
      const params = new URLSearchParams(location.search);
      let cat = params.get('cat') || 'all';
      let q = '';
      const sel = document.getElementById('fcat');
      const inp = document.getElementById('q');
      const tabs = document.querySelectorAll('[data-chip]');
      const sync = () => {
        if(sel) sel.value = cat;
        tabs.forEach(b=>b.classList.toggle('on', b.dataset.chip===cat));
      };
      if(sel) sel.addEventListener('change',()=>{cat=sel.value; sync(); render();});
      if(inp) inp.addEventListener('input',()=>{q=inp.value.toLowerCase(); render();});
      tabs.forEach(b=>b.addEventListener('click',()=>{cat=(cat===b.dataset.chip)?'all':b.dataset.chip; sync(); render();}));
      function render(){
        let list = data.videos.slice();
        if(cat!=='all') list = list.filter(v=>v.cat===cat);
        if(q) list = list.filter(v=>(v.title+' '+v.desc).toLowerCase().includes(q));
        grade.innerHTML = list.length
          ? list.map((v,i)=>(v.cat==='shorts'
              ? `<li><a class="linha" href="${esc(v.url)}" target="_blank" rel="noopener"><span class="num">${String(i+1).padStart(2,'0')}</span><span class="linha-corpo"><span class="linha-kicker">${esc(metaTxt(v))}</span><span class="linha-titulo">${esc(v.title)}</span></span><img class="mini" loading="lazy" src="${esc(v.thumb)}" alt="" style="aspect-ratio:9/14"><span class="seta" aria-hidden="true">→</span></a></li>`
              : row(v,i))).join('')
          : '<li class="vazio">Nada encontrado no arquivo.</li>';
      }
      sync(); render();
    }catch(e){ grade.innerHTML = '<li class="vazio">Falha ao carregar. Tente recarregar ou ir ao YouTube.</li>'; }
  }

  function detail(){
    const scope = document.querySelector('[data-video-id]');
    const det = document.getElementById('player');
    if(det && det.dataset.id) liteEmbed(det, det.dataset.id, det.dataset.title || 'Vídeo');
    if(!scope) return;
    const id = scope.dataset.videoId;
    const cp = document.getElementById('copiar');
    if(cp) cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); cp.textContent = 'Copiado ✓'; }
      catch { cp.textContent = location.href; }
      setTimeout(()=>{ cp.innerHTML = 'Copiar link'; }, 2000);
    });
    load().then(data => {
      const v = (data.videos||[]).find(x=>x.id===id);
      if(!v) return;
      const d = document.querySelector('[data-dyn="date"]');
      if(d) d.textContent = fmt(v.published);
      const m = document.querySelector('[data-dyn="meta"]');
      if(m) m.innerHTML = `${fmt(v.published)} · ${esc(CAT[v.cat]||v.cat)}${v.views ? ' · ' + comp(v.views) + ' views' : ''}`;
      const vd = document.querySelector('[data-dyn="views-dot"]');
      if(vd && v.views) vd.textContent = '· ' + comp(v.views) + ' views';
      const ds = document.querySelector('[data-dyn="desc"]');
      if(ds && v.desc) ds.textContent = v.desc;
      const statItems = [];
      if(v.views) statItems.push(`<div><b>${comp(v.views)}</b><span>visualizações</span></div>`);
      if(v.likes) statItems.push(`<div><b>${comp(v.likes)}</b><span>curtidas</span></div>`);
      if(v.comments) statItems.push(`<div><b>${comp(v.comments)}</b><span>comentários</span></div>`);
      if(v.duration) statItems.push(`<div><b>${esc(v.duration)}</b><span>duração</span></div>`);
      let st = document.querySelector('[data-dyn="stats"]');
      if(statItems.length && !st){
        st = document.createElement('div');
        st.className = 'stats'; st.setAttribute('data-dyn','stats');
        const bar = scope.querySelector('.video-bar');
        if(bar) bar.before(st); else scope.append(st);
      }
      if(st && statItems.length) st.innerHTML = statItems.join('');
      const rail = document.getElementById('cont-rail');
      if(rail){
        const same = data.videos.filter(x=>x.id!==id && x.cat===v.cat && x.cat!=='shorts');
        const rest = data.videos.filter(x=>x.id!==id && x.cat!==v.cat && x.cat!=='shorts');
        rail.innerHTML = [...same, ...rest].slice(0,6).map((x,i)=>row(x,i)).join('');
      }
    }).catch(()=>{});
  }

  if(isHome) home();
  listing();
  detail();
})();
