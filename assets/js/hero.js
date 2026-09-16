// Aerosol flow-field hero animation (SPEC.md §5). Canvas 2D: particles
// advected by 2D simplex noise, tinted from the species palette, wrapping
// at the edges instead of resetting so there's no visible seam.

const PARTICLE_COUNT = 120;
const NOISE_FREQ = 0.0025;
const TIME_FREQ = 0.00015;
const SPEED = 0.35;
const MAX_DPR = 2;
const TRAIL_ALPHA = 0.07;

const canvas = document.getElementById('hero-canvas');
const hero = canvas ? canvas.closest('.hero') : null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// 40rem is this file's own "mobile" cutoff for the animation — narrower
// than the 60rem layout breakpoint where the hero switches to two columns.
const belowMobileBreakpoint = window.matchMedia('(max-width: 40rem)').matches;
const noHover = window.matchMedia('(hover: none)').matches;

if (!canvas || !hero || reduceMotion || belowMobileBreakpoint || noHover) {
  // Static hero (CSS --void background, real DOM content) is already
  // complete on its own — nothing more to wait for.
  window.heroReady = true;
} else {
  runHero(canvas, hero);
}

function runHero(canvas, hero) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const rootStyle = getComputedStyle(document.documentElement);
  const voidColor = rootStyle.getPropertyValue('--void').trim() || '#05070C';
  const species = ['--sulfate', '--dust', '--carbon', '--salt']
    .map((name) => rootStyle.getPropertyValue(name).trim());

  const noise = makeSimplex2();
  const particles = [];
  let width = 0;
  let height = 0;

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = voidColor;
    ctx.fillRect(0, 0, width, height);
  }

  function spawn(p) {
    p.x = Math.random() * width;
    p.y = Math.random() * height;
    p.color = species[(Math.random() * species.length) | 0];
    p.radius = 0.6 + Math.random() * 1.4;
  }

  resize();
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = {};
    spawn(p);
    particles.push(p);
  }

  let running = false;
  let inView = false;
  let t = 0;

  function draw() {
    ctx.globalAlpha = TRAIL_ALPHA;
    ctx.fillStyle = voidColor;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const angle = noise(p.x * NOISE_FREQ, p.y * NOISE_FREQ + t) * Math.PI * 4;
      p.x += Math.cos(angle) * SPEED;
      p.y += Math.sin(angle) * SPEED;

      if (p.x < 0) p.x += width;
      else if (p.x > width) p.x -= width;
      if (p.y < 0) p.y += height;
      else if (p.y > height) p.y -= height;

      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    t += TIME_FREQ;
  }

  function tick() {
    if (!running) return;
    draw();
    // First real frame has painted — safe for tools/shot.py --wait now.
    if (!window.heroReady) window.heroReady = true;
    requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
  }

  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    if (inView && !document.hidden) start();
    else stop();
  }).observe(hero);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (inView) start();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
}

// Compact 2D simplex noise (Gustavson's algorithm). No library — this is
// the whole implementation, not a vendored dependency.
function makeSimplex2() {
  const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  return function simplex2(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = grad[perm[ii + perm[jj]] & 7];
      t0 *= t0;
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = grad[perm[ii + i1 + perm[jj + j1]] & 7];
      t1 *= t1;
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = grad[perm[ii + 1 + perm[jj + 1]] & 7];
      t2 *= t2;
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  };
}
