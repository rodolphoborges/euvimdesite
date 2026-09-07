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
  // detalhe v/[id]: usa meta evs-id para embed
  const det = document.getElementById('player');
  if(det && det.dataset.id) liteEmbed(det, det.dataset.id, det.dataset.title || 'Vídeo');
})();
