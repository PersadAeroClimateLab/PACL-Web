// Aerosol flow-field hero animation (SPEC.md §5). WebGL: particles
// advected by 2D simplex noise (same algorithm the Canvas 2D version
// used — cheap on the CPU even at a few thousand points), rendered as
// additive point sprites via twgl.js for the glow and density a flat
// Canvas 2D fill/arc loop can't cheaply give. twgl.js is vendored in
// assets/js/vendor/ (see that file's header for version/license) only
// to avoid hand-rolling WebGL's program/buffer boilerplate — SPEC.md §5
// calls raw WebGL "essentially never" worth that cost for a flat field.
// It attaches `window.twgl`; load it as a classic <script> before this
// module (see _includes/hero-canvas.html) so it's ready when this runs.

const PARTICLE_COUNT = 2000;
const NOISE_FREQ = 0.0025;
const TIME_FREQ = 0.00015;
const SPEED = 0.35;
const MAX_DPR = 2;
const TRAIL_ALPHA = 0.07;
const POINT_SIZE_MIN = 1.5;
const POINT_SIZE_MAX = 4;

const canvas = document.getElementById('hero-canvas');
const hero = canvas ? canvas.closest('.hero') : null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// 40rem is this file's own "mobile" cutoff for the animation — narrower
// than the 60rem layout breakpoint where the hero switches to two columns.
const belowMobileBreakpoint = window.matchMedia('(max-width: 40rem)').matches;
const noHover = window.matchMedia('(hover: none)').matches;

const PARTICLE_VS = `
  attribute vec2 position;
  attribute vec3 color;
  attribute float size;
  uniform vec2 resolution;
  uniform float dpr;
  varying vec3 vColor;
  void main() {
    vec2 clip = (position / resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    gl_PointSize = size * dpr;
    vColor = color;
  }
`;

const PARTICLE_FS = `
  precision mediump float;
  varying vec3 vColor;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float alpha = smoothstep(1.0, 0.0, dist);
    alpha *= alpha;
    gl_FragColor = vec4(vColor * alpha, alpha);
  }
`;

const FADE_VS = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FADE_FS = `
  precision mediump float;
  uniform vec4 color;
  void main() {
    gl_FragColor = color;
  }
`;

if (!canvas || !hero || reduceMotion || belowMobileBreakpoint || noHover) {
  // Static hero (CSS --void background, real DOM content) is already
  // complete on its own — nothing more to wait for.
  window.heroReady = true;
} else {
  runHero(canvas, hero);
}

function runHero(canvas, hero) {
  const gl = canvas.getContext('webgl', { alpha: false });
  if (!gl) {
    // No WebGL (old or locked-down browser) — static hero stands alone.
    window.heroReady = true;
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const rootStyle = getComputedStyle(document.documentElement);
  const voidRgb = hexToRgb(rootStyle.getPropertyValue('--void').trim() || '#05070C');
  const species = ['--sulfate', '--dust', '--carbon', '--salt']
    .map((name) => hexToRgb(rootStyle.getPropertyValue(name).trim()));

  const particleProgram = twgl.createProgramInfo(gl, [PARTICLE_VS, PARTICLE_FS]);
  const fadeProgram = twgl.createProgramInfo(gl, [FADE_VS, FADE_FS]);
  const fadeBufferInfo = twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1] },
  });

  const noise = makeSimplex2();
  const positions = new Float32Array(PARTICLE_COUNT * 2);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);
  let width = 0;
  let height = 0;

  function spawn(i) {
    positions[i * 2] = Math.random() * width;
    positions[i * 2 + 1] = Math.random() * height;
    const c = species[(Math.random() * species.length) | 0];
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
    sizes[i] = POINT_SIZE_MIN + Math.random() * (POINT_SIZE_MAX - POINT_SIZE_MIN);
  }

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Resizing resets the drawing buffer — repaint the void color right
    // away so there's no black flash before the first trail-quad pass.
    gl.clearColor(voidRgb[0], voidRgb[1], voidRgb[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  resize();
  for (let i = 0; i < PARTICLE_COUNT; i++) spawn(i);

  const particleBufferInfo = twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 2, data: positions, drawType: gl.DYNAMIC_DRAW },
    color: { numComponents: 3, data: colors },
    size: { numComponents: 1, data: sizes },
  });

  let running = false;
  let inView = false;
  let t = 0;

  function draw() {
    gl.enable(gl.BLEND);

    gl.useProgram(fadeProgram.program);
    twgl.setBuffersAndAttributes(gl, fadeProgram, fadeBufferInfo);
    twgl.setUniforms(fadeProgram, { color: [voidRgb[0], voidRgb[1], voidRgb[2], TRAIL_ALPHA] });
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    twgl.drawBufferInfo(gl, fadeBufferInfo);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = noise(positions[i * 2] * NOISE_FREQ, positions[i * 2 + 1] * NOISE_FREQ + t) * Math.PI * 4;
      let x = positions[i * 2] + Math.cos(angle) * SPEED;
      let y = positions[i * 2 + 1] + Math.sin(angle) * SPEED;
      if (x < 0) x += width;
      else if (x > width) x -= width;
      if (y < 0) y += height;
      else if (y > height) y -= height;
      positions[i * 2] = x;
      positions[i * 2 + 1] = y;
    }
    twgl.setAttribInfoBufferFromArray(gl, particleBufferInfo.attribs.position, positions);

    gl.useProgram(particleProgram.program);
    twgl.setBuffersAndAttributes(gl, particleProgram, particleBufferInfo);
    twgl.setUniforms(particleProgram, { resolution: [width, height], dpr });
    gl.blendFunc(gl.ONE, gl.ONE);
    twgl.drawBufferInfo(gl, particleBufferInfo, gl.POINTS);

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

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
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
