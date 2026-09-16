// Equirectangular wind-field hero — alternate approach (hero-alt-graphics
// branch). A static world outline (Natural Earth 1:110m coastlines,
// vendored in coastlines.js) plus a lightweight particle flow field that
// follows an idealized zonal-wind band structure (trade-wind easterlies,
// mid-latitude westerlies, polar easterlies) with a small noise-driven
// wobble whose rotational sense flips by hemisphere — a cheap visual
// stand-in for Coriolis deflection, not a physical simulation.
//
// twgl.js (vendored in assets/js/vendor/, see that file's header for
// version/license) avoids hand-rolling WebGL's program/buffer
// boilerplate. It attaches `window.twgl` and is loaded as a classic
// <script> before this module (see _includes/hero-canvas.html).

import { COASTLINES } from './coastlines.js';

const PARTICLE_COUNT = 1500;
// Particle position, wind speed and noise frequency all live in normalized
// map space (u, v in 0..1 across the full 360°x180° equirectangular sheet)
// rather than canvas pixels — resolution-independent, so none of these need
// rescaling when the canvas resizes or the cover-crop transform changes.
const NOISE_FREQ = 4.2;
const TIME_FREQ = 0.0002;
const ZONAL_SPEED = 0.00028;
const CORIOLIS_STRENGTH = 0.00035;
const MAX_DPR = 2;
const TRAIL_ALPHA = 0.05;
const POINT_SIZE_MIN = 1.2;
const POINT_SIZE_MAX = 2.5;
// The map's own aspect ratio (360deg wide : 180deg tall) — used to scale
// and crop it to "cover" the canvas however that's shaped, like CSS
// background-size: cover, instead of stretching it out of proportion.
const MAP_ASPECT = 2;
// Cropping centers on Central America rather than the map's natural
// center (0deg longitude) — the more the canvas aspect ratio departs from
// 2:1, the more gets cropped off the left/right or top/bottom.
const CENTER_LON = -90;
const CENTER_LAT = 15;
const U_CENTER = (CENTER_LON + 180) / 360;
const V_CENTER = (90 - CENTER_LAT) / 180;
// Particle count stays fixed — turnover comes from each particle's own
// random lifespan (in frames, ~60/sec) rather than from repositioning
// whatever wanders off the map edge.
const MIN_LIFESPAN = 240;
const MAX_LIFESPAN = 600;
const FADE_FRAMES = 45;

const canvas = document.getElementById('hero-canvas');
const hero = canvas ? canvas.closest('.hero') : null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// 40rem is this file's own "mobile" cutoff for the animation — narrower
// than the 60rem layout breakpoint where the hero switches to two columns.
const belowMobileBreakpoint = window.matchMedia('(max-width: 40rem)').matches;
const noHover = window.matchMedia('(hover: none)').matches;

// position is normalized map space (u, v in 0..1), same as the coastlines
// — mapTransform (scaleU, uMin, scaleV, offsetV) is the shared cover-crop
// applied to both, so wind particles always line up with the coastline
// under them regardless of canvas aspect ratio. Longitude wraps (mod)
// rather than clamps, since the map is cyclic east-west — clamping would
// pull the crop window off Central America for any aspect ratio wide
// enough that the window can't fit without crossing the u=0/1 seam.
// Latitude doesn't wrap (no pole-to-pole cycling), so v is direct.
const PARTICLE_VS = `
  attribute vec2 position;
  attribute float size;
  attribute float alpha;
  uniform vec4 mapTransform;
  uniform float dpr;
  varying float vAlpha;
  void main() {
    float relU = mod(position.x - mapTransform.y, 1.0);
    float clipX = relU * mapTransform.x - 1.0;
    float clipY = position.y * mapTransform.z + mapTransform.w;
    gl_Position = vec4(clipX, -clipY, 0.0, 1.0);
    gl_PointSize = size * dpr;
    vAlpha = alpha;
  }
`;

