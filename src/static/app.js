(function () {
  var KEY = 'hg-done';
  var TOTAL = document.querySelectorAll('.side a[data-slug]').length;
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }
  function paint() {
    var done = load();
    document.querySelectorAll('[data-slug]').forEach(function (el) {
      var on = done.indexOf(el.getAttribute('data-slug')) >= 0;
      if (el.classList.contains('done-btn')) {
        el.classList.toggle('on', on);
        el.textContent = on ? 'Đã học xong. Bấm để bỏ đánh dấu' : 'Đánh dấu đã học xong bài này';
      } else if (el.tagName === 'A') el.classList.toggle('done', on);
    });
    var n = document.querySelectorAll('.side a[data-slug].done').length;
    document.querySelectorAll('.prog-n').forEach(function (e) { e.textContent = n + '/' + TOTAL; });
    document.querySelectorAll('.prog-b i').forEach(function (e) { e.style.width = (TOTAL ? (n / TOTAL) * 100 : 0) + '%'; });
    var cont = document.querySelector('.continue');
    if (cont) {
      var next = Array.prototype.find.call(document.querySelectorAll('.side a[data-slug]'), function (a) { return !a.classList.contains('done'); });
      if (next && n > 0) { cont.href = next.getAttribute('href'); cont.textContent = 'Học tiếp: ' + next.querySelector('.tx').textContent; }
    }
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    var btn = t.closest('.done-btn');
    if (btn) {
      var done = load();
      var s = btn.getAttribute('data-slug');
      var i = done.indexOf(s);
      if (i >= 0) done.splice(i, 1); else done.push(s);
      save(done);
      paint();
      return;
    }
    var opt = t.closest('.opt');
    if (opt) {
      var box = opt.closest('.quiz');
      if (box.classList.contains('answered')) return;
      box.classList.add('answered');
      box.querySelectorAll('.opt').forEach(function (o) { if (o.hasAttribute('data-ok')) o.classList.add('right'); });
      if (!opt.hasAttribute('data-ok')) opt.classList.add('wrong');
      var why = box.querySelector('.why');
      if (why && why.textContent.trim()) why.hidden = false;
      return;
    }
    var copy = t.closest('.copy');
    if (copy) {
      var code = copy.closest('.code').querySelector('code').innerText;
      navigator.clipboard.writeText(code).then(function () {
        copy.textContent = 'Đã chép';
        setTimeout(function () { copy.textContent = 'Sao chép'; }, 1400);
      });
      return;
    }
    if (t.closest('.menu')) { document.body.classList.toggle('nav-open'); return; }
    if (t.closest('.scrim') || t.closest('.side a')) document.body.classList.remove('nav-open');
    if (t.closest('.theme')) {
      var root = document.documentElement;
      var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      var next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('hg-theme', next); } catch (e2) {}
    }
  });
  paint();
  var cur = document.querySelector('.side a[aria-current]');
  if (cur) cur.scrollIntoView({ block: 'center' });

  // Mục lục bên phải: tô mục đang đọc.
  var links = document.querySelectorAll('.toc a');
  if (links.length && 'IntersectionObserver' in window) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) {
          links.forEach(function (a) { a.classList.remove('on'); });
          var a = map[en.target.id];
          if (a) a.classList.add('on');
        }
      });
    }, { rootMargin: '-70px 0px -70% 0px' });
    document.querySelectorAll('.prose h2[id]').forEach(function (h) { io.observe(h); });
  }
})();
