// App EVS — vanilla, sem dependências
(function(){
  const isHome = !!document.getElementById('grade-home');
  const base = (() => {
    // funciona em / , /euvimdesite/ , file://
    const p = location.pathname;
    if (p.includes('/euvimdesite/')) return '/euvimdesite/';
    const seg = p.split('/').filter(Boolean);
    // se está em /videos/ ou /sobre/ ou /v/, volta um nível para achar data/
    return '';
  })();
  function dataUrl(f){
    const depth = (location.pathname.match(/\//g)||[]).length;
    // index na raiz: data/x ; subpasta videos/, sobre/, v/: ../data/x
    if (document.querySelector('meta[name="evs-depth"]')) return document.querySelector('meta[name="evs-depth"]').content + 'data/' + f;
    const inSub = /\/(videos|sobre|v)\//.test(location.pathname);
    return (inSub ? '../' : '') + 'data/' + f;
  }
  const fmt = d => { try { return new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});} catch { return '';} };
  const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function load(){
    const url = dataUrl('videos.json');
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error('feed');
    return res.json();
  }

  function card(v){
    const short = v.cat === 'shorts';
    const href = short ? v.url : ('../v/' + v.id + '.html');
    // da home o caminho v/ é diferente
    const link = location.pathname.endsWith('/') || location.pathname.endsWith('index.html') && !/\/(videos|sobre|v)\//.test(location.pathname)
      ? ('v/' + v.id + '.html') : (short ? v.url : ('../v/' + v.id + '.html'));
    return `<article class="card">
      <a class="thumb" href="${short ? v.url : link}" ${short ? 'target="_blank" rel="noopener"' : ''} aria-label="${esc(v.title)}">
        <img loading="lazy" src="${esc(v.thumb)}" alt="" width="480" height="360">
        <span class="badge">${esc(v.cat)}</span>
      </a>
      <div class="corpo"><h3><a href="${short ? v.url : link}" ${short ? 'target="_blank" rel="noopener"' : ''}>${esc(v.title)}</a></h3>
      <time datetime="${esc(v.published)}">${fmt(v.published)}${v.views ? ' · ' + Number(v.views).toLocaleString('pt-BR') + ' views' : ''}</time></div>
    </article>`;
  }

  function liteEmbed(el, id, title){
    el.innerHTML = `<button class="lite" aria-label="Assistir: ${esc(title)}">
      <img loading="lazy" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="">
      <i aria-hidden="true"></i><b>${esc(title)}</b></button>`;
    el.querySelector('button').addEventListener('click', () => {
      el.innerHTML = `<iframe width="100%" height="100%" style="aspect-ratio:16/9;border:0" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${esc(title)}" allow="accelerometer;autoplay;encrypted-media;picture-in-picture" allowfullscreen></iframe>`;
    });
  }

  async function home(){
    try{
      const data = await load();
      document.getElementById('last-update').textContent = `Atualizado em ${fmt(data.updated)} · ${data.videos.length} vídeos indexados · fonte: YouTube RSS`;
      const longs = data.videos.filter(v=>v.cat!=='shorts');
      const shorts = data.videos.filter(v=>v.cat==='shorts').slice(0,6);
      const grade = document.getElementById('grade-home');
      let cat = 'all';
      const render = () => {
        const list = (cat==='all' ? longs : longs.filter(v=>v.cat===cat)).slice(0,12);
        grade.innerHTML = list.map(card).join('');
      };
      document.querySelectorAll('.filtros button').forEach(b=>b.addEventListener('click',()=>{
        document.querySelectorAll('.filtros button').forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); cat = b.dataset.cat; render();
      }));
      render();
      document.getElementById('grade-shorts').innerHTML = shorts.map(card).join('');
      if(longs[0]) liteEmbed(document.getElementById('destaque'), longs[0].id, longs[0].title);
    }catch(e){
      document.getElementById('last-update').textContent = 'Não foi possível carregar o feed agora. Abra direto no YouTube.';
    }
  }

  async function listing(){
    const grade = document.getElementById('grade-all');
    if(!grade) return;
    try{
      const data = await load();
      document.getElementById('count').textContent = `${data.videos.length} vídeos · atualizado ${fmt(data.updated)}`;
      const params = new URLSearchParams(location.search);
      let cat = params.get('cat') || 'all';
      let q = '';
      const sel = document.getElementById('fcat');
      const inp = document.getElementById('q');
      if(sel){ sel.value = cat; sel.addEventListener('change',()=>{cat=sel.value; render();}); }
      if(inp){ inp.addEventListener('input',()=>{q=inp.value.toLowerCase(); render();}); }
      document.querySelectorAll('[data-chip]').forEach(b=>b.addEventListener('click',()=>{cat=b.dataset.chip; if(sel) sel.value=cat; render();}));
      function render(){
        let list = data.videos.slice();
        if(cat!=='all') list = list.filter(v=>v.cat===cat);
        if(q) list = list.filter(v=>(v.title+' '+v.desc).toLowerCase().includes(q));
        grade.innerHTML = list.map(card).join('') || '<p>Nada encontrado.</p>';
      }
      render();
    }catch(e){ grade.innerHTML = '<p>Falha ao carregar. Tente recarregar ou ir ao YouTube.</p>'; }
  }

  if(isHome) home();
  listing();
  detail();
  function detail(){
    const scope = document.querySelector('[data-video-id]');
    const det = document.getElementById('player');
    if(det && det.dataset.id) liteEmbed(det, det.dataset.id, det.dataset.title || 'Vídeo');
    if(!scope) return;
    const id = scope.dataset.videoId;
    const cp = document.getElementById('copiar');
    if(cp) cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); cp.textContent = 'Link copiado ✓'; }
      catch { cp.textContent = location.href; }
      setTimeout(()=>cp.textContent='Copiar link', 2000);
    });
    // hidrata com o feed mais fresco (views/data/desc podem ter mudado desde o build)
    load().then(data => {
      const v = (data.videos||[]).find(x=>x.id===id);
      if(!v) return;
      const d = document.querySelector('[data-dyn="date"]');
      if(d) d.textContent = fmt(v.published);
      const m = document.querySelector('[data-dyn="meta"]');
      if(m) m.innerHTML = `${fmt(v.published)} · ${esc(v.cat)}${v.views ? ' · ' + Number(v.views).toLocaleString('pt-BR') + ' views' : ''}`;
      const vd = document.querySelector('[data-dyn="views-dot"]');
      if(vd && v.views) vd.textContent = '· ' + Number(v.views).toLocaleString('pt-BR') + ' views';
      const ds = document.querySelector('[data-dyn="desc"]');
      if(ds && v.desc) ds.textContent = v.desc;
      // ficha de estatísticas: reconstrói a partir do JSON mais fresco
      const statItems = [];
      const comp = n => { try { return new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(Number(n)); } catch { return n; } };
      if(v.views) statItems.push(`<div><b>${comp(v.views)}</b><span>visualizações</span></div>`);
      if(v.likes) statItems.push(`<div><b>${comp(v.likes)}</b><span>curtidas</span></div>`);
      if(v.comments) statItems.push(`<div><b>${comp(v.comments)}</b><span>comentários</span></div>`);
      if(v.duration) statItems.push(`<div><b>${esc(v.duration)}</b><span>duração</span></div>`);
      let st = document.querySelector('[data-dyn="stats"]');
      if(statItems.length && !st){
        st = document.createElement('div');
        st.className = 'stats'; st.setAttribute('data-dyn','stats');
        const bar = scope.querySelector('.video-bar');
        bar ? bar.before(st) : scope.append(st);
      }
      if(st && statItems.length) st.innerHTML = statItems.join('');
      // continuar assistindo: mesma categoria primeiro, depois recentes, sem o atual
      const rail = document.getElementById('cont-rail');
      if(rail){
        const same = data.videos.filter(x=>x.id!==id && x.cat===v.cat && x.cat!=='shorts');
        const rest = data.videos.filter(x=>x.id!==id && x.cat!==v.cat && x.cat!=='shorts');
        rail.innerHTML = [...same, ...rest].slice(0,6).map(card).join('');
      }
    }).catch(()=>{});
  }
})();