const PARTICLE_FS = `
  precision mediump float;
  uniform vec4 color;
  varying float vAlpha;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float alpha = smoothstep(1.0, 0.0, dist) * color.a * vAlpha;
    gl_FragColor = vec4(color.rgb * alpha, alpha);
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

// Coastline vertices are pre-normalized to 0..1 (see buildCoastlineVertices);
// mapTransform applies the same cover-crop as the particles (see
// PARTICLE_VS), but deliberately WITHOUT the longitude wrap: coastlines
// draw as gl.LINES (independent 2-vertex segments), and wrapping each
// vertex independently makes any segment that straddles the seam draw a
// spurious line clear across the visible map at that latitude. Antarctica
// (circumpolar) and any Arctic coastline crossing the seam always hit
// this. Un-wrapped, that one segment just doesn't render — a small gap
// at the map's cropped edge — instead of a stray horizontal line.
const COAST_VS = `
  attribute vec2 position;
  uniform vec4 mapTransform;
  void main() {
    float clipX = (position.x - mapTransform.y) * mapTransform.x - 1.0;
    float clipY = position.y * mapTransform.z + mapTransform.w;
    gl_Position = vec4(clipX, -clipY, 0.0, 1.0);
  }
`;

const COAST_FS = `
  precision mediump float;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
