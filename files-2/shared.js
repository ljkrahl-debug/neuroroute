/* ============================================
   NEUROROUTE · Shared Script
   ============================================ */

// --- Language switching ---
function setLang(lang) {
  document.body.classList.remove('lang-en', 'lang-de');
  document.body.classList.add('lang-' + lang);
  document.documentElement.lang = lang;
  try { localStorage.setItem('nr-lang', lang); } catch(e) {}
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.set === lang);
  });
}

(function initLang() {
  let saved = 'en';
  try { saved = localStorage.getItem('nr-lang') || 'en'; } catch(e) {}
  // run as soon as body exists
  document.addEventListener('DOMContentLoaded', () => {
    setLang(saved);
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.addEventListener('click', () => setLang(b.dataset.set));
    });
    // burger
    const burger = document.querySelector('.nav-burger');
    const links = document.querySelector('.nav-links');
    if (burger && links) {
      burger.addEventListener('click', () => links.classList.toggle('open'));
      links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
    }
    // reveal
    const obs = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    }), { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 0.07}s`;
      obs.observe(el);
    });
  });
  // set class immediately to avoid flash
  document.documentElement.classList.add('lang-' + saved);
})();