`;

if (!canvas || !hero || reduceMotion || belowMobileBreakpoint || noHover) {
  // Static hero (CSS background, real DOM content) is already complete
  // on its own — nothing more to wait for.
  window.heroReady = true;
} else {
  runHero(canvas, hero);
}

function runHero(canvas, hero) {
  // preserveDrawingBuffer: the trail effect works by blending a low-alpha
  // fade quad over the previous frame instead of clearing — without this,
  // the spec allows the browser to clear the buffer between frames anyway.
  const gl = canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: true });
  if (!gl) {
    // No WebGL (old or locked-down browser) — static hero stands alone.
    window.heroReady = true;
    return;
  }

  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const rootStyle = getComputedStyle(document.documentElement);
  const bgRgb = hexToRgb(rootStyle.getPropertyValue('--paper').trim() || '#FAFAF7');
  const windRgb = hexToRgb(rootStyle.getPropertyValue('--link').trim() || '#4A6FA5');

  const particleProgram = twgl.createProgramInfo(gl, [PARTICLE_VS, PARTICLE_FS]);
  const fadeProgram = twgl.createProgramInfo(gl, [FADE_VS, FADE_FS]);
  const coastProgram = twgl.createProgramInfo(gl, [COAST_VS, COAST_FS]);

  const fadeBufferInfo = twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1] },
  });
  const coastBufferInfo = twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 2, data: buildCoastlineVertices() },
  });

  const noise = makeSimplex2();
  const positions = new Float32Array(PARTICLE_COUNT * 2);
  const sizes = new Float32Array(PARTICLE_COUNT);
  const ages = new Float32Array(PARTICLE_COUNT);
  const lifespans = new Float32Array(PARTICLE_COUNT);
  const alphas = new Float32Array(PARTICLE_COUNT);
  let width = 0;
  let height = 0;

  // Called both at startup and whenever a particle's age catches up to its
  // lifespan — a fresh random point anywhere on the map, not tied to
  // whatever edge it happened to wander off of.
  function spawn(i) {
    positions[i * 2] = Math.random();
    positions[i * 2 + 1] = Math.random();
    sizes[i] = POINT_SIZE_MIN + Math.random() * (POINT_SIZE_MAX - POINT_SIZE_MIN);
    lifespans[i] = MIN_LIFESPAN + Math.random() * (MAX_LIFESPAN - MIN_LIFESPAN);
    ages[i] = 0;
  }

  // scaleU/uMin/scaleV/offsetV mapping normalized map space to clip
  // space — like CSS background-size: cover, scaled up until both axes
  // fill the canvas and the overflow on whichever axis that leaves is
  // cropped off, centered on Central America (U_CENTER, V_CENTER) rather
  // than the map's natural center. Recomputed on resize only — it doesn't
  // depend on anything that changes frame to frame.
  let mapTransform = [2, 0, 2, -1];

  function computeMapTransform() {
    const canvasAspect = width / height;
    const visibleU = Math.min(1, canvasAspect / MAP_ASPECT);
    const visibleV = Math.min(1, MAP_ASPECT / canvasAspect);
    // uMin is deliberately not clamped to [0, 1-visibleU] — longitude is
    // cyclic (the shader wraps it with mod), so going negative just means
    // the crop window straddles the antimeridian, not that it's invalid.
    // Latitude has no such wraparound, so vMin does need the clamp.
    const uMin = U_CENTER - visibleU / 2;
    const vMin = Math.min(Math.max(V_CENTER - visibleV / 2, 0), 1 - visibleV);
    const scaleU = 2 / visibleU;
    const scaleV = 2 / visibleV;
    mapTransform = [scaleU, uMin, scaleV, -vMin * scaleV - 1];
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
    computeMapTransform();
    gl.clearColor(bgRgb[0], bgRgb[1], bgRgb[2], 1);
    // Resizing resets the drawing buffer — repaint the background right
    // away so there's no black flash before the first trail-quad pass.
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  resize();
  for (let i = 0; i < PARTICLE_COUNT; i++) spawn(i);

  const particleBufferInfo = twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 2, data: positions, drawType: gl.DYNAMIC_DRAW },
    size: { numComponents: 1, data: sizes },
    alpha: { numComponents: 1, data: alphas, drawType: gl.DYNAMIC_DRAW },
  });

  let running = false;
  let inView = false;
  let t = 0;

  function draw() {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(fadeProgram.program);
    twgl.setBuffersAndAttributes(gl, fadeProgram, fadeBufferInfo);
    twgl.setUniforms(fadeProgram, { color: [bgRgb[0], bgRgb[1], bgRgb[2], TRAIL_ALPHA] });
    twgl.drawBufferInfo(gl, fadeBufferInfo);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      ages[i] += 1;
      if (ages[i] >= lifespans[i]) {
        spawn(i);
      } else {
        const lat = 90 - positions[i * 2 + 1] * 180;
        const u = zonalU(lat) * ZONAL_SPEED;
        const wobble = noise(positions[i * 2] * NOISE_FREQ, positions[i * 2 + 1] * NOISE_FREQ + t);
        const v = wobble * CORIOLIS_STRENGTH * Math.sign(lat);
        positions[i * 2] += u;
        positions[i * 2 + 1] += v;
      }
      // Ramp up over the first FADE_FRAMES, ramp down over the last —
      // whichever ramp is lower wins, so a lifespan shorter than 2x
      // FADE_FRAMES just never reaches full opacity instead of popping.
      const fadeIn = Math.min(1, ages[i] / FADE_FRAMES);
      const fadeOut = Math.min(1, (lifespans[i] - ages[i]) / FADE_FRAMES);
      alphas[i] = Math.max(0, Math.min(fadeIn, fadeOut));
    }
    twgl.setAttribInfoBufferFromArray(gl, particleBufferInfo.attribs.position, positions);
    twgl.setAttribInfoBufferFromArray(gl, particleBufferInfo.attribs.alpha, alphas);

    // Coastlines redraw every frame (cheap — one static buffer, one draw
    // call) so they stay crisp instead of fading with the trail.
    gl.useProgram(coastProgram.program);
    twgl.setBuffersAndAttributes(gl, coastProgram, coastBufferInfo);
    twgl.setUniforms(coastProgram, { mapTransform });
    twgl.drawBufferInfo(gl, coastBufferInfo, gl.LINES);

    gl.useProgram(particleProgram.program);
    twgl.setBuffersAndAttributes(gl, particleProgram, particleBufferInfo);
    twgl.setUniforms(particleProgram, {
      mapTransform,
      dpr,
      color: [windRgb[0], windRgb[1], windRgb[2], 0.6],
    });
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

// Flattens each coastline (a [lon, lat, lon, lat, ...] polyline) into
// independent gl.LINES segments — pairs of vertices, not one connected
// strip — so unrelated coastlines never draw a spurious connecting line
// between them. Runs once; normalized to 0..1 so it's resize-independent.
function buildCoastlineVertices() {
  const verts = [];
  for (const line of COASTLINES) {
    for (let i = 0; i < line.length - 2; i += 2) {
      verts.push((line[i] + 180) / 360, (90 - line[i + 1]) / 180);
      verts.push((line[i + 2] + 180) / 360, (90 - line[i + 3]) / 180);
    }
  }
  return new Float32Array(verts);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Idealized three-cell circulation, smoothed across the ~30/60 degree band
// edges instead of a hard step: easterlies (trade winds) near the equator,
// westerlies in the mid-latitudes, polar easterlies beyond ~60 degrees. A
// visual approximation, not a physical model — SPEC.md explicitly allows
// taking liberties here to keep this cheap.
function zonalU(latDeg) {
  const a = Math.abs(latDeg);
  const t1 = smoothstep(20, 40, a);
  const t2 = smoothstep(50, 70, a);
  return (-1 + 2 * t1) * (1 - t2) - t2;
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
