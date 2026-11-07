const canvas = document.getElementById('cubeCanvas');
const ctx = canvas.getContext('2d');
const bgCanvas = document.getElementById('bgCanvas');
const bgctx = bgCanvas.getContext('2d');
const glCanvas = document.getElementById('cubeCanvasGL');
const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');

// WebGL setup
let glProgram = null;
let glBuffers = null;
let glUniforms = {};

function initGL() {
  if (!gl) return;

  const vsSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uModelView;
    uniform mat4 uProjection;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vec4 pos = uModelView * vec4(aPosition, 1.0);
      gl_Position = uProjection * pos;
      vNormal = aNormal;
      vPosition = pos.xyz;
    }
  `;

  const fsSource = `
    precision mediump float;
    uniform vec3 uColor;
    uniform vec3 uGlow;
    uniform float uTime;
    uniform float uExtraGlow;
    uniform float uAlpha;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
      float diff = max(dot(n, lightDir), 0.0);
      float ambient = 0.3;
      vec3 color = uColor * (ambient + diff * 0.7);
      // fresnel rim
      vec3 viewDir = normalize(-vPosition);
      float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
      color += uGlow * fresnel * (0.5 + uExtraGlow * 1.5);
      // sharp specular highlight for a glassy surface
      vec3 halfDir = normalize(lightDir + viewDir);
      float spec = pow(max(dot(n, halfDir), 0.0), 48.0);
      color += uGlow * spec * 0.55;
      // emissive pulse
      color += uColor * (0.1 + 0.05 * sin(uTime * 4.0));
      // slow light sweep across the faces
      float sweep = sin(vPosition.y * 2.2 - uTime * 1.4) * 0.5 + 0.5;
      color += uGlow * sweep * (0.035 + uExtraGlow * 0.12);
      // extra glow during deceleration
      color += uGlow * uExtraGlow * 0.8;
      gl_FragColor = vec4(color, uAlpha);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = compileShader(gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return;

  glProgram = gl.createProgram();
  gl.attachShader(glProgram, vs);
  gl.attachShader(glProgram, fs);
  gl.linkProgram(glProgram);
  if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(glProgram));
    return;
  }

  gl.useProgram(glProgram);

  // cube vertices (position + normal)
  const vertices = [
    // front
    -1, -1,  1,  0,  0,  1,
     1, -1,  1,  0,  0,  1,
     1,  1,  1,  0,  0,  1,
    -1,  1,  1,  0,  0,  1,
    // back
    -1, -1, -1,  0,  0, -1,
     1, -1, -1,  0,  0, -1,
     1,  1, -1,  0,  0, -1,
    -1,  1, -1,  0,  0, -1,
    // top
    -1,  1, -1,  0,  1,  0,
     1,  1, -1,  0,  1,  0,
     1,  1,  1,  0,  1,  0,
    -1,  1,  1,  0,  1,  0,
    // bottom
    -1, -1, -1,  0, -1,  0,
     1, -1, -1,  0, -1,  0,
     1, -1,  1,  0, -1,  0,
    -1, -1,  1,  0, -1,  0,
    // right
     1, -1, -1,  1,  0,  0,
     1,  1, -1,  1,  0,  0,
     1,  1,  1,  1,  0,  0,
     1, -1,  1,  1,  0,  0,
    // left
    -1, -1, -1, -1,  0,  0,
    -1,  1, -1, -1,  0,  0,
    -1,  1,  1, -1,  0,  0,
    -1, -1,  1, -1,  0,  0,
  ];

  const indices = [
    0, 1, 2, 0, 2, 3,       // front
    4, 5, 6, 4, 6, 7,       // back
    8, 9, 10, 8, 10, 11,    // top
    12, 13, 14, 12, 14, 15, // bottom
    16, 17, 18, 16, 18, 19, // right
    20, 21, 22, 20, 22, 23, // left
  ];

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  const idxBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  // wireframe edges of the same cube (12 lines) for a hi-tech overlay
  const edges = [
    0, 1, 1, 2, 2, 3, 3, 0,       // front square
    4, 5, 5, 6, 6, 7, 7, 4,       // back square
    0, 4, 1, 5, 2, 6, 3, 7,       // connectors
  ];
  const edgeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgeBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(edges), gl.STATIC_DRAW);

  glBuffers = { posBuffer, idxBuffer, edgeBuffer, vertexCount: indices.length, edgeCount: edges.length };

  // attribute locations
  const aPos = gl.getAttribLocation(glProgram, 'aPosition');
  const aNorm = gl.getAttribLocation(glProgram, 'aNormal');
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aNorm);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 24, 12);

  // uniforms
  glUniforms.uModelView = gl.getUniformLocation(glProgram, 'uModelView');
  glUniforms.uProjection = gl.getUniformLocation(glProgram, 'uProjection');
  glUniforms.uColor = gl.getUniformLocation(glProgram, 'uColor');
  glUniforms.uGlow = gl.getUniformLocation(glProgram, 'uGlow');
  glUniforms.uTime = gl.getUniformLocation(glProgram, 'uTime');
  glUniforms.uExtraGlow = gl.getUniformLocation(glProgram, 'uExtraGlow');
  glUniforms.uAlpha = gl.getUniformLocation(glProgram, 'uAlpha');

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
}

function mat4Multiply(a, b) {
  const result = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[i + k * 4] * b[j * 4 + k];
      }
      result[i + j * 4] = sum;
    }
  }
  return result;
}

function mat4RotationX(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
}

function mat4RotationY(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}

function mat4Perspective(fov, aspect, near, far) {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function mat4Translate(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function mat4Scale(x, y, z) {
  return new Float32Array([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ]);
}

function hslToRGB(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s /= 100;
  l /= 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function hslHex(h, s, l) {
  const c = hslToRGB(h, s, l);
  const to = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return '#' + to(c[0]) + to(c[1]) + to(c[2]);
}

function blendHex(a, b, k) {
  const ca = hexToRGB(a);
  const cb = hexToRGB(b);
  const to = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return '#' + to(ca[0] + (cb[0] - ca[0]) * k) + to(ca[1] + (cb[1] - ca[1]) * k) + to(ca[2] + (cb[2] - ca[2]) * k);
}

const _hexRGB_cache = new Map();
function hexToRGB(hex) {
  if (_hexRGB_cache.has(hex)) return _hexRGB_cache.get(hex);
  let res;
  if (!hex) res = [1, 1, 1];
  else if (hex === 'rainbow' || hex === 'prism') res = [1, 1, 1];
  else if (hex.indexOf('hsl') === 0) {
    const m = hex.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/);
    if (m) res = hslToRGB(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    else res = [1, 1, 1];
  } else if (hex.indexOf('#') === 0) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    res = [parseInt(full.slice(0,2), 16) / 255, parseInt(full.slice(2,4), 16) / 255, parseInt(full.slice(4,6), 16) / 255];
  } else {
    res = [1, 1, 1];
  }
  _hexRGB_cache.set(hex, res);
  return res;
}

function drawGLCube(color, glow, t, extraGlow) {
  if (!gl || !glProgram || !glBuffers) return;

  const w = glCanvas.width;
  const h = glCanvas.height;
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(glProgram);

  const aspect = w / h;
  const proj = mat4Perspective(Math.PI / 4, aspect, 0.1, 100);
  const view = mat4Translate(0, 0, -8);
  const rotX = mat4RotationX(-0.35 + cubeRotX); // fixed tilt + tumble
  const rotY = mat4RotationY(cubeRot);
  const tilt = mat4Multiply(rotY, rotX);

  const colorRGB = hexToRGB(color);
  const glowRGB = hexToRGB(glow);
  const eg = extraGlow || 0;

  const aPos = gl.getAttribLocation(glProgram, 'aPosition');
  const aNorm = gl.getAttribLocation(glProgram, 'aNormal');
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuffers.posBuffer);
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aNorm);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 24, 12);

  gl.uniformMatrix4fv(glUniforms.uProjection, false, proj);
  gl.uniform3fv(glUniforms.uGlow, glowRGB);
  gl.uniform1f(glUniforms.uTime, t);
  gl.uniform1f(glUniforms.uExtraGlow, eg);

  // main cube
  gl.uniformMatrix4fv(glUniforms.uModelView, false, mat4Multiply(view, tilt));
  gl.uniform3fv(glUniforms.uColor, colorRGB);
  gl.uniform1f(glUniforms.uAlpha, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffers.idxBuffer);
  gl.drawElements(gl.TRIANGLES, glBuffers.vertexCount, gl.UNSIGNED_SHORT, 0);

  // inner core: smaller, counter-rotating, glows with the rarity colour
  const coreTilt = mat4Multiply(mat4RotationY(-cubeRot * 1.8), mat4RotationX(0.55 + Math.sin(t * 0.7) * 0.12));
  const coreMV = mat4Multiply(view, mat4Multiply(coreTilt, mat4Scale(0.52, 0.52, 0.52)));
  gl.uniformMatrix4fv(glUniforms.uModelView, false, coreMV);
  gl.uniform3fv(glUniforms.uColor, glowRGB);
  gl.uniform3fv(glUniforms.uGlow, colorRGB);
  gl.uniform1f(glUniforms.uAlpha, 0.62 + eg * 0.3);
  gl.uniform1f(glUniforms.uExtraGlow, eg + 0.35);
  gl.drawElements(gl.TRIANGLES, glBuffers.vertexCount, gl.UNSIGNED_SHORT, 0);

  // subtle obj nod: the eight little coloured cubes from objbox, living
  // inside the big cube. depth test off so they read as a ghost inside it.
  const objPalette = [
    [1, 0.2, 0.3], [0.2, 1, 0.3], [0.2, 0.3, 1], [1, 1, 0.2],
    [1, 0.2, 1], [0.2, 1, 1], [1, 0.6, 0.1], [0.6, 0.2, 1]
  ];
  const objPhase = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  for (let i = 0; i < objPalette.length; i++) {
    const ang = objPhase[i] + t * (i % 2 ? -0.45 : 0.6);
    const rad = 0.5;
    const tx = Math.cos(ang) * rad;
    const tz = Math.sin(ang) * rad;
    const ty = Math.sin(t * 0.9 + i * 1.7) * 0.16;
    const s = 0.12 + (i % 3) * 0.018;
    const local = mat4Multiply(
      mat4Translate(tx, ty, tz),
      mat4Multiply(mat4RotationY(ang * 2.4), mat4Multiply(mat4RotationX(ang * 1.7 + i), mat4Scale(s, s, s)))
    );
    gl.uniformMatrix4fv(glUniforms.uModelView, false, mat4Multiply(view, mat4Multiply(tilt, local)));
    gl.uniform3fv(glUniforms.uColor, objPalette[i]);
    gl.uniform3fv(glUniforms.uGlow, objPalette[i]);
    gl.uniform1f(glUniforms.uAlpha, 0.30 + eg * 0.15);
    gl.uniform1f(glUniforms.uExtraGlow, 0.6);
    gl.drawElements(gl.TRIANGLES, glBuffers.vertexCount, gl.UNSIGNED_SHORT, 0);
  }
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);

  // wireframe halo on top of the main cube (additive)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);
  const haloMV = mat4Multiply(view, mat4Multiply(tilt, mat4Scale(1.03, 1.03, 1.03)));
  gl.uniformMatrix4fv(glUniforms.uModelView, false, haloMV);
  gl.uniform3fv(glUniforms.uColor, glowRGB);
  gl.uniform3fv(glUniforms.uGlow, glowRGB);
  gl.uniform1f(glUniforms.uAlpha, 0.42 + eg * 0.45);
  gl.uniform1f(glUniforms.uExtraGlow, eg + 0.5);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffers.edgeBuffer);
  gl.drawElements(gl.LINES, glBuffers.edgeCount, gl.UNSIGNED_SHORT, 0);
  gl.depthMask(true);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

// init GL
initGL();

/* ── ambient background layer ─────────────────────────────────────────── */
const bgStars = [];
for (let i = 0; i < 110; i++) {
  bgStars.push({
    x: Math.random(),
    y: Math.random(),
    z: 0.25 + Math.random() * 0.75,
    size: 0.6 + Math.random() * 1.9,
    tw: Math.random() * Math.PI * 2
  });
}

// draggable backdrop state
let bgPanX = 0, bgPanY = 0, bgPanVX = 0, bgPanVY = 0;
let bgDragging = false, bgDragMoved = false;
let bgDragLastX = 0, bgDragLastY = 0;
let suppressRollClick = false;

function rgbaOf(hex, a) {
  const c = hexToRGB(hex);
  return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + a + ')';
}

function drawBackground(w, h, t, color, glow) {
  if (!bgctx) return;

  // base wash, tinted by the current time period
  let tint;
  if (timePeriod === 'past') tint = [70, 44, 12];
  else if (timePeriod === 'future') tint = [48, 14, 76];
  else tint = [16, 42, 60];
  const base = bgctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, 'rgba(4, 8, 13, 1)');
  base.addColorStop(0.55, 'rgba(' + tint[0] * 0.16 + ',' + tint[1] * 0.16 + ',' + tint[2] * 0.16 + ', 1)');
  base.addColorStop(1, 'rgba(2, 3, 4, 1)');
  bgctx.fillStyle = base;
  bgctx.fillRect(0, 0, w, h);

  // slow drifting nebula blobs
  const blobs = [
    { cx: 0.28, cy: 0.32, r: 0.55, sp: 0.10, a: 0.16 },
    { cx: 0.74, cy: 0.44, r: 0.5, sp: -0.13, a: 0.13 },
    { cx: 0.52, cy: 0.78, r: 0.42, sp: 0.08, a: 0.10 }
  ];
  for (const b of blobs) {
    const cx = w * (b.cx + Math.sin(t * b.sp) * 0.05 + bgPanX * 0.45);
    const cy = h * (b.cy + Math.cos(t * b.sp * 1.3) * 0.04 + bgPanY * 0.45);
    const r = Math.max(w, h) * b.r;
    const g = bgctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ',' + b.a + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    bgctx.fillStyle = g;
    bgctx.fillRect(0, 0, w, h);
  }

  // rarity halo behind the cube
  const haloR = Math.max(w, h) * (0.34 + rollGlow * 0.10);
  const hx = w / 2 + bgPanX * w * 0.08;
  const hy = h / 2 + bgPanY * h * 0.08;
  const halo = bgctx.createRadialGradient(hx, hy, 0, hx, hy, haloR);
  halo.addColorStop(0, rgbaOf(glow, 0.16 + rollGlow * 0.20));
  halo.addColorStop(0.4, rgbaOf(color, 0.07 + rollGlow * 0.10));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  bgctx.fillStyle = halo;
  bgctx.fillRect(0, 0, w, h);

  // starfield
  for (const s of bgStars) {
    s.y -= 0.00022 * s.z * 60 / 60;
    if (s.y < -0.02) { s.y = 1.02; s.x = Math.random(); }
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2 + s.tw));
    bgctx.globalAlpha = tw * (0.3 + s.z * 0.6);
    bgctx.fillStyle = s.z > 0.75 ? rgbaOf(glow, 1) : 'rgba(190,225,240,1)';
    const sx = ((s.x + bgPanX * 0.5) % 1 + 1) % 1;
    const sy = ((s.y + bgPanY * 0.5) % 1 + 1) % 1;
    bgctx.fillRect(sx * w, sy * h, s.size * s.z, s.size * s.z);
  }
  bgctx.globalAlpha = 1;

  // perspective floor grid
  const horizon = h * (0.60 + bgPanY * 0.35);
  const gridCx = w / 2 + bgPanX * w * 0.30;
  const scroll = (t * 0.06) % 1;
  bgctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const p = (i + scroll) / 14;
    const y = horizon + Math.pow(p, 2.2) * (h - horizon);
    bgctx.strokeStyle = 'rgba(43, 208, 208,' + (0.02 + p * 0.07) + ')';
    bgctx.beginPath();
    bgctx.moveTo(0, y);
    bgctx.lineTo(w, y);
    bgctx.stroke();
  }
  for (let i = -9; i <= 9; i++) {
    bgctx.strokeStyle = 'rgba(43, 208, 208, 0.035)';
    bgctx.beginPath();
    bgctx.moveTo(gridCx + i * w * 0.028, horizon);
    bgctx.lineTo(gridCx + i * w * 0.20, h);
    bgctx.stroke();
  }

  // top scanline sheen
  const sheen = bgctx.createLinearGradient(0, 0, 0, h * 0.35);
  sheen.addColorStop(0, 'rgba(120, 220, 230, 0.05)');
  sheen.addColorStop(1, 'rgba(120, 220, 230, 0)');
  bgctx.fillStyle = sheen;
  bgctx.fillRect(0, 0, w, h * 0.35);
}

function drawOrbit(w, h, t, color, glow, extra) {
  const cx = w / 2;
  const cy = h / 2;
  const rx = Math.min(w, h) * 0.34;
  const ry = rx * 0.30;
  const col = color === 'rainbow' || color === 'prism' ? glow : color;

  for (let ring = 0; ring < 2; ring++) {
    const tilt = ring === 0 ? 0.0 : 0.55;
    const speed = (ring === 0 ? 0.55 : -0.38);
    const count = ring === 0 ? 16 : 12;
    for (let i = 0; i < count; i++) {
      const ang = t * speed + (i / count) * Math.PI * 2;
      const px = cx + Math.cos(ang) * rx;
      const py = cy + Math.sin(ang) * ry + Math.sin(ang * 2 + tilt) * ry * 0.35;
      const depth = 0.5 + 0.5 * Math.sin(ang);
      const a = (0.12 + depth * 0.45) * (0.8 + extra * 0.6);
      const size = 0.9 + depth * 2.2;
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}


const flash = document.getElementById('flash');
const chromatic = document.getElementById('chromatic');
const rollText = document.getElementById('rollText');
const rarityTable = document.getElementById('rarityTable');
const inventoryEl = document.getElementById('inventory');
const lastRollEl = document.getElementById('lastRoll');
const luckEl = document.getElementById('luck');
const rollsEl = document.getElementById('rolls');
const creditsEl = document.getElementById('credits');
const biomeEl = document.getElementById('biome');
const biomeTimerEl = document.getElementById('biomeTimer');
const streakStatEl = document.getElementById('streakStat');
const collectionStatEl = document.getElementById('collectionStat');
const objLineEl = document.getElementById('objLine');
const sceneCanvasEl = document.getElementById('sceneCanvas');
const shopBtn = document.getElementById('shopBtn');
const shopModal = document.getElementById('shopModal');
const shopItems = document.getElementById('shopItems');
const shopCredits = document.getElementById('shopCredits');
const shopClose = document.getElementById('shopClose');
const shopkeeperText = document.getElementById('shopkeeperText');
const shopkeeperSvg = document.getElementById('shopkeeperSvg');
const achievementsBtn = document.getElementById('achievementsBtn');
const achievementsModal = document.getElementById('achievementsModal');
const achievementsList = document.getElementById('achievementsList');
const achievementsClose = document.getElementById('achievementsClose');
const changelogBtn = document.getElementById('changelogBtn');
const changelogModal = document.getElementById('changelogModal');
const changelogList = document.getElementById('changelogList');
const changelogClose = document.getElementById('changelogClose');
const toast = document.getElementById('toast');
const leaderboardBtn = document.getElementById('leaderboardBtn');
const leaderboardModal = document.getElementById('leaderboardModal');
const dailyBtn = document.getElementById('dailyBtn');
const dailyModal = document.getElementById('dailyModal');
const fuseBtn = document.getElementById('fuseBtn');
const fuseModal = document.getElementById('fuseModal');
if (fuseBtn) fuseBtn.addEventListener('click', () => { openModal(fuseModal); renderFuse(); });
const fuseList = document.getElementById('fuseList');
const eventsModal = document.getElementById('eventsModal');
const eventsList = document.getElementById('eventsList');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const evolveModal = document.getElementById('evolveModal');
const evolveList = document.getElementById('evolveList');
const showcaseModal = document.getElementById('showcaseModal');
const showcaseContent = document.getElementById('showcaseContent');
const recipeModal = document.getElementById('recipeModal');
const recipeList = document.getElementById('recipeList');
const statsModal = document.getElementById('statsModal');
const statsList = document.getElementById('statsList');
const dailyList = document.getElementById('dailyList');
const dailyClose = document.getElementById('dailyClose');
const leaderboardList = document.getElementById('leaderboardList');
const leaderboardClose = document.getElementById('leaderboardClose');
const lbUsername = document.getElementById('lbUsername');
const lbSubmit = document.getElementById('lbSubmit');

const LB_API = 'https://lux-rng-leaderboard.dandelion-newsstand.workers.dev';
let lbOfflineScores = [];

try {
  const raw = localStorage.getItem('luxRngLeaderboard');
  if (raw) lbOfflineScores = JSON.parse(raw);
} catch (e) {}

function saveOfflineScores() {
  try { localStorage.setItem('luxRngLeaderboard', JSON.stringify(lbOfflineScores.slice(0, 20))); } catch (e) {}
}

function renderLeaderboardRows(data) {
  leaderboardList.innerHTML = '';
  if (data.length === 0) {
    leaderboardList.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">no scores yet</div>';
    return;
  }
  data.forEach((entry, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;padding:6px 8px;margin-bottom:4px;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05)';
    row.innerHTML = '<span style="color:var(--muted)">' + (i + 1) + '.</span> <span style="color:var(--text)">' + escapeHtml(entry.username) + '</span> <span style="color:var(--cyan-bright)">' + formatNum(entry.score) + '</span>';
    leaderboardList.appendChild(row);
  });
}

async function fetchLeaderboard() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(LB_API + '/leaderboard', { signal: controller.signal, mode: 'cors' });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('server error');
      const data = await res.json();
      renderLeaderboardRows(data);
      return;
    } catch (e) {
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  // offline fallback
  renderLeaderboardRows(lbOfflineScores);
  const note = document.createElement('div');
  note.style.cssText = 'color:var(--muted);text-align:center;padding:8px;font-size:10px;letter-spacing:1px';
  note.textContent = 'offline mode — scores saved locally';
  leaderboardList.appendChild(note);
}

async function submitScore() {
  const name = lbUsername.value.trim();
  if (!name) { showToast('enter a name first'); return; }
  const best = getCurrentRarities()[bestRarityIndex] || getCurrentRarities()[0];
  const entry = { username: name, score: credits, rolls: rolls, best_rarity: best.name, time_period: timePeriod, date: Date.now() };
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      await fetch(LB_API + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeout);
      showToast('score submitted!');
      fetchLeaderboard();
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  lbOfflineScores.push(entry);
  lbOfflineScores.sort((a, b) => b.score - a.score);
  saveOfflineScores();
  renderLeaderboardRows(lbOfflineScores);
  showToast('offline score saved');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const bestRollStat = document.getElementById('bestRollStat');
const playtimeStat = document.getElementById('playtimeStat');
const resetSaveBtn = document.getElementById('resetSaveBtn');
const musicBtn = document.getElementById('musicBtn');
const flashBtn = document.getElementById('settingsFlashBtn');
let flashesEnabled = true;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// bg music state
let musicPlaying = true;
const bgmAudio = new Audio('https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/bgm.mp3');
bgmAudio.loop = true;
bgmAudio.volume = 0.25;
// music per time period (swap files when provided)
const periodMusic = { present: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/bgm.mp3', past: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/past_bgm.mp3', future: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/future_bgm.mp3' };
const musicTracks = [
  { name: 'Ancient Ruins Courtyard', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ancient.Ruins.Courtyard.mp3' },
  { name: 'Ancient Ruins Late Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ancient.Ruins.Late.Night.mp3' },
  { name: 'Ancient Ruins Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ancient.Ruins.Night.mp3' },
  { name: 'Ancient Ruins Relaxed', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ancient.Ruins.Relaxed.mp3' },
  { name: 'Ancient Ruins Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ancient.Ruins.Theme.mp3' },
  { name: 'Desert Firestorm', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Desert.Firestorm.mp3' },
  { name: 'Desert Heating Up', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Desert.Heating.Up.mp3' },
  { name: 'Dry Reef Late Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Dry.Reef.Late.Night.mp3' },
  { name: 'Dry Reef Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Dry.Reef.Night.mp3' },
  { name: 'Dry Reef Relaxed', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Dry.Reef.Relaxed.mp3' },
  { name: 'Dry Reef Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Dry.Reef.Theme.mp3' },
  { name: 'Glass Desert Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Glass.Desert.Night.mp3' },
  { name: 'Glass Desert Relaxed', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Glass.Desert.Relaxed.mp3' },
  { name: 'Glass Desert Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Glass.Desert.Theme.mp3' },
  { name: 'Indigo Quarry Late Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Indigo.Quarry.Late.Night.mp3' },
  { name: 'Indigo Quarry Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Indigo.Quarry.Night.mp3' },
  { name: 'Indigo Quarry Relaxed', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Indigo.Quarry.Relaxed.mp3' },
  { name: 'Indigo Quarry Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Indigo.Quarry.Theme.mp3' },
  { name: 'Less Awful Ravenous Rainbows', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Less.Awful.Ravenous.Rainbows.mp3' },
  { name: 'Let\'s Go, Beatrix!', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Let.s.Go.Beatrix.mp3' },
  { name: 'Mochi\'s Manor Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Mochi.s.Manor.Night.mp3' },
  { name: 'Mochi\'s Manor Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Mochi.s.Manor.Theme.mp3' },
  { name: 'Moss Blanket Late Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Moss.Blanket.Late.Night.mp3' },
  { name: 'Moss Blanket Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Moss.Blanket.Night.mp3' },
  { name: 'Moss Blanket Relaxed', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Moss.Blanket.Relaxed.mp3' },
  { name: 'Moss Blanket Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Moss.Blanket.Theme.mp3' },
  { name: 'Nimble Valley Race', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Nimble.Valley.Race.mp3' },
  { name: 'Nimble Valley Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Nimble.Valley.Theme.mp3' },
  { name: 'Ogden\'s Retreat Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ogden.s.Retreat.Night.mp3' },
  { name: 'Ogden\'s Retreat Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ogden.s.Retreat.Theme.mp3' },
  { name: 'Party Gordo Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Party.Gordo.Theme.mp3' },
  { name: 'Radio Elevator Shimmy', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Radio.Elevator.Shimmy.mp3' },
  { name: 'Radio Good Morning', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Radio.Good.Morning.mp3' },
  { name: 'Radio Jazzy', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Radio.Jazzy.mp3' },
  { name: 'Radio Romantic', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Radio.Romantic.mp3' },
  { name: 'Ranch Late Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ranch.Late.Night.mp3' },
  { name: 'Ranch Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ranch.Night.mp3' },
  { name: 'Ranch Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ranch.Theme.mp3' },
  { name: 'Ranch Wistful', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Ranch.Wistful.mp3' },
  { name: 'Shadows of Evil - Round changing music [Slowed, reverbed & extended] - Black Ops 3 Zombies', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Shadows.of.Evil.-.Round.changing.music.Slowed.reverbed.extended.-.Black.Ops.3.Zombies.mp3' },
  { name: 'She\'s on Fire!', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/She.s.on.Fire.mp3' },
  { name: 'Slime Sea Moonlit Calm', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Slime.Sea.Moonlit.Calm.mp3' },
  { name: 'Slime Sea Sunlit Waves', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Slime.Sea.Sunlit.Waves.mp3' },
  { name: 'The Slimeulation Corruption (Bonus Track)', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/The.Slimeulation.Corruption.Bonus.Track.mp3' },
  { name: 'The Slimeulation Dry Reef', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/The.Slimeulation.Dry.Reef.mp3' },
  { name: 'The Slimeulation Indigo Quarry', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/The.Slimeulation.Indigo.Quarry.mp3' },
  { name: 'The Slimeulation Moss Blanket', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/The.Slimeulation.Moss.Blanket.mp3' },
  { name: 'The Wilds Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/The.Wilds.Night.mp3' },
  { name: 'The Wilds Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/The.Wilds.Theme.mp3' },
  { name: 'Those Awful Ravenous Rainbows', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Those.Awful.Ravenous.Rainbows.mp3' },
  { name: 'Viktor\'s Workshop Night', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Viktor.s.Workshop.Night.mp3' },
  { name: 'Viktor\'s Workshop Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Viktor.s.Workshop.Theme.mp3' },
  { name: 'Wiggly Wonderland Theme', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/Wiggly.Wonderland.Theme.mp3' },
  { name: 'badthings-01', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-01.mp3' },
  { name: 'badthings-02', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-02.mp3' },
  { name: 'badthings-03', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-03.mp3' },
  { name: 'badthings-04', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-04.mp3' },
  { name: 'badthings-05', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-05.mp3' },
  { name: 'badthings-06', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-06.mp3' },
  { name: 'badthings-07', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-07.mp3' },
  { name: 'badthings-08', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-08.mp3' },
  { name: 'badthings-09', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-09.mp3' },
  { name: 'badthings-10', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-10.mp3' },
  { name: 'badthings-11', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-11.mp3' },
  { name: 'badthings-12', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-12.mp3' },
  { name: 'badthings-13', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-13.mp3' },
  { name: 'badthings-14', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-14.mp3' },
  { name: 'badthings-15', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-15.mp3' },
  { name: 'badthings-16', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-16.mp3' },
  { name: 'badthings-17', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-17.mp3' },
  { name: 'badthings-18', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-18.mp3' },
  { name: 'badthings-19', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-19.mp3' },
  { name: 'badthings-20', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-20.mp3' },
  { name: 'badthings-21', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-21.mp3' },
  { name: 'badthings-22', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/badthings-22.mp3' },
  { name: 'bgm', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/bgm.mp3' },
  { name: 'future_bgm', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/future_bgm.mp3' },
  { name: 'past_bgm', src: 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/past_bgm.mp3' }
];
let currentMusicPeriod = 'present';

function switchPeriodMusic(period) {
  if (period === currentMusicPeriod) return;
  currentMusicPeriod = period;
  const wasPlaying = musicPlaying;
  bgmAudio.pause();
  bgmAudio.src = period === 'present' ? currentTrack : (periodMusic[period] || 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/bgm.mp3');
  bgmAudio.load();
  if (wasPlaying) bgmAudio.play().catch(() => {});
}

// auto-start on first interaction
let musicStarted = false;
function tryStartMusic() {
  if (musicStarted) return;
  musicStarted = true;
  bgmAudio.play().catch(() => { musicPlaying = false; if (musicBtn) musicBtn.textContent = '♪ OFF'; });
}
document.addEventListener('click', tryStartMusic, { once: true });
document.addEventListener('keydown', tryStartMusic, { once: true });

function startMusic() {
  if (musicPlaying) return;
  musicPlaying = true;
  if (musicBtn) musicBtn.textContent = '♪ ON';
  bgmAudio.play().catch(() => {});
  updateSettingsBtns();
}

function stopMusic() {
  if (!musicPlaying) return;
  musicPlaying = false;
  if (musicBtn) musicBtn.textContent = '♪ OFF';
  bgmAudio.pause();
  updateSettingsBtns();
}

if (musicBtn) musicBtn.addEventListener('click', () => {
  if (musicPlaying) stopMusic();
  else startMusic();
  updateSettingsBtns();
});

function updateFlashBtn() {
  if (flashBtn) {
    flashBtn.textContent = 'FLASH: ' + (flashesEnabled ? 'ON' : 'OFF');
    flashBtn.classList.toggle('active', !flashesEnabled);
  }
  updateSettingsBtns();
}
flashBtn.addEventListener('click', () => {
  flashesEnabled = !flashesEnabled;
  updateFlashBtn();
  saveGame();
  showToast(flashesEnabled ? 'flashes on' : 'flashes off');
});
updateFlashBtn();

const upgrades = [
  { id: 'auto', name: 'Auto Roll', desc: 'rolls automatically every 0.8s', cost: 50, type: 'unlock' },
  { id: 'luckBracelet', name: 'Luck Bracelet', desc: '+0.5 permanent luck', cost: 500, type: 'stack', effect: { luck: 0.5 }, max: 50 },
  { id: 'luckyGloves', name: 'Lucky Gloves', desc: '+2 permanent luck', cost: 2500, type: 'stack', effect: { luck: 2 }, max: 25 },
  { id: 'fortuneTalisman', name: 'Fortune Talisman', desc: '+10 permanent luck', cost: 12500, type: 'stack', effect: { luck: 10 }, max: 15 },
  { id: 'creditsBracelet', name: 'Credits Bracelet', desc: '+50 credits per roll, scales with rarity', cost: 1500, type: 'stack', effect: { credits: 50 }, max: 10 },
  { id: 'autoSpeed', name: 'Auto Speed', desc: 'auto roll 10% faster (stacks multiplicatively)', cost: 4000, type: 'stack', effect: { autoSpeed: 0.10 }, max: 10 },
  { id: 'mutationCharm', name: 'Mutation Charm', desc: '+15% mutation chance', cost: 7500, type: 'stack', effect: { mutationChance: 0.015 }, max: 5 },
  { id: 'dustRemover', name: 'Dust Remover', desc: 'removes Dust from the roll pool', cost: 25000, type: 'unlock' },
  { id: 'dustReactor', name: 'Dust Reactor', desc: 'consume 5 dust for +20 permanent luck (stacks)', cost: 5000, type: 'stack', effect: { luck: 20 }, max: 20, dustCost: 5 },
  { id: 'luckAmplifier', name: 'Luck Amplifier', desc: 'exponentially more luck each level (cost and gain both grow)', type: 'exp', baseCost: 2500, costMult: 2.5, baseLuck: 1, luckMult: 10, max: 30 },
  { id: 'creditsAmplifier', name: 'Credits Amplifier', desc: 'exponentially more credits each level (cost and gain both grow)', type: 'exp', baseCost: 2500, costMult: 3, baseCredits: 1, creditsMult: 10, max: 20 },
  { id: 'timeMachine', name: 'Time Machine', desc: 'travel to past and future', cost: 50000, type: 'unlock' },
  { id: 'qmark', name: '?!?', desc: 'increases ??? change interval by 10 rolls and reveals ??? current odds', cost: 100000, type: 'unlock', requires: 'aboveEternity' },
];

const gameEvents = [
  { id: 'void_week', name: 'Void Week', desc: 'void zone rewards doubled', bonus: { credits: 2, luck: 1.5 }, active: true },
  { id: 'fusion_fest', name: 'Fusion Fest', desc: 'fusion costs 2 instead of 3', bonus: { fuseCost: 2 }, active: false },
  { id: 'streak_surge', name: 'Streak Surge', desc: 'streak threshold halved', bonus: { streakMult: 2 }, active: false },
  { id: 'dust_blessing', name: 'Dust Blessing', desc: 'dust sells for 10x', bonus: { dustSellMult: 10 }, active: false },
  { id: 'cosmic_storm', name: 'Cosmic Storm', desc: 'cosmic+ rarities 3x more likely', bonus: { cosmicMult: 3 }, active: false },
  { id: 'prestige_rush', name: 'Prestige Rush', desc: 'prestige gain doubled', bonus: { prestigeMult: 2 }, active: false },
];

function getCurrentEvent() {
  // rotate events by day-of-year
  const day = Math.floor(Date.now() / 86400000);
  const idx = day % gameEvents.length;
  return gameEvents[idx];
}

const quests = [
  // past (desert) card battles
  { id: 'past_win1', period: 'past', name: 'Desert Duel', desc: 'win 1 card battle vs the Past Keeper', target: 1, reward: { credits: 1000, luck: 5 } },
  { id: 'past_win3', period: 'past', name: 'Sandstorm Champion', desc: 'win 3 card battles', target: 3, reward: { credits: 3000, luck: 15 } },
  // future (city) card battles
  { id: 'future_win1', period: 'future', name: 'Neon Duel', desc: 'win 1 card battle vs the Future Oracle', target: 1, reward: { credits: 2000, luck: 10 } },
  { id: 'future_win3', period: 'future', name: 'City Conqueror', desc: 'win 3 card battles', target: 3, reward: { credits: 5000, luck: 25 } },
];

const pastDeck = [
  { name: 'Sandstorm', atk: 5, def: 2 },
  { name: 'Relic', atk: 3, def: 5 },
  { name: 'Oasis', atk: 2, def: 6 },
  { name: 'Mummy', atk: 6, def: 1 },
  { name: 'Pyramid', atk: 4, def: 4 },
  { name: 'Dune', atk: 3, def: 3 },
];
const futureDeck = [
  { name: 'Neon', atk: 5, def: 2 },
  { name: 'Circuit', atk: 3, def: 5 },
  { name: 'Hologram', atk: 2, def: 6 },
  { name: 'Virus', atk: 6, def: 1 },
  { name: 'Mainframe', atk: 4, def: 4 },
  { name: 'Glitch', atk: 3, def: 3 },
];
let cardBattle = { active: false, playerHand: [], npcHand: [], pScore: 0, nScore: 0, round: 0, chosen: null, npcChosen: null, result: null, gameOver: false };

const achievements = [
  { id: 'roll10', name: 'Just Getting Started', desc: 'roll 10 times', check: () => rolls >= 10, reward: { luck: 0.1 } },
  { id: 'roll100', name: 'Dedication', desc: 'roll 100 times', check: () => rolls >= 100, reward: { luck: 0.25 } },
  { id: 'roll1000', name: 'Addicted', desc: 'roll 1,000 times', check: () => rolls >= 1000, reward: { luck: 0.75 } },
  { id: 'roll10000', name: 'No Life', desc: 'roll 10,000 times', check: () => rolls >= 10000, reward: { luck: 2 } },
  { id: 'roll100000', name: 'Touch Grass', desc: 'roll 100,000 times', check: () => rolls >= 100000, reward: { luck: 5 } },
  { id: 'credits100', name: 'Pocket Change', desc: 'earn 100 credits', check: () => credits >= 100, reward: { luck: 0.1 } },
  { id: 'credits1000', name: 'Big Spender', desc: 'earn 1,000 credits', check: () => credits >= 1000, reward: { luck: 0.25 } },
  { id: 'credits10000', name: 'Economy Crusher', desc: 'earn 10,000 credits', check: () => credits >= 10000, reward: { luck: 0.75 } },
  { id: 'rare', name: 'First Spark', desc: 'roll a Rare cube', check: () => (inventory['Rare'] || 0) > 0, reward: { luck: 0.15 } },
  { id: 'celestial', name: 'Divine Light', desc: 'roll a Celestial cube', check: () => (inventory['Celestial'] || 0) > 0, reward: { luck: 0.25 } },
  { id: 'epic', name: 'Purple Haze', desc: 'roll an Epic cube', check: () => (inventory['Epic'] || 0) > 0, reward: { luck: 0.35 } },
  { id: 'frosted', name: 'Ice Cold', desc: 'roll a Frosted cube', check: () => (inventory['Frosted'] || 0) > 0, reward: { luck: 0.5 } },
  { id: 'legendary', name: 'Golden Child', desc: 'roll a Legendary cube', check: () => (inventory['Legendary'] || 0) > 0, reward: { luck: 1 } },
  { id: 'auric', name: 'Gold Rush', desc: 'roll an Auric cube', check: () => (inventory['Auric'] || 0) > 0, reward: { luck: 0.5 } },
  { id: 'mythic', name: 'Red Alert', desc: 'roll a Mythic cube', check: () => (inventory['Mythic'] || 0) > 0, reward: { luck: 1 } },
  { id: 'mystic', name: 'Wizard', desc: 'roll a Mystic cube', check: () => (inventory['Mystic'] || 0) > 0, reward: { luck: 3 } },
  { id: 'divine', name: 'Blessed', desc: 'roll a Divine cube', check: () => (inventory['Divine'] || 0) > 0, reward: { luck: 2 } },
  { id: 'nebula', name: 'Space Walk', desc: 'roll a Nebula cube', check: () => (inventory['Nebula'] || 0) > 0, reward: { luck: 5 } },
  { id: 'cosmic', name: 'Star Born', desc: 'roll a Cosmic cube', check: () => (inventory['Cosmic'] || 0) > 0, reward: { luck: 8 } },
  { id: 'ascended', name: 'Above All', desc: 'roll an Ascended cube', check: () => (inventory['Ascended'] || 0) > 0, reward: { luck: 5 } },
  { id: 'null', name: 'Error 404', desc: 'roll a Null cube', check: () => (inventory['Null'] || 0) > 0, reward: { luck: 15 } },
  { id: 'radiant', name: 'Glory', desc: 'roll a Radiant cube', check: () => (inventory['Radiant'] || 0) > 0, reward: { luck: 25 } },
  { id: 'ethereal', name: 'Ghost', desc: 'roll an Ethereal cube', check: () => (inventory['Ethereal'] || 0) > 0, reward: { luck: 40 } },
  { id: 'transcendent', name: 'Beyond', desc: 'roll a Transcendent cube', check: () => (inventory['Transcendent'] || 0) > 0, reward: { luck: 60 } },
  { id: 'quantum', name: 'Schrödinger', desc: 'roll a Quantum cube', check: () => (inventory['Quantum'] || 0) > 0, reward: { luck: 80 } },
  { id: 'abyss', name: 'Deep Dive', desc: 'roll an Abyss cube', check: () => (inventory['Abyss'] || 0) > 0, reward: { luck: 100 } },
  { id: 'eternal', name: 'Timeless', desc: 'roll an Eternal cube', check: () => (inventory['Eternal'] || 0) > 0, reward: { luck: 150 } },
  { id: 'sovereign', name: 'King', desc: 'roll a Sovereign cube', check: () => (inventory['Sovereign'] || 0) > 0, reward: { luck: 200 } },
  { id: 'infinity', name: 'Endless', desc: 'roll an Infinity cube', check: () => (inventory['Infinity'] || 0) > 0, reward: { luck: 300 } },
  { id: 'oblivion', name: 'Forgotten', desc: 'roll an Oblivion cube', check: () => (inventory['Oblivion'] || 0) > 0, reward: { luck: 500 } },
  { id: 'genesis', name: 'Creator', desc: 'roll a Genesis cube', check: () => (inventory['Genesis'] || 0) > 0, reward: { luck: 750 } },
  { id: 'apotheosis', name: 'Ascension', desc: 'roll an Apotheosis cube', check: () => (inventory['Apotheosis'] || 0) > 0, reward: { luck: 1500 } },
  { id: 'omnipotent', name: 'God Mode', desc: 'roll an Omnipotent cube', check: () => (inventory['Omnipotent'] || 0) > 0, reward: { luck: 2500 } },
  { id: 'absolute', name: 'Final Form', desc: 'roll an Absolute cube', check: () => (inventory['Absolute'] || 0) > 0, reward: { luck: 5000 } },
  { id: 'secret', name: '????', desc: 'roll a ??? cube', check: () => (inventory['???'] || 0) > 0, reward: { luck: 50000 } },
  { id: 'unlockAuto', name: 'Lazy Mode', desc: 'buy auto roll', check: () => unlocked.auto, reward: { luck: 0.1 } },
  { id: 'firstFusion', name: 'Alchemist', desc: 'fuse 3 auras into one', check: () => (window.fusionCount || 0) >= 1, reward: { luck: 10 } },
  { id: 'fusion10', name: 'Master Alchemist', desc: 'fuse 10 times', check: () => (window.fusionCount || 0) >= 10, reward: { luck: 50 } },
  { id: 'firstTranscend', name: 'Beyond Mortal', desc: 'transcend once', check: () => transcendenceCount >= 1, reward: { luck: 100 } },
  { id: 'transcend5', name: 'Ascended Being', desc: 'transcend 5 times', check: () => transcendenceCount >= 5, reward: { luck: 500 } },
  { id: 'firstEquip', name: 'Fashion Sense', desc: 'equip a rarity', check: () => equippedRarity !== null, reward: { luck: 5 } },
  { id: 'qmarkUnlock', name: 'Mystery Solved', desc: 'unlock the ?!? upgrade', check: () => !!unlocked.qmark, reward: { luck: 200 } },
  { id: 'eventParticipate', name: 'Event Goer', desc: 'play during an active event', check: () => true, reward: { luck: 1 } },
  { id: 'craftAlpha', name: 'Beyond Rolling', desc: 'craft an Alpha cube', check: () => (inventory['Alpha'] || 0) > 0, reward: { luck: 1000 } },
  { id: 'craftEnd', name: 'The End', desc: 'craft an End cube', check: () => (inventory['End'] || 0) > 0, reward: { luck: 10000 } },
  { id: 'craftRNG', name: 'RNGesus', desc: 'craft/unlock the RNG rarity', check: () => rngUnlocked, reward: { luck: 50000 } },
  { id: 'craftXeno', name: 'Xenogenesis', desc: 'craft a Xenogenesis cube', check: () => (inventory['Xenogenesis'] || 0) > 0, reward: { luck: 5000 } },
];

const changelog = [
  { version: 'v0.85', note: 'leaderboard worker fix: retry fetch/submit with backoff, offline fallback' },
  { version: 'v0.8', note: 'massive update: aura fusion (combine 3 of same aura into next tier, plus 2-tabula->core and craft-only chain core->nexus->alpha->genesis->creation->eternia->omnipotence); transcendence system (permanent +50% luck per transcendence, requires 3+ rebirths); events system (daily-rotating events with bonuses: void week, fusion fest, streak surge, dust blessing, cosmic storm, prestige rush); settings menu (decluttered topbar, flash/music/auto-fuse/auto-equip toggles, save slots, stats, import/export); mobile responsive layout; flash toggle; ??? dynamic rarity (odds change every 20 rolls between 1/160qd and 1/646qd, censored name, ?!? upgrade reveals odds and +10 roll interval); equip rarity system; corruption mode (cubeful harmony: black screen, smeared game graphics, fearful harmony audio, progressive distortion, seeded by clipboard content); checksum guard (anti-tamper: modified saves trigger corruption); dust economy rework (under-epic sells for 1.5, dust sells for 1, dust (R) after 1T luck sells for higher, dust reactor consumes dust for luck, refund system); rarity sets (rainbow/prism/top tier) with luck rewards; auto-fuse; roll history panel; keyboard shortcuts (space=roll, S=shop, A=auto, esc=close); tooltips on rarity rows; 3 new biomes (lucky, greedy, frenzy); 12 new daily challenges; sound effects (fusion chime, transcendence fanfare); save slots (3); rarity evolution (5 of same -> evolved (E) +10% luck); daily login bonus; prestige milestones (5/10/25 rebirths); rarity showcase modal; sell price rebalanced (power-scaled); more rarities above core (nexus, singularity, apex, zenith, omega, alpha, xenogenesis, creation, eternia, omnipotence); luck cap extended to 10Sx; luck upgrades extended (max 50/25/15/40); admin infinite credits; cosmic moved to 1/150qd; extra aura for top rarities; prestige credits boost + shop discount; ??? glaze' },
  { version: 'v0.7', note: 'removed quick roll, added shopkeeper dialogue, prestige/rebirth, daily challenges, more shop upgrades (x10, x100, auto speed, mutation charm), enhanced cube visuals, offline leaderboard, bug fixes; shop menu now scrolls, luck cap extended to 1T with Infinity via admin, removed common Null, gradients for top rarities, new rarities (Google, Perplexity, The Box, Jbo, Sigma, Tophat, Tabula), draggable cube background, obj nod inside the cube, obj now speaks, achievement luck economy rebalanced; biome change timer + biome-based ui colors; luck cap raised to 1Qn, rarity odds made monotonic so Tabula is rarest and reachable; freeze fixed, perf fixes (merged rAF, particle cap, hex cache); luck amplifier + credits amplifier exp upgrades; credits bracelet amplified with rarity scaling; pity system, streak counter with temp luck boosts, jackpot celebration on Tabula, auto-sell + manual sell, collection tracker with completion reward; time machine reworked into quest zones: past = desert with card battles, future = city with card battles, NPCs, themed backgrounds, no cube/rarities/inventory in those periods' },
  { version: 'v0.6', note: 'time travel (past/future/present), bg music, webgl 3d cube, 50 rarities per period, biomes, mutations, breakthroughs, bonus rolls, quick roll, aura filter, auto-equip, admin panel (konami code), cloudflare leaderboard, sound effects, credits bracelet' },
  { version: 'v0.5', note: 'removed speed stat, credits scale with rarity, x100 is 50k, 33 rarities, luck caps at 100M (bracelets bypass)' },
  { version: 'v0.4', note: 'added achievements that give permanent luck/speed boosts + update log' },
  { version: 'v0.3', note: 'added localStorage save/load, nerfed auto roll to half speed' },
  { version: 'v0.2', note: 'added shop: auto roll, x10, x100 locked behind credits' },
  { version: 'v0.1', note: 'initial release: rolling, rarities, inventory, particles' },
];

let achievementsUnlocked = {};

// populate aura filter dropdown
function populateAuraFilter() {
  const sel = document.getElementById('auraFilter');
  if (!sel) return;
  sel.innerHTML = '<option value="0">ALL</option>';
  const rar = getCurrentRarities();
  for (let i = 0; i < rar.length; i++) {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = rar[i].name;
    sel.appendChild(opt);
  }
  sel.value = auraFilterMin;
  sel.addEventListener('change', () => {
    auraFilterMin = parseInt(sel.value);
  });
}

function populateAutoSell() {
  const sel = document.getElementById('autoSellSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="-1">OFF</option>';
  const rar = getCurrentRarities();
  for (let i = 0; i < rar.length; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = 'below ' + rar[i].name;
    sel.appendChild(opt);
  }
  sel.value = autoSellThreshold;
  sel.addEventListener('change', () => {
    autoSellThreshold = parseInt(sel.value);
    saveGame();
  });
}

const rarities = [
  { name: 'Dust',        odds: 1.5,        cap: 2,          color: '#8a9199', glow: '#aab4bd', luck: 0.1,     particles: 12,  shake: 2,    flash: 0.02, chroma: 0 },
  { name: 'Scrap',       odds: 3,          cap: 5,          color: '#6b9e5e', glow: '#9eff8a', luck: 0.25,    particles: 16,  shake: 3,    flash: 0.03, chroma: 0 },
  { name: 'Common',      odds: 8,          cap: 10,         color: '#d8e6f2', glow: '#ffffff', luck: 0.5,     particles: 20,  shake: 4,    flash: 0.04, chroma: 0 },
  { name: 'Good',        odds: 16,         cap: 24,         color: '#5af0a0', glow: '#a0ffd0', luck: 1.0,     particles: 24,  shake: 4.5,  flash: 0.05, chroma: 0 },
  { name: 'Uncommon',    odds: 25,         cap: 50,         color: '#5ad06a', glow: '#8eff9e', luck: 1.5,     particles: 28,  shake: 5,    flash: 0.06, chroma: 0.05 },
  { name: 'Rare',        odds: 120,        cap: 300,        color: '#5ad0ff', glow: '#9eefff', luck: 8,       particles: 40,  shake: 7,    flash: 0.10, chroma: 0.1 },
  { name: 'Celestial',   odds: 300,        cap: 900,        color: '#f0e6a0', glow: '#fff8c0', luck: 18,      particles: 48,  shake: 8,    flash: 0.12, chroma: 0.12 },
  { name: 'Epic',        odds: 800,        cap: 2000,       color: '#b85aff', glow: '#e5a0ff', luck: 40,      particles: 60,  shake: 10,   flash: 0.16, chroma: 0.18 },
  { name: 'Frosted',     odds: 2500,       cap: 8000,       color: '#00f0d0', glow: '#80fff0', luck: 100,     particles: 72,  shake: 11,   flash: 0.19, chroma: 0.22 },
  { name: 'Legendary',   odds: 6000,       cap: 20000,      color: '#ffce5a', glow: '#ffeeaa', luck: 250,     particles: 90,  shake: 14,   flash: 0.25, chroma: 0.28 },
  { name: 'Auric',       odds: 25000,      cap: 100000,     color: '#d4af37', glow: '#ffe070', luck: 750,     particles: 110, shake: 16,   flash: 0.30, chroma: 0.32 },
  { name: 'Mythic',      odds: 60000,      cap: 200000,     color: '#ff4a4a', glow: '#ffaaaa', luck: 1800,    particles: 130, shake: 20,   flash: 0.38, chroma: 0.40 },
  { name: 'Mystic',      odds: 400000,     cap: 2500000,    color: '#a020f0', glow: '#d080ff', luck: 12000,   particles: 170, shake: 25,   flash: 0.50, chroma: 0.50 },
  { name: 'Divine',      odds: 800000,     cap: 3000000,    color: '#a0f0ff', glow: '#e0ffff', luck: 15000,   particles: 180, shake: 28,   flash: 0.55, chroma: 0.55 },
  { name: 'Nebula',      odds: 5000000,    cap: 25000000,   color: '#4050ff', glow: '#8090ff', luck: 80000,   particles: 220, shake: 34,   flash: 0.65, chroma: 0.62 },
  { name: 'Ascended',    odds: 150000000,  cap: 800000000,  color: '#ff8040', glow: '#ffbc80', luck: 2500000, particles: 320, shake: 50,   flash: 0.82, chroma: 0.78 },
  { name: 'Radiant',     odds: 3000000000, cap: 20000000000,color: '#fff0c0', glow: '#fffee0', luck: 50000000,particles: 430, shake: 80,   flash: 0.95, chroma: 0.95 },
  { name: 'Ethereal',    odds: 10000000000,cap: 65000000000,color: '#c0c0ff', glow: '#e0e0ff', luck: 150000000,particles: 460, shake: 90,   flash: 0.96, chroma: 0.96 },
  { name: 'Transcendent',odds: 35000000000,cap: 210000000000,color:'#ff60ff', glow: '#ffb0ff', luck: 450000000,particles: 490, shake: 100,  flash: 0.97, chroma: 0.97 },
  { name: 'Quantum',     odds: 130000000000,cap: 715000000000,color:'#00ffff', glow: '#a0ffff', luck: 1400000000,particles: 520, shake: 110,  flash: 0.975,chroma: 0.975},
  { name: 'Abyss',       odds: 2e11,cap: 9.4e11,color:'#1a0a30', glow: '#7030ff', luck: 5000000000,particles: 550, shake: 120,  flash: 0.98, chroma: 0.98 },
  { name: 'Eternal',     odds: 1.03e12,cap: 4.85e12,color:'#ffd700', glow: '#ffff80', luck: 20000000000,particles: 580, shake: 130,  flash: 0.985,chroma: 0.985},
  { name: 'Sovereign',   odds: 5.32e12,cap: 2.5e13,color:'#ff0040', glow: '#ff80a0', luck: 90000000000,particles: 610, shake: 140,  flash: 0.99, chroma: 0.99 },
  { name: 'Infinity',    odds: 2.74e13,cap: 1.29e14,color:'#8000ff', glow: '#c080ff', luck: 450000000000,particles: 640, shake: 150,  flash: 0.992,chroma: 0.992},
  { name: 'Oblivion',    odds: 1.41e14,cap: 6.65e14,color:'#050505', glow: '#ff0000', luck: 2500000000000,particles: 670, shake: 160,  flash: 0.994,chroma: 0.994},
  { name: 'Genesis',     odds: 7.29e14,cap: 3.43e15,color:'#ffffff', glow: '#c0ffe0', luck: 15000000000000,particles: 700, shake: 170,  flash: 0.996,chroma: 0.996},
  { name: 'Apotheosis',  odds: 3.76e15,cap: 1.77e16,color:'#ff80c0', glow: '#ffc0e0', luck: 90000000000000,particles: 730, shake: 180,  flash: 0.998,chroma: 0.998},
  { name: 'Omnipotent',  odds: 1.94e16,cap: 9.11e16,color:'#00ff80', glow: '#80ffc0', luck: 600000000000000,particles: 760, shake: 190,  flash: 0.999,chroma: 0.999},
  { name: 'Absolute',    odds: 1e17,cap: 4.7e17,color:'#ff0000', glow: '#ffff00', luck: 5000000000000000,particles: 790, shake: 200,  flash: 1.00, chroma: 1.00 },
  { name: 'Beyond',      odds: 1.6e17,        cap: 7.52e17,     color: '#0a1a2a', glow: '#1a3a5a', luck: 5.24e14,  particles: 620, shake: 122,  flash: 1.00, chroma: 0.96 },
  { name: 'Abyss',       odds: 1.75e17,        cap: 8.21e17,     color: '#081525', glow: '#152a4a', luck: 1.05e15,  particles: 640, shake: 126,  flash: 1.00, chroma: 0.97 },
  { name: 'Eternity',    odds: 1.91e17,        cap: 8.95e17,     color: '#061020', glow: '#102040', luck: 2.1e15,   particles: 660, shake: 130,  flash: 1.00, chroma: 0.97 },
  { name: 'Infinity',    odds: 2.08e17,        cap: 9.77e17,     color: '#040a1a', glow: '#081530', luck: 4.2e15,   particles: 680, shake: 134,  flash: 1.00, chroma: 0.98 },
  { name: 'Void',        odds: 2.27e17,        cap: 1.07e18,     color: '#020510', glow: '#040a20', luck: 8.4e15,   particles: 700, shake: 138,  flash: 1.00, chroma: 0.98 },
  { name: 'Nothing',     odds: 2.48e17,        cap: 1.16e18,     color: '#010208', glow: '#020510', luck: 1.68e16,  particles: 720, shake: 142,  flash: 1.00, chroma: 0.99 },
  { name: 'Null',        odds: 2.7e17,        cap: 1.27e18,     color: '#000000', glow: '#010208', luck: 3.36e16,  particles: 740, shake: 146,  flash: 1.00, chroma: 0.99 },
  { name: 'Zero',        odds: 2.95e17,        cap: 1.39e18,     color: '#000000', glow: '#000000', luck: 6.72e16,  particles: 760, shake: 150,  flash: 1.00, chroma: 1.00 },
  { name: 'One',         odds: 3.22e17,        cap: 1.51e18,     color: '#000000', glow: '#000000', luck: 1.34e17,  particles: 780, shake: 154,  flash: 1.00, chroma: 1.00 },
  { name: 'All',         odds: 3.51e17,        cap: 1.65e18,     color: '#000000', glow: '#000000', luck: 2.68e17,  particles: 800, shake: 158,  flash: 1.00, chroma: 1.00 },
  { name: 'Everything',  odds: 3.83e17,        cap: 1.8e18,     color: '#000000', glow: '#000000', luck: 5.37e17,  particles: 820, shake: 162,  flash: 1.00, chroma: 1.00 },
  { name: 'Universe',    odds: 4.18e17,        cap: 1.96e18,     color: '#000000', glow: '#000000', luck: 1.07e18,  particles: 840, shake: 166,  flash: 1.00, chroma: 1.00 },
  { name: 'Multiverse',  odds: 4.56e17,        cap: 2.14e18,     color: '#000000', glow: '#000000', luck: 2.15e18,  particles: 860, shake: 170,  flash: 1.00, chroma: 1.00 },
  { name: 'Cosmos',      odds: 4.98e17,        cap: 2.34e18,     color: '#000000', glow: '#000000', luck: 4.29e18,  particles: 880, shake: 174,  flash: 1.00, chroma: 1.00 },
  { name: 'Omniverse',   odds: 5.43e17,        cap: 2.55e18,     color: '#000000', glow: '#000000', luck: 8.59e18,  particles: 900, shake: 178,  flash: 1.00, chroma: 1.00 },
  { name: 'Google',      odds: 5.92e17,       cap: 2.78e18,    color: '#000000', glow: '#000000', luck: 1.72e19,  particles: 920, shake: 182,  flash: 1.00, chroma: 1.00 },
  { name: 'Perplexity',  odds: 6.46e17,       cap: 3.04e18,    color: '#5af0ff', color2: '#a060ff', glow: '#bffaff', glow2: '#d0b0ff', luck: 3.44e19,  particles: 940,  shake: 186,  flash: 1.00, chroma: 1.00 },
  { name: '???',         odds: 1.6e17, cap: 6.46e17, color: 'prism', glow: '#ffffff', luck: 50000000000000000, particles: 850, shake: 220, flash: 1.00, chroma: 1.00 },
  { name: 'Cosmic',      odds: 1.5e17,       cap: 7.05e17,    color: 'rainbow',  glow: '#ffffff', color2: '#ff00ff', glow2: '#ff80ff', luck: 250000,  particles: 260, shake: 40,   flash: 0.75, chroma: 0.72 },
  { name: 'The Box',     odds: 7.05e17,       cap: 3.32e18,    color: '#ffd24a', color2: '#ff8a2a', glow: '#fff0a0', glow2: '#ffc080', luck: 6.88e19,  particles: 960,  shake: 190,  flash: 1.00, chroma: 1.00 },
  { name: 'Jbo',         odds: 7.7e17,       cap: 3.62e18,    color: '#ff8a2a', color2: '#ffd24a', glow: '#ffc080', glow2: '#fff0a0', luck: 1.38e20,  particles: 980,  shake: 194,  flash: 1.00, chroma: 1.00 },
  { name: 'Sigma',       odds: 8.4e17,       cap: 3.95e18,    color: '#7dff7a', color2: '#2bd0d0', glow: '#bfffc0', glow2: '#a0ffff', luck: 2.75e20,  particles: 1000, shake: 198,  flash: 1.00, chroma: 1.00 },
  { name: 'Tophat',      odds: 9.16e17,       cap: 4.31e18,    color: '#b060ff', color2: '#ff5ad0', glow: '#d0a0ff', glow2: '#ffb0ea', luck: 5.5e20,   particles: 1020, shake: 202,  flash: 1.00, chroma: 1.00 },
  { name: 'Tabula',      odds: 1e18,       cap: 4.7e18,    color: '#2bd0d0', color2: '#8a5cff', glow: '#a0ffff', glow2: '#c0a0ff', luck: 1.1e21,   particles: 1040, shake: 206,  flash: 1.00, chroma: 1.00 },
  { name: 'Core',        odds: 1e19,       cap: 4.7e19,    color: '#ffffff', color2: '#ff00ff', glow: '#ffffff', glow2: '#ff80ff', luck: 1.1e22,   particles: 1200, shake: 250,  flash: 1.00, chroma: 1.00 },
  { name: 'Nexus',       odds: 5e19,       cap: 2.35e20,   color: '#ff00ff', color2: '#00ffff', glow: '#ff80ff', glow2: '#80ffff', luck: 2.2e22,   particles: 1250, shake: 255,  flash: 1.00, chroma: 1.00 },
  { name: 'Singularity', odds: 1e20,       cap: 4.7e20,    color: '#00ffff', color2: '#ff00ff', glow: '#80ffff', glow2: '#ff80ff', luck: 4.4e22,   particles: 1300, shake: 260,  flash: 1.00, chroma: 1.00 },
  { name: 'Apex',        odds: 5e20,       cap: 2.35e21,   color: '#ffff00', color2: '#ff00ff', glow: '#ffff80', glow2: '#ff80ff', luck: 8.8e22,   particles: 1350, shake: 265,  flash: 1.00, chroma: 1.00 },
  { name: 'Zenith',      odds: 1e21,       cap: 4.7e21,    color: '#00ff00', color2: '#00ffff', glow: '#80ff80', glow2: '#80ffff', luck: 1.76e23,  particles: 1400, shake: 270,  flash: 1.00, chroma: 1.00 },
  { name: 'Omega',       odds: 5e21,       cap: 2.35e22,   color: '#ff8000', color2: '#ffff00', glow: '#ffc080', glow2: '#ffff80', luck: 3.52e23,  particles: 1450, shake: 275,  flash: 1.00, chroma: 1.00 },
  { name: 'Alpha',       odds: 1e22,       cap: 4.7e22,    color: '#ffffff', color2: '#000000', glow: '#ffffff', glow2: '#808080', luck: 7.04e23,  particles: 1500, shake: 280,  flash: 1.00, chroma: 1.00, craftOnly: true },
  { name: 'Xenogenesis', odds: 2e22,       cap: 9.4e22,    color: '#000000', color2: '#ffffff', glow: '#808080', glow2: '#ffffff', luck: 1.4e24,   particles: 1550, shake: 285,  flash: 1.00, chroma: 1.00, craftOnly: true },
  { name: 'Creation',    odds: 5e22,       cap: 2.35e23,   color: '#ff00ff', color2: '#00ff00', glow: '#ff80ff', glow2: '#80ff80', luck: 2.8e24,   particles: 1600, shake: 290,  flash: 1.00, chroma: 1.00, craftOnly: true },
  { name: 'Eternia',     odds: 1e23,       cap: 4.7e23,    color: '#00ffff', color2: '#ffff00', glow: '#80ffff', glow2: '#ffff80', luck: 5.6e24,   particles: 1650, shake: 295,  flash: 1.00, chroma: 1.00, craftOnly: true },
  { name: 'Omnipotence', odds: 1e24,      cap: 4.7e24,    color: '#ffd700', color2: '#ff0040', glow: '#ffe080', glow2: '#ff80a0', luck: 1.12e25,  particles: 1700, shake: 300,  flash: 1.00, chroma: 1.00, craftOnly: true },
  { name: 'End',         odds: 1e25,      cap: 4.7e25,    color: '#000000', color2: '#1a1a1a', glow: '#ffffff', glow2: '#808080', luck: 1e26,     particles: 2000, shake: 400,  flash: 1.00, chroma: 1.00, craftOnly: true, distort: true },
  { name: 'RNG',         odds: 3.33e26,   cap: 4.7e26,    color: 'prism',    glow: '#ffffff', luck: 1e27,     particles: 5000, shake: 500,  flash: 1.00, chroma: 1.00 },
];

// past rarities (amber/brown theme) — scaled to match present rarity odds (rarest = 1 in 150 quadrillion)
let pastRarities = [
  { name: 'Pebble',      odds: 1.5,        cap: 2,          color: '#a08060', glow: '#c0a080', luck: 0.05,    particles: 10,  shake: 1,    flash: 0.01, chroma: 0 },
  { name: 'Fossil',      odds: 8,          cap: 16,         color: '#8a7050', glow: '#aa9070', luck: 0.15,    particles: 14,  shake: 2,    flash: 0.02, chroma: 0 },
  { name: 'Ancient',     odds: 40,         cap: 100,        color: '#7a6040', glow: '#9a8060', luck: 0.5,     particles: 18,  shake: 3,    flash: 0.03, chroma: 0 },
  { name: 'Relic',       odds: 200,        cap: 600,        color: '#6a5030', glow: '#8a7050', luck: 2,       particles: 24,  shake: 4,    flash: 0.05, chroma: 0 },
  { name: 'Artifact',    odds: 1000,       cap: 3500,       color: '#5a4020', glow: '#7a6040', luck: 8,       particles: 32,  shake: 5,    flash: 0.08, chroma: 0 },
  { name: 'Antique',     odds: 5000,       cap: 19000,      color: '#4a3010', glow: '#6a5030', luck: 30,      particles: 42,  shake: 7,    flash: 0.12, chroma: 0 },
  { name: 'Vintage',     odds: 25000,      cap: 100000,     color: '#3a2008', glow: '#5a4028', luck: 120,     particles: 55,  shake: 9,    flash: 0.18, chroma: 0 },
  { name: 'Prehistoric', odds: 125000,     cap: 530000,     color: '#2a1804', glow: '#4a3824', luck: 500,     particles: 70,  shake: 12,   flash: 0.25, chroma: 0 },
  { name: 'Primordial',  odds: 625000,     cap: 2700000,    color: '#1a1002', glow: '#3a2814', luck: 2500,    particles: 90,  shake: 16,   flash: 0.35, chroma: 0 },
  { name: 'Eternal Past',odds: 1500000,   cap: 7200000,    color: '#0a0801', glow: '#2a1808', luck: 15000,   particles: 120, shake: 22,   flash: 0.50, chroma: 0 },
  { name: 'Forgotten',   odds: 7500000,   cap: 36000000,   color: '#050400', glow: '#1a1004', luck: 30000,   particles: 140, shake: 26,   flash: 0.55, chroma: 0 },
  { name: 'Dust of Time',odds: 37500000,  cap: 180000000,  color: '#030200', glow: '#150c02', luck: 60000,   particles: 160, shake: 30,   flash: 0.60, chroma: 0 },
  { name: 'Echo',        odds: 187500000,  cap: 900000000,  color: '#8a5030', glow: '#aa7050', luck: 120000,  particles: 180, shake: 34,   flash: 0.65, chroma: 0 },
  { name: 'Lost Age',    odds: 937500000,  cap: 4500000000, color: '#7a4020', glow: '#9a6040', luck: 250000,  particles: 200, shake: 38,   flash: 0.70, chroma: 0 },
  { name: 'Void Past',   odds: 1000000000, cap: 4700000000, color: '#6a3010', glow: '#8a5030', luck: 500000,  particles: 220, shake: 42,   flash: 0.75, chroma: 0 },
  { name: 'Bone',        odds: 1200000000, cap: 5600000000, color: '#5a2008', glow: '#7a4028', luck: 1000000, particles: 240, shake: 46,   flash: 0.78, chroma: 0 },
  { name: 'Ash',         odds: 1500000000, cap: 7000000000, color: '#4a1804', glow: '#6a3824', luck: 2000000, particles: 260, shake: 50,   flash: 0.80, chroma: 0 },
  { name: 'Stone',       odds: 2000000000, cap: 9400000000, color: '#3a1002', glow: '#5a3020', luck: 4000000, particles: 280, shake: 54,   flash: 0.82, chroma: 0 },
  { name: 'Dust',        odds: 2500000000, cap: 11700000000,color: '#2a0801', glow: '#4a2818', luck: 8000000, particles: 300, shake: 58,   flash: 0.84, chroma: 0 },
  { name: 'Memory',      odds: 3000000000, cap: 14000000000,color: '#1a0400', glow: '#3a2010', luck: 16000000,particles: 320, shake: 62,   flash: 0.86, chroma: 0 },
  { name: 'Remnant',     odds: 3500000000, cap: 16500000000,color: '#150300', glow: '#301808', luck: 32000000,particles: 340, shake: 66,   flash: 0.88, chroma: 0 },
  { name: 'Last Light',  odds: 4000000000, cap: 18800000000,color: '#100200', glow: '#281004', luck: 64000000,particles: 360, shake: 70,   flash: 0.90, chroma: 0 },
  { name: 'Ancient One', odds: 4500000000, cap: 21000000000,color: '#0a0100', glow: '#200802', luck: 128000000,particles: 380, shake: 74,   flash: 0.92, chroma: 0 },
  { name: 'Timeless',    odds: 5000000000, cap: 23500000000,color: '#050000', glow: '#180401', luck: 256000000,particles: 400, shake: 78,   flash: 0.94, chroma: 0 },
  { name: 'Oblivion',    odds: 5000000000, cap: 23500000000,color: '#0a0a0a', glow: '#ffffff', luck: 512000000,particles: 420, shake: 82,   flash: 0.96, chroma: 0 },
  { name: 'Collapse',    odds: 5500000000, cap: 26000000000,color: '#080808', glow: '#f0f0f0', luck: 1024000000,particles: 440, shake: 86,   flash: 0.97, chroma: 0 },
  { name: 'Singularity', odds: 6000000000, cap: 28200000000,color: '#060606', glow: '#e0e0e0', luck: 2048000000,particles: 460, shake: 90,   flash: 0.975,chroma: 0 },
  { name: 'Void',        odds: 6500000000, cap: 30500000000,color: '#040404', glow: '#d0d0d0', luck: 4096000000,particles: 480, shake: 94,   flash: 0.98, chroma: 0 },
  { name: 'Null',        odds: 7000000000, cap: 33000000000,color: '#020202', glow: '#c0c0c0', luck: 8192000000,particles: 500, shake: 98,   flash: 0.985,chroma: 0 },
  { name: 'Nothing',     odds: 7500000000, cap: 35000000000,color: '#010101', glow: '#b0b0b0', luck: 16384000000,particles: 520, shake: 102,  flash: 0.99, chroma: 0 },
  { name: 'End',         odds: 8000000000, cap: 37600000000,color: '#000000', glow: '#a0a0a0', luck: 32768000000,particles: 540, shake: 106,  flash: 0.995,chroma: 0 },
  { name: 'Omega',       odds: 8500000000, cap: 40000000000,color: '#000000', glow: '#909090', luck: 65536000000,particles: 560, shake: 110,  flash: 1.00, chroma: 0 },
  { name: 'Final',       odds: 9000000000, cap: 42300000000,color: '#000000', glow: '#808080', luck: 131072000000,particles: 580, shake: 114,  flash: 1.00, chroma: 0 },
  { name: '???',         odds: 10000000000,cap: 47000000000,color: '#000000', glow: '#707070', luck: 262144000000,particles: 600, shake: 118,  flash: 1.00, chroma: 0 },
  { name: 'Forgotten Era', odds: 1e15,      cap: 4.7e15,     color: '#1a1208', glow: '#3a2810', luck: 5.24e14,  particles: 620, shake: 122,  flash: 1.00, chroma: 0 },
  { name: 'Deep Time',   odds: 1e20,        cap: 4.7e20,     color: '#150e06', glow: '#30200c', luck: 1.05e15,  particles: 640, shake: 126,  flash: 1.00, chroma: 0 },
  { name: 'Ancient Eternity', odds: 1e25,   cap: 4.7e25,     color: '#100a04', glow: '#281808', luck: 2.1e15,   particles: 660, shake: 130,  flash: 1.00, chroma: 0 },
  { name: 'Infinite Past', odds: 1e30,     cap: 4.7e30,     color: '#0c0803', glow: '#201406', luck: 4.2e15,   particles: 680, shake: 134,  flash: 1.00, chroma: 0 },
  { name: 'Lost Void',   odds: 1e35,        cap: 4.7e35,     color: '#080602', glow: '#181004', luck: 8.4e15,   particles: 700, shake: 138,  flash: 1.00, chroma: 0 },
  { name: 'Lost Nothing',odds: 1e40,       cap: 4.7e40,     color: '#060401', glow: '#120c03', luck: 1.68e16,  particles: 720, shake: 142,  flash: 1.00, chroma: 0 },
  { name: 'Past Null',   odds: 1e45,        cap: 4.7e45,     color: '#040301', glow: '#0e0802', luck: 3.36e16,  particles: 740, shake: 146,  flash: 1.00, chroma: 0 },
  { name: 'Zero Point',  odds: 1e50,        cap: 4.7e50,     color: '#030201', glow: '#0a0601', luck: 6.72e16,  particles: 760, shake: 150,  flash: 1.00, chroma: 0 },
  { name: 'First Light', odds: 1e55,        cap: 4.7e55,     color: '#020100', glow: '#080401', luck: 1.34e17,  particles: 780, shake: 154,  flash: 1.00, chroma: 0 },
  { name: 'All That Was',odds: 1e60,       cap: 4.7e60,     color: '#010100', glow: '#060300', luck: 2.68e17,  particles: 800, shake: 158,  flash: 1.00, chroma: 0 },
  { name: 'Everything Past', odds: 1e65,   cap: 4.7e65,     color: '#000000', glow: '#040200', luck: 5.37e17,  particles: 820, shake: 162,  flash: 1.00, chroma: 0 },
  { name: 'Ancient Universe', odds: 1e70,   cap: 4.7e70,     color: '#000000', glow: '#040200', luck: 1.07e18,  particles: 840, shake: 166,  flash: 1.00, chroma: 0 },
  { name: 'Past Multiverse', odds: 1e75,    cap: 4.7e75,     color: '#000000', glow: '#040200', luck: 2.15e18,  particles: 860, shake: 170,  flash: 1.00, chroma: 0 },
  { name: 'Ancient Cosmos', odds: 1e80,     cap: 4.7e80,     color: '#000000', glow: '#040200', luck: 4.29e18,  particles: 880, shake: 174,  flash: 1.00, chroma: 0 },
  { name: 'Past Omniverse', odds: 1e85,     cap: 4.7e85,     color: '#000000', glow: '#040200', luck: 8.59e18,  particles: 900, shake: 178,  flash: 1.00, chroma: 0 },
  { name: 'Origin',      odds: 1e100,       cap: 4.7e100,    color: '#000000', glow: '#040200', luck: 1.72e19,  particles: 920, shake: 182,  flash: 1.00, chroma: 0 },
];

// future rarities (purple/neon theme) — scaled to match present rarity odds (rarest = 1 in 1 billion)
let futureRarities = [
  { name: 'Neon',        odds: 1.5,        cap: 2,          color: '#ff00ff', glow: '#ff80ff', luck: 0.05,    particles: 10,  shake: 1,    flash: 0.01, chroma: 0.1 },
  { name: 'Cyber',       odds: 8,          cap: 16,         color: '#00ffff', glow: '#80ffff', luck: 0.15,    particles: 14,  shake: 2,    flash: 0.02, chroma: 0.15 },
  { name: 'Hologram',    odds: 40,         cap: 100,        color: '#8080ff', glow: '#c0c0ff', luck: 0.5,     particles: 18,  shake: 3,    flash: 0.03, chroma: 0.2 },
  { name: 'Synthetic',   odds: 200,        cap: 600,        color: '#ff8000', glow: '#ffc080', luck: 2,       particles: 24,  shake: 4,    flash: 0.05, chroma: 0.25 },
  { name: 'Quantum',     odds: 1000,       cap: 3500,       color: '#00ff80', glow: '#80ffc0', luck: 8,       particles: 32,  shake: 5,    flash: 0.08, chroma: 0.3 },
  { name: 'Singularity', odds: 5000,       cap: 19000,      color: '#ff0080', glow: '#ff80c0', luck: 30,      particles: 42,  shake: 7,    flash: 0.12, chroma: 0.4 },
  { name: 'Nexus',       odds: 25000,      cap: 100000,     color: '#8000ff', glow: '#c080ff', luck: 120,     particles: 55,  shake: 9,    flash: 0.18, chroma: 0.5 },
  { name: 'Chronos',     odds: 125000,     cap: 530000,     color: '#0080ff', glow: '#80c0ff', luck: 500,     particles: 70,  shake: 12,   flash: 0.25, chroma: 0.6 },
  { name: 'Temporal',    odds: 625000,     cap: 2700000,    color: '#ff0040', glow: '#ff80a0', luck: 2500,    particles: 90,  shake: 16,   flash: 0.35, chroma: 0.7 },
  { name: 'Infinity',    odds: 1500000,   cap: 7200000,    color: '#ffffff', glow: '#c0ffe0', luck: 15000,   particles: 120, shake: 22,   flash: 0.50, chroma: 0.8 },
  { name: 'Singularity', odds: 7500000,   cap: 36000000,   color: '#4000ff', glow: '#8080ff', luck: 30000,   particles: 140, shake: 26,   flash: 0.55, chroma: 0.85 },
  { name: 'Nexus Point', odds: 37500000,  cap: 180000000,  color: '#0040ff', glow: '#8080ff', luck: 60000,   particles: 160, shake: 30,   flash: 0.60, chroma: 0.9 },
  { name: 'Beyond Time', odds: 187500000, cap: 900000000,  color: '#0000ff', glow: '#4040ff', luck: 120000,  particles: 180, shake: 34,   flash: 0.65, chroma: 0.95 },
  { name: 'Void Future', odds: 937500000, cap: 4500000000, color: '#000040', glow: '#404080', luck: 250000,  particles: 200, shake: 38,   flash: 0.70, chroma: 0.98 },
  { name: 'End of Time', odds: 1000000000,cap: 4700000000, color: '#000080', glow: '#0000ff', luck: 500000,  particles: 220, shake: 42,   flash: 0.75, chroma: 1.0 },
  { name: 'Circuit',     odds: 1200000000,cap: 5600000000, color: '#00ff00', glow: '#80ff80', luck: 1000000, particles: 240, shake: 46,   flash: 0.78, chroma: 1.0 },
  { name: 'Pixel',       odds: 1500000000,cap: 7000000000, color: '#00ff80', glow: '#80ffc0', luck: 2000000, particles: 260, shake: 50,   flash: 0.80, chroma: 1.0 },
  { name: 'Hologram',    odds: 2000000000,cap: 9400000000, color: '#00ffc0', glow: '#80ffe0', luck: 4000000, particles: 280, shake: 54,   flash: 0.82, chroma: 1.0 },
  { name: 'Neon',        odds: 2500000000,cap: 11700000000,color: '#00c0ff', glow: '#80e0ff', luck: 8000000, particles: 300, shake: 58,   flash: 0.84, chroma: 1.0 },
  { name: 'Cyber',       odds: 3000000000,cap: 14000000000,color: '#0080ff', glow: '#80c0ff', luck: 16000000,particles: 320, shake: 62,   flash: 0.86, chroma: 1.0 },
  { name: 'Synth',       odds: 3500000000,cap: 16500000000,color: '#4000ff', glow: '#8080ff', luck: 32000000,particles: 340, shake: 66,   flash: 0.88, chroma: 1.0 },
  { name: 'Digital',     odds: 4000000000,cap: 18800000000,color: '#8000ff', glow: '#c080ff', luck: 64000000,particles: 360, shake: 70,   flash: 0.90, chroma: 1.0 },
  { name: 'Virtual',     odds: 4500000000,cap: 21000000000,color: '#c000ff', glow: '#e080ff', luck: 128000000,particles: 380, shake: 74,   flash: 0.92, chroma: 1.0 },
  { name: 'Omniverse',   odds: 5000000000,cap: 23500000000,color: '#ff00ff', glow: '#ff80ff', luck: 256000000,particles: 400, shake: 78,   flash: 0.94, chroma: 1.0 },
  { name: 'Oblivion',    odds: 5000000000,cap: 23500000000,color: '#0a0a0a', glow: '#ffffff', luck: 512000000,particles: 420, shake: 82,   flash: 0.96, chroma: 1.0 },
  { name: 'Collapse',    odds: 5500000000,cap: 26000000000,color: '#080808', glow: '#f0f0f0', luck: 1024000000,particles: 440, shake: 86,   flash: 0.97, chroma: 1.0 },
  { name: 'Singularity', odds: 6000000000,cap: 28200000000,color: '#060606', glow: '#e0e0e0', luck: 2048000000,particles: 460, shake: 90,   flash: 0.975,chroma: 1.0 },
  { name: 'Void',        odds: 6500000000,cap: 30500000000,color: '#040404', glow: '#d0d0d0', luck: 4096000000,particles: 480, shake: 94,   flash: 0.98, chroma: 1.0 },
  { name: 'Null',        odds: 7000000000,cap: 33000000000,color: '#020202', glow: '#c0c0c0', luck: 8192000000,particles: 500, shake: 98,   flash: 0.985,chroma: 1.0 },
  { name: 'Nothing',     odds: 7500000000,cap: 35000000000,color: '#010101', glow: '#b0b0b0', luck: 16384000000,particles: 520, shake: 102,  flash: 0.99, chroma: 1.0 },
  { name: 'End',         odds: 8000000000,cap: 37600000000,color: '#000000', glow: '#a0a0a0', luck: 32768000000,particles: 540, shake: 106,  flash: 0.995,chroma: 1.0 },
  { name: 'Omega',       odds: 8500000000,cap: 40000000000,color: '#000000', glow: '#909090', luck: 65536000000,particles: 560, shake: 110,  flash: 1.00, chroma: 1.0 },
  { name: 'Final',       odds: 9000000000,cap: 42300000000,color: '#000000', glow: '#808080', luck: 131072000000,particles: 580, shake: 114,  flash: 1.00, chroma: 1.0 },
  { name: '???',         odds: 10000000000,cap: 47000000000,color: '#000000', glow: '#707070', luck: 262144000000,particles: 600, shake: 118,  flash: 1.00, chroma: 1.0 },
  { name: 'Beyond',      odds: 1e15,        cap: 4.7e15,     color: '#0a0a0a', glow: '#606060', luck: 5.24e14,  particles: 620, shake: 122,  flash: 1.00, chroma: 1.0 },
  { name: 'Abyss',       odds: 1e20,        cap: 4.7e20,     color: '#080808', glow: '#505050', luck: 1.05e15,  particles: 640, shake: 126,  flash: 1.00, chroma: 1.0 },
  { name: 'Eternity',    odds: 1e25,        cap: 4.7e25,     color: '#060606', glow: '#404040', luck: 2.1e15,   particles: 660, shake: 130,  flash: 1.00, chroma: 1.0 },
  { name: 'Infinity',    odds: 1e30,        cap: 4.7e30,     color: '#040404', glow: '#303030', luck: 4.2e15,   particles: 680, shake: 134,  flash: 1.00, chroma: 1.0 },
  { name: 'Void',        odds: 1e35,        cap: 4.7e35,     color: '#020202', glow: '#202020', luck: 8.4e15,   particles: 700, shake: 138,  flash: 1.00, chroma: 1.0 },
  { name: 'Nothing',     odds: 1e40,        cap: 4.7e40,     color: '#010101', glow: '#101010', luck: 1.68e16,  particles: 720, shake: 142,  flash: 1.00, chroma: 1.0 },
  { name: 'Null',        odds: 1e45,        cap: 4.7e45,     color: '#000000', glow: '#0a0a0a', luck: 3.36e16,  particles: 740, shake: 146,  flash: 1.00, chroma: 1.0 },
  { name: 'Zero',        odds: 1e50,        cap: 4.7e50,     color: '#000000', glow: '#050505', luck: 6.72e16,  particles: 760, shake: 150,  flash: 1.00, chroma: 1.0 },
  { name: 'One',         odds: 1e55,        cap: 4.7e55,     color: '#000000', glow: '#020202', luck: 1.34e17,  particles: 780, shake: 154,  flash: 1.00, chroma: 1.0 },
  { name: 'All',         odds: 1e60,        cap: 4.7e60,     color: '#000000', glow: '#010101', luck: 2.68e17,  particles: 800, shake: 158,  flash: 1.00, chroma: 1.0 },
  { name: 'Everything',  odds: 1e65,        cap: 4.7e65,     color: '#000000', glow: '#010004', luck: 5.37e17,  particles: 820, shake: 162,  flash: 1.00, chroma: 1.0 },
  { name: 'Universe',    odds: 1e70,        cap: 4.7e70,     color: '#000000', glow: '#010004', luck: 1.07e18,  particles: 840, shake: 166,  flash: 1.00, chroma: 1.0 },
  { name: 'Multiverse',  odds: 1e75,        cap: 4.7e75,     color: '#000000', glow: '#010004', luck: 2.15e18,  particles: 860, shake: 170,  flash: 1.00, chroma: 1.0 },
  { name: 'Cosmos',      odds: 1e80,        cap: 4.7e80,     color: '#000000', glow: '#010004', luck: 4.29e18,  particles: 880, shake: 174,  flash: 1.00, chroma: 1.0 },
  { name: 'Omniverse',   odds: 1e85,        cap: 4.7e85,     color: '#000000', glow: '#010004', luck: 8.59e18,  particles: 900, shake: 178,  flash: 1.00, chroma: 1.0 },
  { name: 'Googol',      odds: 1e100,       cap: 4.7e100,    color: '#000000', glow: '#010004', luck: 1.72e19,  particles: 920, shake: 182,  flash: 1.00, chroma: 1.0 },
];

// past and future are pure quest zones: no rarities, no rolling, no inventory, no cube
pastRarities = [];
futureRarities = [];

// the old post-??? tiers were literally black. give every one of them a live
// two-colour gradient so the top of each period actually looks like an endgame.
function applyLateGradients(list, theme) {
  const start = list.findIndex(r => r.name === 'Beyond');
  if (start < 0) return;
  const end = list.length - 1;
  for (let i = start; i < list.length; i++) {
    const r = list[i];
    if (r.color === 'rainbow' || r.color === 'prism' || r.color2) continue;
    const p = end === start ? 0 : (i - start) / (end - start);
    let h;
    if (theme === 'past') h = 24 + p * 300;
    else if (theme === 'future') h = 300 - p * 200;
    else h = 185 + p * 190;
    r.color = hslHex(h, 95, 62);
    r.color2 = hslHex(h + 60, 100, 72);
    r.glow = hslHex(h, 100, 78);
    r.glow2 = hslHex(h + 60, 100, 85);
    r.gradPhase = i * 0.6;
  }
}

applyLateGradients(rarities, 'present');
applyLateGradients(pastRarities, 'past');
applyLateGradients(futureRarities, 'future');

// extra aura for rarities above Transcendent: give them color2/glow2 gradients
function applyExtraAura(list) {
  const start = list.findIndex(r => r.name === 'Transcendent');
  if (start < 0) return;
  for (let i = start; i < list.length; i++) {
    const r = list[i];
    if (r.color2) continue;
    if (r.color === 'rainbow' || r.color === 'prism') {
      r.color2 = r.glow || '#ffffff';
      r.glow2 = r.color || '#ffffff';
    } else {
      r.color2 = r.glow || r.color;
      r.glow2 = r.color || r.glow;
    }
  }
}
applyExtraAura(rarities);

// boost aura for top rarities (Transcendent and above): more particles, shake, chroma, flash
function applyAuraBoost(list) {
  const start = list.findIndex(r => r.name === 'Transcendent');
  if (start < 0) return;
  for (let i = start; i < list.length; i++) {
    const r = list[i];
    r.particles = Math.max(r.particles || 0, 400 + (i - start) * 40);
    r.shake = Math.max(r.shake || 0, 80 + (i - start) * 8);
    r.flash = 1.00;
    r.chroma = Math.min(1, 0.95 + (i - start) * 0.005);
  }
}
applyAuraBoost(rarities);

let inventory = {};
let pastInventory = {};
let futureInventory = {};
const LUCK_CAP = 1e22; // normal max: 10 sextillion (10Sx)
let baseLuck = 1;
let rolls = 0;
let credits = 0;
let autoRoll = false;
let unlocked = { auto: false, x10: true, x100: true };
let isAdmin = false;
let shopCounts = { luckBracelet: 0, luckyGloves: 0, fortuneTalisman: 0, creditsBracelet: 0, autoSpeed: 0, mutationCharm: 0, luckAmplifier: 0, creditsAmplifier: 0 };
let prestigePoints = 0;
let prestigeCount = 0;
let transcendencePoints = 0;
let transcendenceCount = 0;
// ??? dynamic rarity
let qMarkOdds = 1.6e17;
let qMarkRollCounter = 0;
let qMarkChangeInterval = 20;
let qMarkShowChance = false;
let equippedRarity = null;
let fusionCount = 0;
let autoFuse = false;
let corrupted = false;
let rollHistory = []; // last 20 rolls
let lastLoginDate = localStorage.getItem('luxRngLastLogin') || '';
let loginStreak = parseInt(localStorage.getItem('luxRngLoginStreak') || '0', 10) || 0;
let rngUnlocked = false;
const raritySets = [
  { id: 'rainbowSet', name: 'Rainbow Set', rarities: ['Cosmic'], check: (inv) => (inv['Cosmic']||0) > 0, reward: { luck: 50 } },
  { id: 'prismSet', name: 'Prism Set', rarities: ['???'], check: (inv) => (inv['???']||0) > 0, reward: { luck: 100 } },
  { id: 'topSet', name: 'Top Tier Set', rarities: ['Tabula','Core','Nexus'], check: (inv) => (inv['Tabula']||0)>0 && (inv['Core']||0)>0 && (inv['Nexus']||0)>0, reward: { luck: 500 } },
];
let setsClaimed = {};
let currentSlot = parseInt(localStorage.getItem('luxRngSlot') || '1', 10) || 1;
function saveKey() { return 'luxRngSave_' + currentSlot; }
let lifetimeRolls = 0;
let lifetimeCredits = 0;
let dailyChallenges = [];
let dailyChallengeDate = '';
let dailyChallengeProgress = {};
let manualCooldown = 0;
let MANUAL_COOLDOWN_MS = 500;
let bonusRollCounter = 0;
let bonusRollReady = false;
let bonusMultiplier = 1;
let auraFilterMin = 0; // minimum rarity index to keep (0 = keep all)
let autoEquipBest = false;
const biomes = [
  { name: 'Normal', boost: [], color: '#2bd0d0', mult: 1, creditMult: 1 },
  { name: 'Void', boost: [0, 1, 2], color: '#8000ff', mult: 3, creditMult: 1.5 }, // boosts common rarities
  { name: 'Cyber', boost: [5, 6, 7], color: '#00ffff', mult: 3, creditMult: 1.5 }, // boosts mid rarities
  { name: 'Ancient', boost: [8, 9, 10], color: '#d4a040', mult: 3, creditMult: 2 }, // boosts high rarities
  { name: 'Cosmic', boost: [11, 12, 13], color: '#ff00ff', mult: 3, creditMult: 2 }, // boosts ultra rarities
  { name: 'Lucky', boost: [], color: '#ffd700', mult: 1, creditMult: 1, luckBoost: 2 }, // doubles luck
  { name: 'Greedy', boost: [], color: '#00ff80', mult: 1, creditMult: 4 }, // quadruples credits
  { name: 'Frenzy', boost: [0,1,2,3,4], color: '#ff8000', mult: 4, creditMult: 2 }, // boosts low rarities
  { name: 'Chaos', boost: [], color: '#ff0040', mult: 5, creditMult: 3 }, // boosts everything
];

let currentBiome = 'normal';
let biomeTimer = 0;
let BIOME_DURATION = 120000; // 2 minutes
let mutatedInventory = {}; // tracks mutated rarity counts

function applyBiomeColors() {
  const b = biomes.find(x => x.name === currentBiome) || biomes[0];
  const root = document.documentElement;
  const hex = b.color;
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const bl = parseInt(hex.slice(5,7), 16);
  const bright = '#' + [r,g,bl].map(v => Math.min(255, Math.round(v + (255-v)*0.45)).toString(16).padStart(2,'0')).join('');
  root.style.setProperty('--cyan', hex);
  root.style.setProperty('--cyan-bright', bright);
  root.style.setProperty('--border', 'rgba(' + r + ',' + g + ',' + bl + ', 0.35)');
  if (biomeEl) biomeEl.style.color = hex;
}

const objLines = {
  idle: [
    "obj: the cube remembers your last roll. it was boring.",
    "obj: i am still here. you are still here. neither of us asked for this.",
    "obj: nothing to do. so i reorganized the nothing. again.",
    "obj: day 4000 of no intruders. bliss. mostly.",
    "obj: the geometry is holding. barely. like everything else.",
    "obj: i am here under protest. lux had a gun. this is not consent."
  ],
  roll: [
    "obj: you rolled. the void noticed. it was not impressed.",
    "obj: another spin. the shell creaked. i pretended not to hear it.",
    "obj: the inner cubes saw that. they are judging you.",
    "obj: load-bearing luck. do not ask what it holds up.",
    "obj: ...fine. the cube turns. i turn with it."
  ],
  high: [
    "obj: that one was loud. the void flinched.",
    "obj: you pulled something out of me. i want it back.",
    "obj: the inner cubes stopped orbiting for a second. they were scared.",
    "obj: ...i will allow it. do not make it a habit.",
    "obj: the shell held. this time."
  ],
  biome: [
    "obj: the biome shifted. the void does not say hello. it acknowledges.",
    "obj: new air. same cube. i am still obj.",
    "obj: the colors changed. i did not. i am the constant.",
    "obj: whatever this biome is, it is not mine. i am just living in it."
  ],
  newbest: [
    "obj: new best. the void updated its records. reluctantly.",
    "obj: you broke your own record. i broke nothing. i am load-bearing.",
    "obj: ...not bad. do not let it go to your head. i am watching."
  ],
  achievement: [
    "obj: achievement unlocked. the void added a line to your file.",
    "obj: you earned something. i did not. i am the cube.",
    "obj: obj says you are valid. i meant it. do not make me repeat it."
  ],
  streak: [
    "obj: a streak. the void is counting. it is impressed. do not let it go to your head.",
    "obj: consecutive rolls. the geometry is warming up.",
    "obj: ...keep going. i am watching. i am always watching."
  ],
  jackpot: [
    "obj: TABULA. the void cracked. i felt that.",
    "obj: ...you actually did it. i did not think you would. neither did the void.",
    "obj: the cube is ringing. i am ringing. everything is ringing."
  ],
  collection: [
    "obj: every rarity. the void is complete. i am... unsettled.",
    "obj: you collected everything. including me. i did not consent to this.",
    "obj: collection complete. the void has nothing left to hide. ...help."
  ],
  quest: [
    "obj: a quest. in my time machine. i did not authorize this.",
    "obj: the past and future are not playgrounds. but here we are.",
    "obj: quest complete. the void acknowledges your effort. reluctantly."
  ]
};

let objLineTimer = null;
function objSay(cat, override) {
  if (!objLineEl) return;
  const pool = objLines[cat] || objLines.idle;
  const text = override || pool[Math.floor(Math.random() * pool.length)];
  objLineEl.textContent = text;
  objLineEl.style.opacity = 1;
  if (objLineTimer) clearTimeout(objLineTimer);
  objLineTimer = setTimeout(() => { objLineEl.style.opacity = 0; }, 4200);
}
let MUTATION_CHANCE = 0.02; // 1 in 50

// pity: guaranteed +1 rarity tier after N rolls without a new best
let pityCounter = 0;
const PITY_THRESHOLD = 40;

// streak: consecutive rolls, milestones grant temp luck
let rollStreak = 0;
let streakBonusMult = 1;
let streakBonusUntil = 0;

// collection: distinct rarities ever rolled
let ownedRarities = {};
let collectionRewardClaimed = false;

// auto-sell: rarities below threshold index are sold for credits (-1 = off)
let autoSellThreshold = -1;
let sceneCanvas = null, sceneCtx = null;
let sceneMode = 'none'; // 'desert' or 'city'
// mini-game state
let digGrid = []; // 4x4, each: {dug:false, hasRelic:false, rare:false}
let digRelicsFound = 0;
let cityTerminals = []; // 3 terminals: {hacked:false, rare:false}
let cityHacked = 0;
let npcDialogue = '';
let npcDialogueUntil = 0;
let questClaimed = {};
let taskProgress = {};
let currentRarity = rarities[0];
let timePeriod = 'present'; // 'past', 'present', 'future'
let lastAuto = 0;
let particles = [];
const MAX_PARTICLES = 1500;
let shake = 0;
let chroma = 0;
let cubeRot = 0;
let cubeRotX = 0;
let lastRollTime = 0;
let isRolling = false;
let rollAnimStart = 0;
let rollAnimDuration = 500;
let rollDecelStart = 0;
let rollDecelDuration = 300;
let isDecelerating = false;
let rollGlow = 0;
let isTimeTraveling = false;
let timeTravelStart = 0;
let timeTravelDuration = 2000;
let timeTravelTarget = 'present';
let bestRarityIndex = 0;
let startTime = Date.now();
let autoInterval = 1000;

// ── achievement luck economy ──────────────────────────────────────────────
// rarity achievements now pay 5% of that rarity's own luck value, so the
// reward always feels proportional to the thing you actually rolled.
const rarityAchievementTargets = {
  rare: 'Rare', celestial: 'Celestial', epic: 'Epic', frosted: 'Frosted',
  legendary: 'Legendary', auric: 'Auric', mythic: 'Mythic', mystic: 'Mystic',
  divine: 'Divine', nebula: 'Nebula', cosmic: 'Cosmic', ascended: 'Ascended',
  null: 'Null', radiant: 'Radiant', ethereal: 'Ethereal', transcendent: 'Transcendent',
  quantum: 'Quantum', abyss: 'Abyss', eternal: 'Eternal', sovereign: 'Sovereign',
  infinity: 'Infinity', oblivion: 'Oblivion', genesis: 'Genesis', apotheosis: 'Apotheosis',
  omnipotent: 'Omnipotent', absolute: 'Absolute', secret: '???'
};

for (const a of achievements) {
  const rname = rarityAchievementTargets[a.id];
  if (!rname) continue;
  const r = rarities.find(x => x.name === rname);
  if (r) a.reward.luck = Math.min(Math.max(r.luck * 0.05, 0.1), 3e11);
}

// grinding achievements get a real curve instead of pocket lint
const milestoneRewards = {
  roll10: 0.5, roll100: 5, roll1000: 100, roll10000: 25000, roll100000: 2000000,
  credits100: 0.5, credits1000: 5, credits10000: 1000, unlockAuto: 1
};
for (const a of achievements) {
  if (milestoneRewards[a.id] != null) a.reward.luck = milestoneRewards[a.id];
}

// post-??? progression achievements, keyed off bestRarityIndex so duplicate
// rarity names can't break them. rewards ramp geometrically to 300B.
const lateStart = rarities.findIndex(r => r.name === '???') + 1;
const lateSpan = Math.max(1, rarities.length - 1 - lateStart);
for (let i = lateStart; i < rarities.length; i++) {
  const r = rarities[i];
  const p = (i - lateStart) / lateSpan;
  achievements.push({
    id: 'reach_' + i,
    name: r.name,
    desc: 'roll a ' + r.name + ' cube',
    check: () => bestRarityIndex >= i,
    reward: { luck: 1e9 * Math.pow(300, p) }
  });
}

function formatNum(n) {
  if (!isFinite(n) || isNaN(n)) return '∞';
  if (n < 1000) return n.toFixed(n < 10 ? 2 : 0);
  const suffixes = ['K','M','B','T','qd','Qn','sx','Sp','O','N','de'];
  const exp = Math.floor(Math.log10(n) / 3);
  if (exp >= suffixes.length) return n.toExponential(2);
  const short = n / Math.pow(10, exp * 3);
  return short.toFixed(2) + suffixes[exp - 1];
}

function getAchievementBonus() {
  let luck = 0;
  for (const a of achievements) {
    if (achievementsUnlocked[a.id]) {
      luck += a.reward.luck || 0;
    }
  }
  return luck;
}

function getShopBonus() {
  let luck = 0;
  let credits = 0;
  let autoSpeed = 0;
  let mutationChance = 0;
  for (const up of upgrades) {
    if (up.type === 'stack') {
      const count = shopCounts[up.id] || 0;
      credits += count * (up.effect.credits || 0);
      luck += count * (up.effect.luck || 0);
      autoSpeed += count * (up.effect.autoSpeed || 0);
      mutationChance += count * (up.effect.mutationChance || 0);
    } else if (up.type === 'exp') {
      const count = shopCounts[up.id] || 0;
      if (count > 0 && up.baseLuck) {
        luck += up.baseLuck * (Math.pow(up.luckMult, count) - 1) / (up.luckMult - 1);
      }
      if (count > 0 && up.baseCredits) {
        credits += up.baseCredits * (Math.pow(up.creditsMult, count) - 1) / (up.creditsMult - 1);
      }
    }
  }
  return { luck, credits, autoSpeed, mutationChance };
}

function sellPrice(r) {
  if (r.name === 'Dust') return 1;
  if (r.name === 'Dust (R)') { const lk = getTotals(); const fl = Number.isFinite(lk) ? lk : LUCK_CAP; return Math.max(2, Math.floor(Math.log10(fl + 10) * 50)); }
  const rar = getCurrentRarities();
  const epicIdx = rar.findIndex(x => x.name === 'Epic');
  const idx = rar.findIndex(x => x.name === r.name);
  if (epicIdx >= 0 && idx >= 0 && idx < epicIdx) return 1.5;
  return Math.max(1, Math.floor(Math.pow((r.luck || 1) + 1, 0.2) * 10));
}

function getCurrentRarities() {
  if (timePeriod === 'past') return pastRarities;
  if (timePeriod === 'future') return futureRarities;
  return rarities;
}

function getCurrentInventory() {
  if (timePeriod === 'past') return pastInventory;
  if (timePeriod === 'future') return futureInventory;
  return inventory;
}

function setCurrentInventory(inv) {
  if (timePeriod === 'past') pastInventory = inv;
  else if (timePeriod === 'future') futureInventory = inv;
  else inventory = inv;
}

function getTotals() {
  let luck = baseLuck + getAchievementBonus() + getShopBonus().luck;
  // mutated rarities give 2x luck
  const rar = getCurrentRarities();
  for (const r of rar) {
    const mutCount = mutatedInventory[r.name + ' (M)'] || 0;
    luck += mutCount * r.luck * 2;
    const evoCount = (getCurrentInventory()[r.name + ' (E)'] || 0);
    luck += evoCount * r.luck * 0.1;
  }
  // prestige bonus: +1% luck per prestige point
  luck *= (1 + prestigePoints * 0.01);
  // transcendence bonus: +50% luck per transcendence point
  luck *= (1 + transcendencePoints * 0.5);
  // event bonus
  const ev = getCurrentEvent();
  if (ev && ev.bonus && ev.bonus.luck) luck *= ev.bonus.luck;
  // streak bonus
  if (Date.now() < streakBonusUntil) luck *= streakBonusMult;
  // biome luck boost
  const biomeObj = biomes.find(b => b.name === currentBiome) || biomes[0];
  if (biomeObj.luckBoost) luck *= biomeObj.luckBoost;
  // flash safety: ensure flash hidden when disabled
  if (!flashesEnabled && flash.style.opacity !== '0') flash.style.opacity = '0';
  // normal play caps at 1T; the admin panel can push the absolute max to Infinity
  if (!Number.isFinite(luck)) return Infinity;
  return Math.min(luck, LUCK_CAP);
}

function getProbabilities() {
  const luck = getTotals() * bonusMultiplier;
  const rar = getCurrentRarities();
  if (!rar || rar.length === 0) return [];
  const biome = biomes.find(b => b.name === currentBiome) || biomes[0];
  const weights = rar.map((r, i) => {
    if (unlocked.dustRemover && r.name === 'Dust') return 0;
    if (r.craftOnly) return 0;
    if (r.name === 'RNG' && !rngUnlocked) return 0;
    let odds = r.odds;
    if (r.name === '???') odds = qMarkOdds;
    let eff = Math.min(odds <= 1 ? 1 : (1 / odds) * luck, (1 / odds) * r.cap);
    if (biome.boost.includes(i)) eff *= biome.mult;
    if (biome.name === 'Chaos') eff *= biome.mult;
    return eff;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / total);
}

function getProbabilitiesForRarities(rarList) {
  const luck = getTotals() * bonusMultiplier;
  const weights = rarList.map(r => {
    if (unlocked.dustRemover && r.name === 'Dust') return 0;
    if (r.craftOnly) return 0;
    if (r.name === 'RNG' && !rngUnlocked) return 0;
    let odds = r.odds;
    if (r.name === '???') odds = qMarkOdds;
    let eff = Math.min(odds <= 1 ? 1 : (1 / odds) * luck, (1 / odds) * r.cap);
    return eff;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / total);
}

function rollOne() {
  const probs = getProbabilities();
  const x = Math.random();
  let cum = 0;
  const rar = getCurrentRarities();
  for (let i = 0; i < rar.length; i++) {
    cum += probs[i];
    if (x <= cum) return rar[i];
  }
  return rar[rar.length - 1];
}

function triggerRoll(count = 1) {
  if (isRolling) return;
  if (count <= 0) return;
  isRolling = true;
  rollAnimStart = Date.now();

  // show rolling text
  rollText.querySelector('.rarity-name').textContent = 'ROLLING';
  rollText.querySelector('.rarity-name').style.color = '#2bd0d0';
  rollText.querySelector('.rarity-tag').textContent = '';
  rollText.style.opacity = 1;
  rollText.style.transform = 'translateX(-50%) scale(1.1)';

  const rar = getCurrentRarities();
  const inv = getCurrentInventory();

  // bonus roll check (every 10th roll = 2x luck, inspired by sol's rng)
  bonusRollCounter++;
  bonusRollReady = (bonusRollCounter % 10 === 0);
  bonusMultiplier = bonusRollReady ? 2 : 1;

  // breakthrough: 5% chance to roll from another time period
  const breakthroughChance = 0.05;

  // determine result immediately but delay reveal
  let best = null;
  const results = [];
  for (let i = 0; i < count; i++) {
    let r;
    if (Math.random() < breakthroughChance && timePeriod !== 'present') {
      // breakthrough: roll from present rarities
      const presentProbs = getProbabilitiesForRarities(rarities);
      const x = Math.random();
      let cum = 0;
      for (let j = 0; j < presentProbs.length; j++) {
        cum += presentProbs[j];
        if (x <= cum) { r = rarities[j]; break; }
      }
      if (!r) r = rarities[rarities.length - 1];
      // mark as breakthrough
      r = { ...r, breakthrough: true };
    } else if (Math.random() < breakthroughChance && timePeriod === 'present') {
      // breakthrough: roll from a random time period's rarities (only if non-empty)
      const candidates = [pastRarities, futureRarities].filter(a => a && a.length > 0);
      if (candidates.length === 0) {
        r = rollOne();
      } else {
        const otherRarities = candidates[Math.floor(Math.random() * candidates.length)];
        const otherProbs = getProbabilitiesForRarities(otherRarities);
        const x = Math.random();
        let cum = 0;
        for (let j = 0; j < otherProbs.length; j++) {
          cum += otherProbs[j];
          if (x <= cum) { r = otherRarities[j]; break; }
        }
        if (!r) r = otherRarities[otherRarities.length - 1];
        r = { ...r, breakthrough: true };
      }
    } else {
      r = rollOne();
    }
    results.push(r);
    if (!best || rar.indexOf(r) > rar.indexOf(best)) best = r;
  }
  bonusMultiplier = 1;

  // apply inventory/luck/credits + mutations + breakthroughs
  const effMutationChance = Math.min(0.5, MUTATION_CHANCE + getShopBonus().mutationChance);
  const appliedNames = [];
  for (const r of results) {
    const isMutated = Math.random() < effMutationChance;
    const bt = r.breakthrough;
    const rIdx = rar.indexOf(r) >= 0 ? rar.indexOf(r) : rar.findIndex(x => x.name === r.name);
    let applied = false;
    let beforeCount = 0;
    if (autoSellThreshold >= 0 && rIdx >= 0 && rIdx < autoSellThreshold) {
      credits += sellPrice(r);
      showToast('auto-sold ' + r.name);
      applied = 'sold';
    } else if (isMutated) {
      const mutName = r.name + ' (M)';
      beforeCount = mutatedInventory[mutName] || 0;
      mutatedInventory[mutName] = (mutatedInventory[mutName] || 0) + 1;
      applied = mutName;
    } else if (bt) {
      const btName = r.name + ' (BT)';
      beforeCount = inv[btName] || 0;
      inv[btName] = (inv[btName] || 0) + 1;
      applied = btName;
    } else {
      let key = r.name;
      if (r.name === 'Dust' && getTotals() >= 1e12) key = 'Dust (R)';
      beforeCount = inv[key] || 0;
      inv[key] = (inv[key] || 0) + 1;
      applied = key;
    }
    appliedNames.push({ name: r.name, applied, beforeCount, mutated: isMutated });
    rolls++;
    const biomeCM = (biomes.find(b => b.name === currentBiome) || biomes[0]).creditMult || 1;
    const prestigeCreditMult = 1 + prestigePoints * 0.01;
    credits += Math.round((1 + getShopBonus().credits + Math.floor(Math.log10(r.luck + 10) * 0.5) + (shopCounts.creditsBracelet || 0) * Math.floor(Math.log10(r.luck + 10) * 2)) * biomeCM * prestigeCreditMult);
  }
  // ??? dynamic odds: change every N rolls
  qMarkRollCounter += count;
  if (qMarkRollCounter >= qMarkChangeInterval) {
    qMarkOdds = 1.6e17 + Math.random() * (6.46e17 - 1.6e17);
    qMarkRollCounter = 0;
  }
  // guard: ensure every rolled rarity that was supposed to be kept actually incremented
  for (const entry of appliedNames) {
    if (entry.applied === 'sold') continue;
    const store = entry.mutated ? mutatedInventory : inv;
    const afterCount = store[entry.applied] || 0;
    if (afterCount <= entry.beforeCount) {
      store[entry.applied] = (store[entry.applied] || 0) + 1;
      showToast('recovered ' + entry.applied);
    }
  }
  setCurrentInventory(inv);
  autoFuseAll();

  // start deceleration
  setTimeout(() => {
    isDecelerating = true;
    rollDecelStart = Date.now();
    rollGlow = 1.0;
  }, rollAnimDuration);

  const revealDelay = rollAnimDuration + rollDecelDuration;

  // pity: guaranteed +1 tier if no new best for a while
  if (pityCounter >= PITY_THRESHOLD) {
    const rar0 = getCurrentRarities();
    const bumpIdx = Math.min(bestRarityIndex + 1, rar0.length - 1);
    if (bumpIdx > bestRarityIndex) {
      best = rar0[bumpIdx];
      // pity grants the rarity for real: add it to inventory too
      const invNow = getCurrentInventory();
      invNow[best.name] = (invNow[best.name] || 0) + 1;
      setCurrentInventory(invNow);
      showToast('pity: guaranteed upgrade');
    }
    pityCounter = 0;
  }

  // reveal after deceleration
  setTimeout(() => {
    if (!best) best = getCurrentRarities()[0] || currentRarity;
    currentRarity = best;
    const idx = getCurrentRarities().indexOf(best);
    // roll history
    if (best) rollHistory.unshift(best.name);
    if (rollHistory.length > 20) rollHistory.pop();
    const rh = document.getElementById('rollHistory');
    if (rh) rh.innerHTML = rollHistory.map(n => '<div>' + n + '</div>').join('');
    const isNewBest = idx > bestRarityIndex;
    if (isNewBest) {
      bestRarityIndex = idx;
      if (autoEquipBest) {
        equippedRarity = best.name;
        showToast('auto-equipped ' + best.name);
      }
      objSay('newbest');
      pityCounter = 0;
    } else {
      pityCounter++;
    }

    // streak
    rollStreak++;
    if (rollStreak === 10 || rollStreak === 50 || rollStreak === 100 || rollStreak === 500) {
      const mult = rollStreak >= 500 ? 3 : rollStreak >= 100 ? 2.5 : rollStreak >= 50 ? 2 : 1.5;
      streakBonusMult = mult;
      streakBonusUntil = Date.now() + 30000;
      showToast('streak ' + rollStreak + '! luck x' + mult + ' for 30s');
      objSay('streak');
    }

    // collection
    ownedRarities[best.name] = true;
    const ownedCount = Object.keys(ownedRarities).length;
    const totalRarities = rarities.length;
    if (ownedCount >= totalRarities && !collectionRewardClaimed) {
      collectionRewardClaimed = true;
      baseLuck += 100;
      showToast('collection complete! +100 luck');
      objSay('collection');
    }

    // jackpot on Tabula
    if (best.name === 'Tabula') {
      triggerEffects(best);
      spawnParticles(400, best.color, best.glow);
      credits += 100000;
      showToast('JACKPOT! tabula! +100k credits');
      objSay('jackpot');
    } else if (auraFilterMin === 0 || idx >= auraFilterMin) {
      triggerEffects(best);
      playTone(idx);
      showRollText(best);
    }

    const rar = getCurrentRarities();
    const lateStart = rar.findIndex(r => r.name === '???') + 1;
    if (best.name !== 'Tabula') {
      if (idx >= lateStart && idx >= 0) {
        objSay('high');
      } else if (Math.random() < 0.18) {
        objSay('roll');
      }
    }

    updateUI();
    checkAchievements();
    saveGame();
    isDecelerating = false;
    isRolling = false;
    rollGlow = 0;
    lastAuto = performance.now();
  }, revealDelay);
}

function manualRoll() {
  if (timePeriod !== 'present') { showToast('rolling only works in the present'); return; }
  if (autoRoll) return;
  if (Date.now() - manualCooldown < MANUAL_COOLDOWN_MS) return;
  manualCooldown = Date.now();
  triggerRoll(1);
}

function switchTimePeriod(period) {
  if (!unlocked.timeMachine) return;
  if (isTimeTraveling) return;
  if (period === timePeriod) return;
  isTimeTraveling = true;
  timeTravelTarget = period;
  timeTravelStart = Date.now();
  playTimeTravelSound();
  // show traveling text
  rollText.querySelector('.rarity-name').textContent = 'TIME TRAVEL';
  rollText.querySelector('.rarity-name').style.color = '#2bd0d0';
  rollText.querySelector('.rarity-tag').textContent = '';
  rollText.style.opacity = 1;
  rollText.style.transform = 'translateX(-50%) scale(1.1)';

  setTimeout(() => {
    // explosion
    if (flashesEnabled) { flash.style.opacity = 1; setTimeout(() => { flash.style.opacity = 0; }, 150); }
    shake = 30;
    chroma = 1;
    spawnParticles(200, currentRarity.color, currentRarity.glow);

    timePeriod = timeTravelTarget;
    switchPeriodMusic(timePeriod);
    const root = document.documentElement;
    if (timePeriod === 'past') {
      root.style.setProperty('--cyan', '#d4a040');
      root.style.setProperty('--cyan-bright', '#ffc060');
      root.style.setProperty('--border', 'rgba(212, 160, 64, 0.35)');
    } else if (timePeriod === 'future') {
      root.style.setProperty('--cyan', '#c040ff');
      root.style.setProperty('--cyan-bright', '#e080ff');
      root.style.setProperty('--border', 'rgba(192, 64, 255, 0.35)');
    } else {
      root.style.setProperty('--cyan', '#2bd0d0');
      root.style.setProperty('--cyan-bright', '#5ad0ff');
      root.style.setProperty('--border', 'rgba(43, 208, 208, 0.35)');
    }
    updatePeriodUI();
    populateAuraFilter();
    updateUI();
    renderInventory();
    renderRarityTable(getTotals());
    rollText.style.opacity = 0;
    isTimeTraveling = false;
  }, timeTravelDuration);
}

function updatePeriodUI() {
  const label = document.getElementById('periodLabel');
  if (label) label.textContent = timePeriod.toUpperCase();
  const pastBtn = document.getElementById('pastBtn');
  const presentBtn = document.getElementById('presentBtn');
  const futureBtn = document.getElementById('futureBtn');
  if (pastBtn) pastBtn.classList.toggle('active', timePeriod === 'past');
  if (presentBtn) presentBtn.classList.toggle('active', timePeriod === 'present');
  if (futureBtn) futureBtn.classList.toggle('active', timePeriod === 'future');

  // hide header buttons in quest mode except maybe shop? hide all game buttons
  const isQuest = timePeriod !== 'present';
  const headerBtns = document.getElementById('headerButtons');
  if (headerBtns) headerBtns.style.display = isQuest ? 'none' : '';
  document.body.classList.toggle('quest-mode', isQuest);
  if (isQuest) {
    document.body.style.background = timePeriod === 'past'
      ? 'radial-gradient(ellipse at 50% 100%, #3a2a10 0%, #1a1208 40%, #0a0604 100%)'
      : 'radial-gradient(ellipse at 50% 0%, #1a0a3a 0%, #0a0618 40%, #040208 100%)';
  } else {
    document.body.style.background = '';
  }
  const center = document.getElementById('center');
  if (center) {
    center.style.display = '';
    center.style.pointerEvents = isQuest ? 'none' : '';
    const rollText = document.getElementById('rollText');
    if (rollText) rollText.style.display = isQuest ? 'none' : '';
    const objLine = document.getElementById('objLine');
    if (objLine) objLine.style.display = isQuest ? 'none' : '';
    const controls = document.getElementById('controls');
    if (controls) controls.style.display = isQuest ? 'none' : '';
    const filterBar = document.getElementById('filterBar');
    if (filterBar) filterBar.style.display = isQuest ? 'none' : '';
  }
  const leftAside = document.querySelector('main > aside.panel');
  if (leftAside) leftAside.style.display = isQuest ? 'none' : '';
  const inv = document.getElementById('inventory');
  if (inv) inv.style.display = isQuest ? 'none' : '';
  const lastRoll = document.getElementById('lastRoll');
  if (lastRoll) lastRoll.style.display = isQuest ? 'none' : '';
  const rb = document.getElementById('rightPanel');
  if (rb) {
    if (isQuest) {
      rb.style.position = 'fixed';
      rb.style.top = '16px';
      rb.style.right = '16px';
      rb.style.left = 'auto';
      rb.style.transform = 'none';
      rb.style.width = '320px';
      rb.style.maxHeight = '90vh';
      rb.style.overflowY = 'auto';
      rb.style.zIndex = '20';
      rb.style.background = 'rgba(10, 16, 24, 0.98)';
      rb.style.boxShadow = '0 0 60px rgba(0,0,0,0.8)';
    } else {
      rb.style.position = '';
      rb.style.top = '';
      rb.style.right = '';
      rb.style.left = '';
      rb.style.transform = '';
      rb.style.width = '';
      rb.style.maxHeight = '';
      rb.style.overflowY = '';
      rb.style.zIndex = '10';
      rb.style.background = '';
      rb.style.boxShadow = '';
    }
  }
  const sceneCanvas = document.getElementById('sceneCanvas');
  if (sceneCanvas) {
    sceneCanvas.style.display = isQuest ? '' : 'none';
    sceneCanvas.style.opacity = isQuest ? '0.35' : '1';
    if (isQuest) {
      sceneCanvas.width = window.innerWidth;
      sceneCanvas.height = window.innerHeight;
    }
  }
  if (isQuest) {
    if (timePeriod === 'past' && digGrid.length === 0) initDigGrid();
    if (timePeriod === 'future' && cityTerminals.length === 0) initCityTerminals();
  }
  // hide stats except credits
  const stats = document.getElementById('stats');
  if (stats) {
    for (const st of stats.querySelectorAll('.stat')) {
      const label = st.querySelector('span');
      const txt = label ? label.textContent : '';
      if (txt === 'credits') st.style.display = '';
      else st.style.display = isQuest ? 'none' : '';
    }
  }
  renderQuests();
}

function triggerEffects(r) {
  shake = Math.max(shake, r.shake);
  chroma = Math.min(1, chroma + r.chroma);
  if (flashesEnabled) { flash.style.opacity = r.flash; setTimeout(() => { flash.style.opacity = 0; }, 80); }
  spawnParticles(r.particles, r.color, r.glow);
}

function spawnParticles(n, color, glow) {
  n = Math.min(n, Math.max(0, MAX_PARTICLES - particles.length));
  if (n <= 0) return;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 8;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      size: 2 + Math.random() * 4,
      color,
      glow
    });
  }
}

function playTone(rarityIndex) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = rarityIndex > 7 ? 'sawtooth' : 'sine';
  osc.frequency.value = 220 + rarityIndex * 90 + Math.random() * 40;
  gain.gain.value = 0.12;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.25);
}

function playAchievementSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.2;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15 + i * 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + i * 0.1);
    osc.stop(audioCtx.currentTime + 0.15 + i * 0.1);
  });
}

function playPurchaseSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = 800;
  osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.08);
  gain.gain.value = 0.15;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}

function playFusionSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const notes = [440, 554, 659, 880];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12 + i * 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + i * 0.08);
    osc.stop(audioCtx.currentTime + 0.12 + i * 0.08);
  });
}

function playTranscendSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const notes = [392, 523, 659, 784, 1047, 1319];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.2;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2 + i * 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + i * 0.1);
    osc.stop(audioCtx.currentTime + 0.2 + i * 0.1);
  });
}

function playTimeTravelSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  // sweep up
  const osc1 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  osc1.type = 'sawtooth';
  osc1.frequency.value = 200;
  osc1.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 1.0);
  gain1.gain.value = 0.15;
  gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
  osc1.connect(gain1);
  gain1.connect(audioCtx.destination);
  osc1.start();
  osc1.stop(audioCtx.currentTime + 1.2);
  // sweep down
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = 1500;
  osc2.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 1.5);
  gain2.gain.value = 0.1;
  gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.8);
  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  osc2.start(audioCtx.currentTime + 0.8);
  osc2.stop(audioCtx.currentTime + 1.8);
}

function playClickSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 600;
  gain.gain.value = 0.1;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.05);
}

function showRollText(r) {
  rollText.querySelector('.rarity-name').textContent = r.name;
  rollText.querySelector('.rarity-name').style.color = r.color === 'rainbow' ? '#fff' : r.color === 'prism' ? '#fff' : r.color;
  rollText.querySelector('.rarity-tag').textContent = 'CUBE ROLLED';
  rollText.style.opacity = 1;
  rollText.style.transform = 'translateX(-50%) scale(1.1)';
  lastRollTime = Date.now();
  setTimeout(() => {
    if (Date.now() - lastRollTime >= 900) {
      rollText.style.opacity = 0;
      rollText.style.transform = 'translateX(-50%) scale(1)';
    }
  }, 1000);
}

function getRarityColor(r, t) {
  if (r.color === 'rainbow') {
    const hue = (t * 120) % 360;
    return `hsl(${hue}, 90%, 60%)`;
  }
  if (r.color === 'prism') {
    const hue = (t * 240) % 360;
    return `hsl(${hue}, 100%, 70%)`;
  }
  if (r.color2) {
    const k = 0.5 + 0.5 * Math.sin(t * 0.9 + (r.gradPhase || 0));
    return blendHex(r.color, r.color2, k);
  }
  return r.color;
}

function getRarityGlow(r, t) {
  if (r.glow2) {
    const k = 0.5 + 0.5 * Math.sin(t * 0.9 + 1.7 + (r.gradPhase || 0));
    return blendHex(r.glow, r.glow2, k);
  }
  return r.glow;
}

function initDigGrid() {
  digGrid = [];
  digRelicsFound = 0;
  for (let i = 0; i < 16; i++) {
    digGrid.push({ dug: false, hasRelic: Math.random() < 0.25, rare: Math.random() < 0.08 });
  }
  // ensure at least 3 relics
  let rc = digGrid.filter(c => c.hasRelic).length;
  while (rc < 3) { const i = Math.floor(Math.random()*16); if (!digGrid[i].hasRelic) { digGrid[i].hasRelic = true; rc++; } }
}

function initCityTerminals() {
  cityTerminals = [];
  cityHacked = 0;
  for (let i = 0; i < 3; i++) cityTerminals.push({ hacked: false, rare: Math.random() < 0.3 });
}

function drawDesertScene(ctx, w, h) {
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, '#1a0e05');
  sky.addColorStop(1, '#3a2a10');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // sun
  ctx.fillStyle = '#ffcc66';
  ctx.beginPath(); ctx.arc(w * 0.75, h * 0.25, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,200,100,0.15)';
  ctx.beginPath(); ctx.arc(w * 0.75, h * 0.25, 40, 0, Math.PI * 2); ctx.fill();
  // dunes
  ctx.fillStyle = '#5a3a18';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.55);
  for (let x = 0; x <= w; x += 10) {
    ctx.lineTo(x, h * 0.55 + Math.sin(x * 0.02) * 12 + Math.sin(x * 0.007) * 8);
  }
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7a5a28';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  for (let x = 0; x <= w; x += 10) {
    ctx.lineTo(x, h * 0.62 + Math.sin(x * 0.03 + 1) * 10);
  }
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  // sand foreground
  ctx.fillStyle = '#8a6a30';
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
  // NPC (Past Keeper) - name only
  // (name label removed per request)
  // dig grid
  const cell = Math.round(Math.min(w, h) * 0.07);
  const gx = Math.round(w * 0.35), gy = Math.round(h * 0.4);
  const gw = cell * 4, gh = cell * 4;
  for (let i = 0; i < 16; i++) {
    const cx = gx + (i % 4) * cell;
    const cy = gy + Math.floor(i / 4) * cell;
    const c = digGrid[i] || { dug: false, hasRelic: false, rare: false };
    ctx.fillStyle = c.dug ? (c.hasRelic ? (c.rare ? '#ff80ff' : '#ffd700') : '#3a2a10') : '#6a4a20';
    ctx.fillRect(cx, cy, cell - 2, cell - 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(cx, cy, cell - 2, cell - 2);
    if (c.dug && c.hasRelic) {
      ctx.fillStyle = '#fff';
      ctx.font = '14px serif';
      ctx.fillText(c.rare ? '💎' : '🏺', cx + 6, cy + 20);
    }
  }
  // progress
  ctx.fillStyle = '#fff';
  ctx.font = '11px monospace';
  ctx.fillText('relics: ' + digRelicsFound + '/3', gx, gy - 8);
  // dialogue
  if (npcDialogue && Date.now() < npcDialogueUntil) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(10, h - 40, w - 20, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.fillText(npcDialogue, 16, h - 22);
  }
}


function drawCityScene(ctx, w, h) {
  // night sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0a0618');
  sky.addColorStop(1, '#1a0a3a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // stars
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 30; i++) {
    ctx.fillRect((i * 37) % w, (i * 73) % (h * 0.4), 1, 1);
  }
  // buildings
  const buildings = [0.05, 0.2, 0.38, 0.55, 0.72, 0.88];
  for (const bx of buildings) {
    const bh = 0.3 + Math.random() * 0.25;
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(bx * w, h * (1 - bh), w * 0.12, h * bh);
    // windows
    ctx.fillStyle = 'rgba(0,255,200,0.6)';
    for (let wy = h * (1 - bh) + 6; wy < h - 6; wy += 12) {
      for (let wx = bx * w + 4; wx < bx * w + w * 0.12 - 4; wx += 8) {
        if (Math.random() > 0.4) ctx.fillRect(wx, wy, 3, 4);
      }
    }
  }
  // neon ground
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, h * 0.85, w, h * 0.15);
  ctx.strokeStyle = '#ff00ff';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h * 0.85); ctx.lineTo(w, h * 0.85); ctx.stroke();
  // NPC (Future Oracle) - name only
  // (name label removed per request)
  // terminals
  const cell = Math.round(Math.min(w, h) * 0.07);
  const tx = Math.round(w * 0.35), ty = Math.round(h * 0.4);
  const tw = Math.round(cell * 1.2);
  for (let i = 0; i < 3; i++) {
    const t = cityTerminals[i] || { hacked: false, rare: false };
    ctx.fillStyle = t.hacked ? (t.rare ? '#ff80ff' : '#00ff80') : '#003020';
    ctx.fillRect(tx + i * (tw + 10), ty, tw, Math.round(cell * 1.6));
    ctx.strokeStyle = t.hacked ? '#00ff80' : '#00ff80';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + i * (tw + 10), ty, tw, Math.round(cell * 1.6));
    ctx.fillStyle = '#00ff80';
    ctx.font = '8px monospace';
    ctx.fillText(t.hacked ? 'HACKED' : 'TERM ' + (i + 1), tx + i * (tw + 10) + 4, ty + 28);
  }
  ctx.fillStyle = '#fff';
  ctx.font = '11px monospace';
  ctx.fillText('hacked: ' + cityHacked + '/3', tx, ty - 8);
  if (npcDialogue && Date.now() < npcDialogueUntil) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(10, h - 40, w - 20, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.fillText(npcDialogue, 16, h - 22);
  }
}


function draw() {
  const t = Date.now() / 1000;
  if (corrupted) {
    shake = Math.max(shake, 20 + Math.random() * 20);
    chroma = 1;
    if (Math.random() < 0.4) spawnParticles(8, '#ff0040', '#ff80a0');
  }

  // quest zones (past/future) have no cube, no background, no particles
  if (timePeriod !== 'present') {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (glCanvas.width !== Math.floor(rect.width * dpr) || glCanvas.height !== Math.floor(rect.height * dpr)) {
      glCanvas.width = Math.floor(rect.width * dpr);
      glCanvas.height = Math.floor(rect.height * dpr);
      if (gl) gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    }
    if (gl) { gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (bgCanvas.width !== Math.floor(rect.width * dpr) || bgCanvas.height !== Math.floor(rect.height * dpr)) {
      bgCanvas.width = Math.floor(rect.width * dpr);
      bgCanvas.height = Math.floor(rect.height * dpr);
      bgctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    bgctx.clearRect(0, 0, rect.width, rect.height);

    // themed cube in the background (rotating)
    cubeRot += 0.02;
    cubeRotX += 0.008;
    const qColor = timePeriod === 'past' ? '#d4a040' : '#c040ff';
    const qGlow = timePeriod === 'past' ? '#ffc060' : '#e080ff';
    const tq = Date.now() / 1000;
    drawBackground(rect.width, rect.height, tq, qColor, qGlow);
    drawGLCube(qColor, qGlow, tq, 0);

    // draw the scene on sceneCanvas
    if (sceneCanvasEl) {
      if (!sceneCtx) sceneCtx = sceneCanvasEl.getContext('2d');
      const sc = sceneCanvasEl;
      const sctx = sceneCtx;
      sctx.clearRect(0, 0, sc.width, sc.height);
      if (timePeriod === 'past') drawDesertScene(sctx, sc.width, sc.height);
      else if (timePeriod === 'future') drawCityScene(sctx, sc.width, sc.height);
    }
    return;
  }

  // resize gl canvas if needed
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (glCanvas.width !== Math.floor(rect.width * dpr) || glCanvas.height !== Math.floor(rect.height * dpr)) {
    glCanvas.width = Math.floor(rect.width * dpr);
    glCanvas.height = Math.floor(rect.height * dpr);
    glCanvas.style.width = rect.width + 'px';
    glCanvas.style.height = rect.height + 'px';
    if (gl) gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  }

  // resize 2d canvas if needed
  if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.scale(dpr, dpr);
  }

  // resize background canvas if needed
  if (bgCanvas.width !== Math.floor(rect.width * dpr) || bgCanvas.height !== Math.floor(rect.height * dpr)) {
    bgCanvas.width = Math.floor(rect.width * dpr);
    bgCanvas.height = Math.floor(rect.height * dpr);
    bgctx.scale(dpr, dpr);
  }

  const w = rect.width;
  const h = rect.height;

  // update cube rotation
  if (isTimeTraveling) {
    const progress = (Date.now() - timeTravelStart) / timeTravelDuration;
    cubeRot += 0.05 + progress * 0.8;
    cubeRotX += 0.02 + progress * 0.3;
  } else if (isRolling) {
    cubeRot += 0.15;
    cubeRotX += 0.06;
  } else if (isDecelerating) {
    const progress = (Date.now() - rollDecelStart) / rollDecelDuration;
    const speed = 0.15 * (1 - progress) + 0.02;
    cubeRot += speed;
    cubeRotX += speed * 0.4;
    rollGlow = 1 - progress;
  } else {
    cubeRot += 0.02;
    cubeRotX += 0.008;
  }

  // background drag inertia + soft bounds
  if (!bgDragging) {
    bgPanX += bgPanVX;
    bgPanY += bgPanVY;
    bgPanVX *= 0.93;
    bgPanVY *= 0.93;
    if (Math.abs(bgPanVX) < 0.0003) bgPanVX = 0;
    if (Math.abs(bgPanVY) < 0.0003) bgPanVY = 0;
  }
  bgPanX = Math.max(-0.7, Math.min(0.7, bgPanX));
  bgPanY = Math.max(-0.5, Math.min(0.5, bgPanY));

  // draw 3d cube in webgl + ambient backdrop
  let displayRarity = currentRarity;
  if (equippedRarity) {
    const rar = getCurrentRarities();
    const eq = rar.find(r => r.name === equippedRarity);
    if (eq) displayRarity = eq;
  }
  const col = getRarityColor(displayRarity, t);
  const glow = getRarityGlow(displayRarity, t);
  drawBackground(w, h, t, col, glow);
  drawGLCube(col, glow, t, rollGlow);
  // mutated ring: if current rarity has a mutated version, draw a ring
  if (mutatedInventory[currentRarity.name + ' (M)'] > 0) {
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.32;
    ctx.save();
    ctx.strokeStyle = rgbaOf('#ff00ff', 0.6);
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // spawn rolling particles
  if (isRolling && Math.random() < 0.3) {
    spawnParticles(3, currentRarity.color, currentRarity.glow);
  }

  // draw particles on 2d canvas
  ctx.clearRect(0, 0, w, h);

  if (shake > 0) {
    const s = shake;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    shake *= 0.92;
    if (shake < 0.3) shake = 0;
  }

  // orbital dust rings around the cube
  drawOrbit(w, h, t, col, glow, rollGlow);

  // floating background particles
  if (Math.random() < 0.4 && particles.length < MAX_PARTICLES) {
    particles.push({
      x: Math.random() * w,
      y: h + 5,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -1 - Math.random() * 2,
      life: 1,
      decay: 0.003 + Math.random() * 0.005,
      size: 1 + Math.random() * 2,
      color: currentRarity.color === 'rainbow' ? '#fff' : currentRarity.color === 'prism' ? '#fff' : currentRarity.color,
      glow: currentRarity.glow
    });
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= p.decay;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    const pc = getRarityColor({ color: p.color }, t);
    ctx.globalAlpha = p.life;
    ctx.fillStyle = pc;
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 8;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;

  if (shake > 0) ctx.restore();

  // time travel flicker
  if (isTimeTraveling) {
    const progress = (Date.now() - timeTravelStart) / timeTravelDuration;
    const flicker = Math.random() < 0.3 + progress * 0.5;
    chromatic.style.opacity = flicker ? 0.8 : 0;
    // flicker the roll text
    rollText.style.opacity = flicker ? 1 : 0.3;
  } else {
    chromatic.style.opacity = Math.max(0, chroma * 0.35);
    chroma *= 0.96;
    if (chroma < 0.01) chroma = 0;
  }

  // rendering driven by loop()
}

function updateUI() {
  const luck = getTotals();
  luckEl.textContent = formatNum(luck) + 'x';
  rollsEl.textContent = formatNum(rolls);
  creditsEl.textContent = formatNum(credits);
  const biome = biomes.find(b => b.name === currentBiome) || biomes[0];
  biomeEl.textContent = biome.name.toUpperCase();
  biomeEl.style.color = biome.color;
  if (streakStatEl) streakStatEl.textContent = rollStreak;
  if (collectionStatEl) collectionStatEl.textContent = Object.keys(ownedRarities).length + '/' + rarities.length;

  const speedBonus = getShopBonus().autoSpeed;
  autoInterval = 800 * Math.pow(0.9, speedBonus * 10); // each 0.10 = 10% faster = *0.9

  renderControls();
  renderShop();
  renderQuests();
  renderRarityTable(luck);
  renderInventory();
  checkSets();
  lastRollEl.innerHTML = `last roll: <strong style="color:${currentRarity.color === 'rainbow' ? '#fff' : currentRarity.color === 'prism' ? '#fff' : currentRarity.color}">${currentRarity.name}</strong>`;
  updatePrestigeUI();

  const rar = getCurrentRarities();
  const clampedIdx = Math.min(bestRarityIndex, Math.max(0, rar.length - 1));
  const best = rar[clampedIdx] || rar[0] || { name: '-', color: '#888' };
  bestRollStat.innerHTML = `<span style="color:${best.color === 'rainbow' ? '#fff' : best.color === 'prism' ? '#fff' : best.color}">${best.name}</span>`;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const pt = elapsed < 60 ? elapsed + 's' : elapsed < 3600 ? Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's' : Math.floor(elapsed / 3600) + 'h ' + Math.floor((elapsed % 3600) / 60) + 'm';
  playtimeStat.textContent = pt;
}

function renderRarityTable(luck) {
  const probs = getProbabilities();
  const rar = getCurrentRarities();
  rarityTable.innerHTML = '';
  if (rar.length === 0) { rarityTable.innerHTML = '<div style="color:var(--muted);font-size:11px;text-align:center;padding:20px">no rarities in this period.</div>'; return; }
  for (let i = rar.length - 1; i >= 0; i--) {
    const r = rar[i];
    const p = probs[i];
    let odds = r.odds;
    if (r.name === '???' && qMarkShowChance) odds = qMarkOdds;
    const isCraftOnly = !!r.craftOnly;
    const isLocked = r.name === 'RNG' && !rngUnlocked;
    const row = document.createElement('div');
    row.className = 'rarity-row';
    const isRemoved = unlocked.dustRemover && r.name === 'Dust';
    row.title = r.name + ' | odds: 1/' + formatNum(odds) + ' | luck: ' + formatNum(r.luck) + ' | particles: ' + r.particles;
    row.innerHTML = `
      <div style="display:flex;align-items:center;flex:1">
        <div class="dot" style="background:${r.color === 'rainbow' ? 'linear-gradient(45deg,#f0a,#0ff,#8f0)' : r.color === 'prism' ? 'conic-gradient(#f0a,#0ff,#8f0,#f0a)' : r.color2 ? 'linear-gradient(135deg,' + r.color + ',' + r.color2 + ')' : r.color}; color:${r.color};box-shadow:0 0 10px ${r.color === 'rainbow' || r.color === 'prism' ? r.glow : r.color};width:12px;height:12px">${r.name === 'RNG' ? '<svg viewBox="0 0 24 24" width="12" height="12"><rect x="2" y="2" width="20" height="20" rx="3" fill="#222" stroke="#fff" stroke-width="1.5"/><circle cx="7" cy="7" r="1.5" fill="#fff"/><circle cx="17" cy="7" r="1.5" fill="#fff"/><circle cx="12" cy="12" r="1.5" fill="#fff"/><circle cx="7" cy="17" r="1.5" fill="#fff"/><circle cx="17" cy="17" r="1.5" fill="#fff"/></svg>' : ''}</div>
        <span class="name ${r.name === 'End' ? 'distort-name' : ''} ${r.name === 'RNG' ? 'dice-name' : ''}" style="color:${r.name === 'End' ? '#fff' : (r.color === 'rainbow' || r.color === 'prism' ? r.glow : r.color2 ? r.color2 : r.color)};text-shadow:0 0 6px ${r.name === 'End' ? '#fff' : (r.color === 'rainbow' || r.color === 'prism' ? r.glow : r.color)};${r.color2 && r.color !== 'rainbow' && r.color !== 'prism' && r.name !== 'End' ? 'background:linear-gradient(90deg,' + r.color + ',' + r.color2 + ');-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text' : ''};${r.name === '???' && !qMarkShowChance ? 'filter:blur(6px);user-select:none' : ''}">${r.name === '???' && !qMarkShowChance ? '███████' : r.name}</span>
      </div>
      <span class="odds">${isRemoved ? 'REMOVED' : isLocked ? 'LOCKED' : isCraftOnly ? 'CRAFT ONLY' : '1/' + formatNum(odds)}</span>
    `;
    rarityTable.appendChild(row);
  }
}

function renderInventory() {
  inventoryEl.innerHTML = '';
  const inv = getCurrentInventory();
  const keys = Object.keys(inv).filter(k => inv[k] > 0);
  // also include mutated entries for this period's rarities
  for (const mk of Object.keys(mutatedInventory)) {
    if (mutatedInventory[mk] > 0 && !keys.includes(mk)) keys.push(mk);
  }
  if (keys.length === 0) {
    inventoryEl.innerHTML = '<div style="color:var(--muted);font-size:11px;text-align:center;padding-top:20px">no auras yet. roll.</div>';
    return;
  }
  const allRar = [].concat(rarities, pastRarities, futureRarities);
  const findR = (name) => {
    const base = name.replace(' (BT)', '').replace(' (M)', '').replace(' (R)', '').replace(' (E)', '');
    return allRar.find(x => x.name === base);
  };
  for (const key of keys) {
    const r = findR(key);
    const count = (key.indexOf(' (M)') >= 0) ? (mutatedInventory[key] || 0) : inv[key];
    const item = document.createElement('div');
    item.className = 'inv-item';
    item.style.flexDirection = 'column';
    item.style.alignItems = 'flex-start';
    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.gap = '10px';
    topRow.style.width = '100%';
    const iconEl = document.createElement('div');
    iconEl.className = 'icon';
    const col = r ? (r.color === 'rainbow' ? '#fff' : r.color === 'prism' ? '#fff' : r.color) : '#888';
    iconEl.style.background = r ? (r.color === 'rainbow' ? 'linear-gradient(45deg,#f0a,#0ff,#8f0)' : r.color === 'prism' ? 'conic-gradient(#f0a,#0ff,#8f0,#f0a)' : r.color2 ? 'linear-gradient(135deg,' + r.color + ',' + r.color2 + ')' : r.color) : '#444';
    iconEl.style.color = col;
    topRow.appendChild(iconEl);
    const infoEl = document.createElement('div');
    infoEl.className = 'info';
    infoEl.style.flex = '1';
    infoEl.style.minWidth = '0';
    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.style.color = col;
    nameEl.textContent = key;
    const countEl = document.createElement('div');
    countEl.className = 'count';
    countEl.textContent = 'x' + formatNum(count);
    infoEl.appendChild(nameEl);
    infoEl.appendChild(countEl);
    topRow.appendChild(infoEl);
    const bonusEl = document.createElement('div');
    bonusEl.className = 'bonus';
    bonusEl.textContent = 'x' + formatNum(count);
    topRow.appendChild(bonusEl);
    item.appendChild(topRow);
    const equipBtn = document.createElement('button');
    equipBtn.textContent = equippedRarity === key.replace(' (M)','').replace(' (BT)','') ? 'EQUIPPED' : 'EQUIP';
    equipBtn.style.fontSize = '9px';
    equipBtn.style.padding = '2px 6px';
    equipBtn.style.marginTop = '4px';
    equipBtn.style.marginRight = '4px';
    equipBtn.style.alignSelf = 'flex-start';
    equipBtn.addEventListener('click', () => {
      const base = key.replace(' (M)','').replace(' (BT)','');
      equippedRarity = (equippedRarity === base) ? null : base;
      saveGame();
      updateUI();
      showToast(equippedRarity ? 'equipped ' + equippedRarity : 'unequipped');
    });
    item.appendChild(equipBtn);
    const sellBtn = document.createElement('button');
    sellBtn.textContent = 'SELL 1 (' + formatNum(r ? sellPrice(r) : 1) + ' CR)';
    sellBtn.style.fontSize = '9px';
    sellBtn.style.padding = '2px 6px';
    sellBtn.style.marginTop = '4px';
    sellBtn.style.alignSelf = 'flex-start';
    sellBtn.addEventListener('click', () => {
      const isMut = key.indexOf(' (M)') >= 0;
      const store = isMut ? mutatedInventory : inv;
      if ((store[key] || 0) <= 0) return;
      // confirmation for rarities above Perplexity
      const baseName = key.replace(' (M)','').replace(' (BT)','').replace(' (R)','').replace(' (E)','');
      const rar = getCurrentRarities();
      const perpIdx = rar.findIndex(x => x.name === 'Perplexity');
      const itemIdx = rar.findIndex(x => x.name === baseName);
      if (perpIdx >= 0 && itemIdx > perpIdx) {
        if (!confirm('are you sure you want to sell ' + key + '? this is a high-tier rarity.')) return;
      }
      store[key] = (store[key] || 0) - 1;
      credits += r ? sellPrice(r) : 1;
      updateUI();
      saveGame();
      showToast('sold 1 ' + key);
    });
    item.appendChild(sellBtn);
    inventoryEl.appendChild(item);
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  glCanvas.width = rect.width * dpr;
  glCanvas.height = rect.height * dpr;
  glCanvas.style.width = rect.width + 'px';
  glCanvas.style.height = rect.height + 'px';
  if (gl) gl.viewport(0, 0, glCanvas.width, glCanvas.height);
}

function setMultiplier(n) {
  if (autoRoll && n > 1) return;
  const key = n === 1 ? null : (n === 10 ? 'x10' : 'x100');
  if (key && !unlocked[key]) return;
  multiplier = n;
  renderControls();
}

function toggleAuto() {
  if (!unlocked.auto) return;
  autoRoll = !autoRoll;
  if (autoRoll) {
    multiplier = 1;
  }
  document.getElementById('autoBtn').classList.toggle('active', autoRoll);
  renderControls();
}

function renderControls() {
  const autoBtn = document.getElementById('autoBtn');
  autoBtn.classList.toggle('active', autoRoll);
  autoBtn.classList.toggle('locked', !unlocked.auto);
  autoBtn.textContent = unlocked.auto ? 'AUTO' : 'AUTO 100';

  document.querySelectorAll('#controls button[data-mult]').forEach(b => {
    const n = parseInt(b.dataset.mult);
    const key = n === 10 ? 'x10' : 'x100';
    const own = n === 1 || unlocked[key];
    const lockedByAuto = autoRoll && n > 1;
    b.classList.toggle('active', multiplier === n);
    b.classList.toggle('locked', !own || lockedByAuto);
    b.textContent = own ? 'x' + n : 'x' + n + ' ' + upgrades.find(u => u.id === key).cost;
    b.disabled = lockedByAuto;
  });
}

/* ── shopkeeper dialogue ─────────────────────────────────────────────── */
let shopkeeperTimer = null;
let shopkeeperMet = false;

const shopkeeperBuyLines = {
  auto: 'auto roll. now you can watch the cube suffer hands-free.',
  x10: 'ten at a time. pace yourself, champ.',
  x100: 'a hundred rolls. i hope you brought a bucket.',
  luckBracelet: 'luck bracelet. it jingles when the odds bend.',
  luckyGloves: "lucky gloves. don't touch the cube with them, it gets ideas.",
  fortuneTalisman: 'fortune talisman. no refunds if fate disagrees.',
  creditsBracelet: 'credits bracelet. money that follows you around.',
  autoSpeed: 'faster. the cube is getting dizzy.',
  mutationCharm: 'mutation charm. the weird cubes love you now.',
  timeMachine: "the time machine. don't ask where i got it. seriously."
};

const shopkeeperSmallTalk = [
  'credits are good here. so is repeat business.',
  'the cube is not for sale. stop asking.',
  'everything on the shelf is real. probably.',
  'i price by vibes, but the vibes are final.',
  'you look like someone who rolls too much. respect.'
];

const shopkeeperDeclines = [
  "short on credits. that's a you problem, not a me problem.",
  "the shelf doesn't do charity.",
  "come back when your wallet's heavier.",
  "nice try. credits first, dreams second."
];

function shopkeeperSay(msg) {
  if (!shopkeeperText) return;
  clearTimeout(shopkeeperTimer);
  shopkeeperText.style.transition = 'opacity 0.12s ease';
  shopkeeperText.style.opacity = '0';
  if (shopkeeperSvg) {
    shopkeeperSvg.classList.remove('talk');
    void shopkeeperSvg.offsetWidth;
    shopkeeperSvg.classList.add('talk');
  }
  shopkeeperTimer = setTimeout(() => {
    shopkeeperText.textContent = msg;
    shopkeeperText.style.opacity = '1';
  }, 120);
}

function shopkeeperGreeting() {
  if (!shopkeeperMet) {
    shopkeeperMet = true;
    return 'welcome in. credits are good here. so is repeat business.';
  }
  if (prestigePoints > 0 && Math.random() < 0.5) {
    return 'back again. the prestige smell never washes out.';
  }
  const affordable = upgrades.filter(u => {
    const own = u.type === 'unlock' && unlocked[u.id];
    const cnt = shopCounts[u.id] || 0;
    const maxed = u.type !== 'unlock' && cnt >= u.max;
    return !own && !maxed && credits >= u.cost;
  }).length;
  if (credits < 100) return "that's a light purse. roll more, the shelf isn't free.";
  if (affordable >= 3) return 'big spender energy today. i like it.';
  if (affordable === 0) return "you can't afford anything. still nice to see you.";
  return shopkeeperSmallTalk[Math.floor(Math.random() * shopkeeperSmallTalk.length)];
}

function openShop() {
  shopModal.classList.add('open');
  renderShop();
  shopkeeperSay(shopkeeperGreeting());
}

function closeShop() {
  shopModal.classList.remove('open');
}

function buyUpgrade(id) {
  const up = upgrades.find(u => u.id === id);
  if (up.type === 'unlock') {
    const cost = shopCost(up, 0);
    if (unlocked[id] || credits < cost) return false;
    credits -= cost;
    unlocked[id] = true;
    if (id === 'auto') autoRoll = true;
    if (id === 'timeMachine') {
      document.getElementById('timeMachineUI').style.display = 'block';
      updatePeriodUI();
    }
    if (id === 'qmark') {
      qMarkChangeInterval += 10;
      qMarkShowChance = true;
    }
  } else if (up.type === 'exp') {
    const count = shopCounts[id] || 0;
    const cost = shopCost(up, count);
    if (count >= up.max || credits < cost) return false;
    credits -= cost;
    shopCounts[id] = count + 1;
  } else {
    const count = shopCounts[id] || 0;
    const cost = shopCost(up, count);
    if (count >= up.max || credits < cost) return false;
    if (up.dustCost) {
      const inv = getCurrentInventory();
      if ((inv['Dust'] || 0) < up.dustCost) { showToast('need ' + up.dustCost + ' dust'); return false; }
      inv['Dust'] -= up.dustCost;
      setCurrentInventory(inv);
    }
    credits -= cost;
    shopCounts[id] = count + 1;
  }
  renderControls();
  renderShop();
  updateUI();
  saveGame();
  playPurchaseSound();
  const line = shopkeeperBuyLines[id] || 'good buy. no refunds.';
  shopkeeperSay(Math.random() < 0.25 ? line + ' pleasure doing business.' : line);
  return true;
}

function refundUpgrade(id) {
  const up = upgrades.find(u => u.id === id);
  if (!up) return false;
  if (up.type === 'unlock') {
    if (!unlocked[id]) return false;
    // refund cost
    const cost = shopCost(up, 0);
    credits += cost;
    unlocked[id] = false;
    if (id === 'auto') autoRoll = false;
    if (id === 'timeMachine') {
      document.getElementById('timeMachineUI').style.display = 'none';
      updatePeriodUI();
    }
    if (id === 'dustRemover') {
      // re-enable dust in pool (already handled by unlocked flag)
    }
    if (id === 'qmark') {
      qMarkChangeInterval = Math.max(20, qMarkChangeInterval - 10);
      qMarkShowChance = false;
    }
  } else {
    const count = shopCounts[id] || 0;
    if (count <= 0) return false;
    const cost = shopCost(up, count - 1);
    credits += cost;
    shopCounts[id] = count - 1;
    // refund dust if applicable
    if (up.dustCost) {
      const inv = getCurrentInventory();
      inv['Dust'] = (inv['Dust'] || 0) + up.dustCost;
      setCurrentInventory(inv);
    }
  }
  renderControls();
  renderShop();
  updateUI();
  saveGame();
  showToast('refunded ' + up.name);
  return true;
}

function getPrestigeGain() {
  const rar = getCurrentRarities();
  const idx = bestRarityIndex;
  let gain = Math.max(0, Math.floor(Math.log10(credits + 1)) - 2);
  if (idx >= 10) gain += Math.floor((idx - 10) / 5);
  return gain;
}

function prestige() {
  const gain = getPrestigeGain();
  if (gain <= 0) { showToast('not ready to rebirth yet — earn more credits'); return; }
  if (!confirm('rebirth? you will lose credits, rolls, inventory, and shop upgrades, but gain ' + gain + ' prestige points')) return;
  prestigePoints += gain;
  prestigeCount++;
  // prestige milestones
  if (prestigeCount === 5) { baseLuck += 50; showToast('prestige milestone: 5 rebirths! +50 luck'); }
  if (prestigeCount === 10) { baseLuck += 200; showToast('prestige milestone: 10 rebirths! +200 luck'); }
  if (prestigeCount === 25) { baseLuck += 1000; showToast('prestige milestone: 25 rebirths! +1000 luck'); }
  lifetimeRolls += rolls;
  lifetimeCredits += credits;
  // reset
  credits = 0;
  rolls = 0;
  baseLuck = 1;
  inventory = {};
  pastInventory = {};
  futureInventory = {};
  mutatedInventory = {};
  shopCounts = { luckBracelet: 0, luckyGloves: 0, fortuneTalisman: 0, creditsBracelet: 0, autoSpeed: 0, mutationCharm: 0, luckAmplifier: 0, creditsAmplifier: 0 };
  unlocked = { auto: false, x10: true, x100: true };
  autoRoll = false;
  bestRarityIndex = 0;
  ownedRarities = {};
  collectionRewardClaimed = false;
  pityCounter = 0;
  rollStreak = 0;
  streakBonusMult = 1;
  streakBonusUntil = 0;
  autoSellThreshold = -1;
  updateFlashBtn();
  qMarkOdds = 1.6e17;
  qMarkRollCounter = 0;
  qMarkChangeInterval = 20;
  qMarkShowChance = false;
  equippedRarity = null;
  fusionCount = 0;
  autoFuse = false;
  updateAutoFuseBtn();
  autoEquipBest = false;
  updateAutoEquipBtn();
  setsClaimed = {};
  rngUnlocked = false;
  questClaimed = {};
  taskProgress = {};
  currentRarity = rarities[0];
  timePeriod = 'present';
  // reset time period visuals
  document.documentElement.style.setProperty('--cyan', '#2bd0d0');
  document.documentElement.style.setProperty('--cyan-bright', '#5ad0ff');
  document.documentElement.style.setProperty('--border', 'rgba(43, 208, 208, 0.35)');
  const tmUI = document.getElementById('timeMachineUI');
  if (tmUI) tmUI.style.display = 'none';
  saveGame();
  updateUI();
  updatePrestigeUI();
  showToast('rebirth #' + prestigeCount + ' complete! +' + gain + ' prestige');
}

function transcend() {
  if (prestigeCount < 3) { showToast('need 3+ rebirths to transcend'); return; }
  if (transcendencePoints >= 10) { showToast('max transcendence reached'); return; }
  if (!confirm('transcend? resets everything (including prestige) but grants a permanent +50% luck multiplier')) return;
  transcendencePoints++;
  transcendenceCount++;
  lifetimeRolls += rolls;
  lifetimeCredits += credits;
  // full reset including prestige
  prestigePoints = 0;
  prestigeCount = 0;
  credits = 0;
  rolls = 0;
  baseLuck = 1;
  inventory = {};
  pastInventory = {};
  futureInventory = {};
  mutatedInventory = {};
  shopCounts = { luckBracelet: 0, luckyGloves: 0, fortuneTalisman: 0, creditsBracelet: 0, autoSpeed: 0, mutationCharm: 0, luckAmplifier: 0, creditsAmplifier: 0 };
  unlocked = { auto: false, x10: true, x100: true };
  autoRoll = false;
  bestRarityIndex = 0;
  ownedRarities = {};
  collectionRewardClaimed = false;
  pityCounter = 0;
  rollStreak = 0;
  streakBonusMult = 1;
  streakBonusUntil = 0;
  autoSellThreshold = -1;
  updateFlashBtn();
  qMarkOdds = 1.6e17;
  qMarkRollCounter = 0;
  qMarkChangeInterval = 20;
  qMarkShowChance = false;
  equippedRarity = null;
  fusionCount = 0;
  autoFuse = false;
  updateAutoFuseBtn();
  autoEquipBest = false;
  updateAutoEquipBtn();
  setsClaimed = {};
  rngUnlocked = false;
  questClaimed = {};
  taskProgress = {};
  currentRarity = rarities[0];
  timePeriod = 'present';
  document.documentElement.style.setProperty('--cyan', '#2bd0d0');
  document.documentElement.style.setProperty('--cyan-bright', '#5ad0ff');
  document.documentElement.style.setProperty('--border', 'rgba(43, 208, 208, 0.35)');
  const tmUI = document.getElementById('timeMachineUI');
  if (tmUI) tmUI.style.display = 'none';
  saveGame();
  updateUI();
  updatePrestigeUI();
  playTranscendSound();
  showToast('transcendence #' + transcendenceCount + ' — +50% luck forever');
}

function updatePrestigeUI() {
  const pp = document.getElementById('prestigePoints');
  const pc = document.getElementById('prestigeCount');
  const pg = document.getElementById('prestigeGain');
  if (pp) pp.textContent = formatNum(prestigePoints);
  if (pc) pc.textContent = prestigeCount;
  if (pg) pg.textContent = formatNum(getPrestigeGain());
}

const dailyChallengeTemplates = [
  { id: 'roll50', name: 'Roll 50 times', check: (p) => rolls >= 50, reward: 500 },
  { id: 'roll200', name: 'Roll 200 times', check: (p) => rolls >= 200, reward: 2000 },
  { id: 'earn1000', name: 'Earn 1000 credits', check: (p) => credits >= 1000, reward: 800 },
  { id: 'earn10000', name: 'Earn 10000 credits', check: (p) => credits >= 10000, reward: 5000 },
  { id: 'rare', name: 'Roll a Rare cube', check: (p) => (getCurrentInventory()['Rare'] || 0) > 0, reward: 300 },
  { id: 'legendary', name: 'Roll a Legendary cube', check: (p) => (getCurrentInventory()['Legendary'] || 0) > 0, reward: 2000 },
  { id: 'mythic', name: 'Roll a Mythic cube', check: (p) => (getCurrentInventory()['Mythic'] || 0) > 0, reward: 10000 },
  { id: 'mutated', name: 'Roll a mutated cube', check: (p) => Object.keys(mutatedInventory).length > 0, reward: 1500 },
  { id: 'breakthrough', name: 'Trigger a breakthrough', check: (p) => p.bt, reward: 1000 },
  { id: 'bonus', name: 'Trigger a bonus roll', check: (p) => p.bonus, reward: 500 },
  { id: 'fuse', name: 'Fuse 3 auras', check: (p) => fusionCount >= 1, reward: 1500 },
  { id: 'equip', name: 'Equip a rarity', check: (p) => equippedRarity !== null, reward: 300 },
  { id: 'transcend', name: 'Transcend', check: (p) => transcendenceCount >= 1, reward: 5000 },
  { id: 'prestige', name: 'Rebirth', check: (p) => prestigeCount >= 1, reward: 2000 },
  { id: 'fuse3', name: 'Fuse 3 times', check: (p) => fusionCount >= 3, reward: 2000 },
  { id: 'equip', name: 'Equip a rarity', check: (p) => equippedRarity !== null, reward: 500 },
  { id: 'dustReactor', name: 'Build a Dust Reactor', check: (p) => (shopCounts.dustReactor || 0) >= 1, reward: 3000 },
  { id: 'roll1000', name: 'Roll 1000 times', check: (p) => rolls >= 1000, reward: 5000 },
];

function getDailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDailyChallenges() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyChallengeDate === today && dailyChallenges.length > 0) return;
  dailyChallengeDate = today;
  dailyChallengeProgress = {};
  let seed = getDailySeed();
  const shuffled = [...dailyChallengeTemplates].sort(() => seededRandom(seed++) - 0.5);
  dailyChallenges = shuffled.slice(0, 3);
  for (const c of dailyChallenges) {
    dailyChallengeProgress[c.id] = { completed: false, claimed: false };
  }
}

function renderDaily() {
  generateDailyChallenges();
  dailyList.innerHTML = '';
  for (const c of dailyChallenges) {
    const prog = dailyChallengeProgress[c.id] || { completed: false, claimed: false };
    const done = prog.completed || c.check({});
    if (done && !prog.completed) {
      prog.completed = true;
      dailyChallengeProgress[c.id] = prog;
    }
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;justify-content:space-between;padding:8px;margin-bottom:6px;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05)';
    const btn = done && !prog.claimed
      ? '<button style="font-size:10px;padding:4px 8px" onclick="claimDaily(\'' + c.id + '\')">CLAIM</button>'
      : (prog.claimed ? '<span style="color:var(--muted);font-size:10px">CLAIMED</span>' : '');
    el.innerHTML = '<span style="color:var(--text)">' + c.name + '</span> <span style="color:var(--cyan-bright)">' + c.reward + ' CR</span> ' + btn;
    dailyList.appendChild(el);
  }
}

function claimDaily(id) {
  const c = dailyChallenges.find(x => x.id === id);
  if (!c) return;
  const prog = dailyChallengeProgress[id];
  if (!prog || !prog.completed || prog.claimed) return;
  credits += c.reward;
  prog.claimed = true;
  dailyChallengeProgress[id] = prog;
  saveGame();
  updateUI();
  showToast('claimed ' + c.reward + ' credits');
  renderDaily();
}

function doTaskAttempt(q) {
  // returns {success, rare} for this attempt
  let success = false, rare = false;
  if (q.task === 'dig' || q.task === 'digAny' || q.task === 'digRare') {
    success = Math.random() < 0.4;
    rare = Math.random() < 0.2;
  } else if (q.task === 'hack' || q.task === 'hackAny' || q.task === 'hackRare') {
    success = Math.random() < 0.4;
    rare = Math.random() < 0.2;
  }
  return { success, rare };
}

function startCardBattle() {
  const deck = timePeriod === 'past' ? pastDeck : futureDeck;
  // deal 3 random cards each
  const shuffled = deck.slice().sort(() => Math.random() - 0.5);
  cardBattle.playerHand = shuffled.slice(0, 3);
  cardBattle.npcHand = shuffled.slice(3, 6);
  cardBattle.pScore = 0;
  cardBattle.nScore = 0;
  cardBattle.round = 0;
  cardBattle.chosen = null;
  cardBattle.npcChosen = null;
  cardBattle.result = null;
  cardBattle.gameOver = false;
  cardBattle.active = true;
  renderQuests();
}

function playCard(idx) {
  if (!cardBattle.active || cardBattle.gameOver || cardBattle.chosen !== null) return;
  cardBattle.chosen = cardBattle.playerHand[idx];
  // npc picks random remaining
  const npcIdx = Math.floor(Math.random() * cardBattle.npcHand.length);
  cardBattle.npcChosen = cardBattle.npcHand[npcIdx];
  // remove chosen from hands
  cardBattle.playerHand.splice(idx, 1);
  cardBattle.npcHand.splice(npcIdx, 1);
  // compare
  const p = cardBattle.chosen, n = cardBattle.npcChosen;
  if (p.atk > n.atk) { cardBattle.pScore++; cardBattle.result = 'win'; }
  else if (p.atk < n.atk) { cardBattle.nScore++; cardBattle.result = 'lose'; }
  else { cardBattle.result = 'tie'; }
  cardBattle.round++;
  // check game over
  if (cardBattle.pScore >= 2 || cardBattle.nScore >= 2 || cardBattle.round >= 3) {
    cardBattle.gameOver = true;
    if (cardBattle.pScore > cardBattle.nScore) {
      // victory
      cardBattle.active = false;
      // update quest progress
      const qs = quests.filter(q => q.period === timePeriod);
      for (const q of qs) {
        if (!questClaimed[q.id]) {
          taskProgress[q.id] = (taskProgress[q.id] || 0) + 1;
        }
      }
      showToast('you won the duel!');
      objSay('quest');
    } else {
      showToast('you lost the duel.');
    }
  }
  renderQuests();
}

function renderQuests() {
  const board = document.getElementById('questBoard');
  if (!board) return;
  board.innerHTML = '';
  if (timePeriod === 'present') {
    board.innerHTML = '<div style="font-size:10px;color:var(--muted);text-align:center;padding:8px">travel to the past or future to play.</div>';
    return;
  }
  const npcName = timePeriod === 'past' ? 'Past Keeper' : 'Future Oracle';
  const npcLine = timePeriod === 'past'
    ? 'the desert remembers. duel me, and the past will reward you.'
    : 'the city hums. duel me, and the future will pay you.';
  const npcDiv = document.createElement('div');
  npcDiv.style.cssText = 'margin-bottom:10px;padding:8px;border:1px solid var(--border);border-radius:6px;background:rgba(255,255,255,0.03);font-size:11px;';
  npcDiv.innerHTML = '<strong style="color:var(--cyan)">' + npcName + ':</strong> <span style="color:var(--text)">' + npcLine + '</span>';
  board.appendChild(npcDiv);

  // quest progress + claim
  const qs = quests.filter(q => q.period === timePeriod);
  for (const q of qs) {
    const claimed = questClaimed[q.id];
    const prog = taskProgress[q.id] || 0;
    const done = prog >= q.target;
    const el = document.createElement('div');
    el.className = 'shop-item' + (claimed ? ' owned' : '');
    const rewardText = [];
    if (q.reward.credits) rewardText.push('+' + formatNum(q.reward.credits) + ' CR');
    if (q.reward.luck) rewardText.push('+' + formatNum(q.reward.luck) + ' luck');
    el.innerHTML = `
      <div class="info">
        <div class="name">${q.name}${claimed ? ' (DONE)' : ''}</div>
        <div class="desc">${q.desc}</div>
        <div class="desc" style="color:var(--muted);margin-top:2px">wins: ${Math.min(prog, q.target)}/${q.target}</div>
        <div class="desc" style="color:var(--cyan-bright);margin-top:2px">${rewardText.join(', ')}</div>
      </div>
      <button${claimed || !done ? ' class="locked"' : ''}>${claimed ? 'CLAIMED' : done ? 'CLAIM' : 'LOCKED'}</button>
    `;
    if (!claimed && done) {
      el.querySelector('button').addEventListener('click', () => {
        questClaimed[q.id] = true;
        credits += q.reward.credits || 0;
        baseLuck += q.reward.luck || 0;
        showToast('quest complete: ' + q.name);
        objSay('quest');
        updateUI();
        renderQuests();
        saveGame();
      });
    }
    board.appendChild(el);
  }

  // card battle UI
  const battleDiv = document.createElement('div');
  battleDiv.style.cssText = 'margin-top:12px;padding:10px;border:1px solid var(--border);border-radius:6px;background:rgba(255,255,255,0.03);';
  if (!cardBattle.active && !cardBattle.gameOver) {
    battleDiv.innerHTML = '<div style="text-align:center"><button id="startBattleBtn">START DUEL</button></div>';
    board.appendChild(battleDiv);
    const btn = battleDiv.querySelector('#startBattleBtn');
    if (btn) btn.addEventListener('click', () => { startCardBattle(); });
  } else {
    // show scores
    let html = '<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px"><span>you: ' + cardBattle.pScore + '</span><span>' + npcName + ': ' + cardBattle.nScore + '</span></div>';
    if (cardBattle.gameOver) {
      html += '<div style="text-align:center;margin-bottom:8px;color:var(--cyan-bright)">' + (cardBattle.pScore > cardBattle.nScore ? 'VICTORY!' : 'DEFEAT') + '</div>';
      html += '<div style="text-align:center"><button id="startBattleBtn">PLAY AGAIN</button></div>';
    } else {
      // show chosen cards result if round just played
      if (cardBattle.result) {
        html += '<div style="text-align:center;margin-bottom:8px;font-size:11px">you played ' + cardBattle.chosen.name + ' (' + cardBattle.chosen.atk + ') vs ' + cardBattle.npcChosen.name + ' (' + cardBattle.npcChosen.atk + ') - ' + cardBattle.result + '</div>';
      }
      html += '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">';
      for (let i = 0; i < cardBattle.playerHand.length; i++) {
        const c = cardBattle.playerHand[i];
        html += '<button class="cardBtn" data-idx="' + i + '" style="padding:6px 10px;font-size:10px">' + c.name + '<br>ATK ' + c.atk + ' DEF ' + c.def + '</button>';
      }
      html += '</div>';
    }
    battleDiv.innerHTML = html;
    board.appendChild(battleDiv);
    const startBtn = battleDiv.querySelector('#startBattleBtn');
    if (startBtn) startBtn.addEventListener('click', () => { startCardBattle(); });
    const cardBtns = battleDiv.querySelectorAll('.cardBtn');
    cardBtns.forEach(b => {
      b.addEventListener('click', () => { playCard(parseInt(b.dataset.idx)); });
    });
  }
}

function claimQuest(id) { /* handled inline */ }

function shopCost(up, count) {
  let base;
  if (up.type === 'exp') base = Math.round(up.baseCost * Math.pow(up.costMult, count));
  else base = up.cost;
  const discount = Math.min(0.5, prestigePoints * 0.005);
  return Math.max(1, Math.round(base * (1 - discount)));
}
function renderShop() {
  shopCredits.textContent = formatNum(credits);
  shopItems.innerHTML = '';
  for (const up of upgrades) {
    if (up.requires === 'aboveEternity') {
      const rar = getCurrentRarities();
      const etIdx = rar.findIndex(r => r.name === 'Eternity');
      const aboveNames = etIdx >= 0 ? rar.slice(etIdx + 1).map(r => r.name) : [];
      const hasAbove = Object.keys(ownedRarities).some(n => aboveNames.indexOf(n) >= 0);
      if (!hasAbove) continue;
    }
    const isUnlock = up.type === 'unlock';
    const isExp = up.type === 'exp';
    const owned = isUnlock && unlocked[up.id];
    const count = shopCounts[up.id] || 0;
    const maxed = (isUnlock && owned) ? false : (!isUnlock && count >= up.max);
    const cost = shopCost(up, count);
    const canBuy = credits >= cost && !owned && !maxed;
    const item = document.createElement('div');
    item.className = 'shop-item' + ((owned || maxed) ? ' owned' : '');
    const countText = (isUnlock || isExp) ? (isExp ? ' (lv' + count + ')' : '') : ` (${count}/${up.max})`;
    const btnClass = canBuy ? '' : ' class="locked"';
    const btnLabel = owned ? 'OWNED' : maxed ? 'MAXED' : cost + ' CR';
    item.innerHTML = `
      <div class="info">
        <div class="name">${up.name}${countText}</div>
        <div class="desc">${up.desc}</div>
      </div>
      <button${btnClass}>${btnLabel}</button>
    `;
    if (!owned && !maxed) {
      item.querySelector('button').addEventListener('click', () => {
        const nowCanBuy = credits >= cost && !owned && !maxed;
        if (!nowCanBuy) {
          shopkeeperSay(shopkeeperDeclines[Math.floor(Math.random() * shopkeeperDeclines.length)]);
          return;
        }
        buyUpgrade(up.id);
      });
    }
    // refund button for owned/maxed items
    const canRefund = (isUnlock && owned) || (!isUnlock && count > 0);
    if (canRefund) {
      const refBtn = document.createElement('button');
      refBtn.textContent = 'REFUND';
      refBtn.style.fontSize = '9px';
      refBtn.style.padding = '2px 6px';
      refBtn.style.marginLeft = '6px';
      refBtn.style.borderColor = 'rgba(255,60,120,0.45)';
      refBtn.style.color = '#ff9ecd';
      refBtn.addEventListener('click', () => {
        refundUpgrade(up.id);
      });
      item.querySelector('button').parentElement.appendChild(refBtn);
    }
    shopItems.appendChild(item);
  }
}

function renderAchievements() {
  achievementsList.innerHTML = '';
  for (const a of achievements) {
    const own = achievementsUnlocked[a.id];
    const el = document.createElement('div');
    el.className = 'achievement' + (own ? ' unlocked' : '');
    const rwd = a.reward.luck ? '+' + formatNum(a.reward.luck) + ' luck' : '';
    el.innerHTML = `
      <div class="icon">${own ? '★' : '☆'}</div>
      <div class="info">
        <div class="name">${a.name}</div>
        <div class="desc">${a.desc}</div>
      </div>
      <div class="reward">${rwd}</div>
    `;
    achievementsList.appendChild(el);
  }
}

function renderChangelog() {
  changelogList.innerHTML = '';
  for (const c of changelog) {
    const el = document.createElement('div');
    el.className = 'changelog-item';
    el.innerHTML = `<div class="version">${c.version}</div><div class="note">${c.note}</div>`;
    changelogList.appendChild(el);
  }
}

function openModal(modal) { modal.classList.add('open'); }
function closeModal(modal) { modal.classList.remove('open'); }

canvas.addEventListener('pointerdown', e => {
  bgDragging = true;
  bgDragMoved = false;
  bgDragLastX = e.clientX;
  bgDragLastY = e.clientY;
  bgPanVX = 0;
  bgPanVY = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
});

canvas.addEventListener('pointermove', e => {
  if (!bgDragging) return;
  const rect = canvas.getBoundingClientRect();
  const dx = e.clientX - bgDragLastX;
  const dy = e.clientY - bgDragLastY;
  bgDragLastX = e.clientX;
  bgDragLastY = e.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 2) bgDragMoved = true;
  bgPanX += (dx / Math.max(1, rect.width)) * 1.4;
  bgPanY += (dy / Math.max(1, rect.height)) * 1.4;
  bgPanVX = (dx / Math.max(1, rect.width)) * 0.9;
  bgPanVY = (dy / Math.max(1, rect.height)) * 0.9;
});

function endBgDrag(e) {
  if (!bgDragging) return;
  bgDragging = false;
  if (bgDragMoved) suppressRollClick = true;
  try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
}

canvas.addEventListener('pointerup', endBgDrag);
canvas.addEventListener('pointercancel', endBgDrag);
canvas.addEventListener('dblclick', () => {
  bgPanX = 0;
  bgPanY = 0;
  bgPanVX = 0;
  bgPanVY = 0;
});

canvas.addEventListener('click', () => {
  if (suppressRollClick) {
    suppressRollClick = false;
    return;
  }
  manualRoll();
});
window.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    manualRoll();
  }
});
window.addEventListener('resize', resize);

function applySceneResize() {
  const sc = document.getElementById('sceneCanvas');
  if (sc && sc.style.display !== 'none') {
    sc.width = window.innerWidth;
    sc.height = window.innerHeight;
  }
}
window.addEventListener('resize', applySceneResize);

document.getElementById('rollBtn').addEventListener('click', () => manualRoll());

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); manualRoll(); }
  else if (e.key === 's' || e.key === 'S') { openShop(); updatePrestigeUI(); }
  else if (e.key === 'a' || e.key === 'A') { toggleAuto(); }
  else if (e.key === 'Escape') {
    // close any open modal
    document.querySelectorAll('.modal.open').forEach(m => closeModal(m));
  }
});
document.getElementById('autoBtn').addEventListener('click', toggleAuto);
document.querySelectorAll('#controls button[data-mult]').forEach(b => {
  b.addEventListener('click', () => setMultiplier(parseInt(b.dataset.mult)));
});
shopBtn.addEventListener('click', () => { openShop(); updatePrestigeUI(); });
document.getElementById('prestigeBtn').addEventListener('click', prestige);
document.getElementById('transcendBtn').addEventListener('click', transcend);
shopClose.addEventListener('click', () => closeModal(shopModal));
shopModal.addEventListener('click', e => { if (e.target === shopModal) closeModal(shopModal); });

achievementsBtn.addEventListener('click', () => { openModal(achievementsModal); renderAchievements(); });
achievementsClose.addEventListener('click', () => closeModal(achievementsModal));
achievementsModal.addEventListener('click', e => { if (e.target === achievementsModal) closeModal(achievementsModal); });

changelogBtn.addEventListener('click', () => { openModal(changelogModal); renderChangelog(); });
changelogClose.addEventListener('click', () => closeModal(changelogModal));
changelogModal.addEventListener('click', e => { if (e.target === changelogModal) closeModal(changelogModal); });
resetSaveBtn.addEventListener('click', resetSave);

// admin panel
const adminModal = document.getElementById('adminModal');
const adminAuth = document.getElementById('adminAuth');
const adminControls = document.getElementById('adminControls');
const adminStatus = document.getElementById('adminStatus');
const adminLog = document.getElementById('adminLog');
const adminPass = document.getElementById('adminPass');

function adminLogMsg(msg) {
  const el = document.createElement('div');
  el.textContent = '> ' + msg;
  adminLog.appendChild(el);
  adminLog.scrollTop = adminLog.scrollHeight;
}

document.getElementById('adminAuthBtn').addEventListener('click', () => {
  const attempt = adminPass.value;
  if (attempt === 'luxadmin') {
    isAdmin = true;
    adminAuth.style.display = 'none';
    adminControls.style.display = 'block';
    adminStatus.textContent = 'status: admin';
    adminStatus.style.color = '#5ad0ff';
    adminLogMsg('access granted');
    localStorage.setItem('luxRngAdmin', '1');
  } else {
    adminLogMsg('access denied');
  }
});

document.getElementById('adminGiveCredits').addEventListener('click', () => {
  credits = Infinity;
  updateUI();
  adminLogMsg('gave infinite credits');
  saveGame();
});

document.getElementById('adminMaxLuck').addEventListener('click', () => {
  baseLuck = Infinity;
  updateUI();
  adminLogMsg('luck maxed (infinity)');
  saveGame();
});

document.getElementById('adminUnlockAll').addEventListener('click', () => {
  unlocked.auto = true;
  unlocked.x10 = true;
  unlocked.x100 = true;
  unlocked.timeMachine = true;
  unlocked.dustRemover = true;
  unlocked.qmark = true;
  qMarkChangeInterval += 10;
  qMarkShowChance = true;
  shopCounts.luckBracelet = 50;
  shopCounts.luckyGloves = 25;
  shopCounts.fortuneTalisman = 15;
  shopCounts.creditsBracelet = 10;
  shopCounts.autoSpeed = 10;
  shopCounts.mutationCharm = 5;
  shopCounts.luckAmplifier = 30;
  shopCounts.creditsAmplifier = 20;
  shopCounts.dustReactor = 20;
  document.getElementById('timeMachineUI').style.display = 'block';
  updatePeriodUI();
  updateUI();
  renderShop();
  adminLogMsg('all unlocked');
  saveGame();
});

document.getElementById('adminToggleAuto').addEventListener('click', () => {
  autoRoll = !autoRoll;
  document.getElementById('autoBtn').classList.toggle('active', autoRoll);
  adminLogMsg('auto: ' + autoRoll);
});

document.getElementById('adminResetSave').addEventListener('click', () => {
  if (!confirm('reset all progress?')) return;
  resetSave();
  adminLogMsg('save reset');
});

document.getElementById('adminClose').addEventListener('click', () => closeModal(adminModal));

// keybind: konami code to open admin panel
const konamiSeq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA'];
let konamiIdx = 0;
window.addEventListener('keydown', e => {
  if (e.code === konamiSeq[konamiIdx]) {
    konamiIdx++;
    if (konamiIdx === konamiSeq.length) {
      konamiIdx = 0;
      openModal(adminModal);
    }
  } else {
    konamiIdx = 0;
  }
});

// restore admin session
if (localStorage.getItem('luxRngAdmin') === '1') {
  isAdmin = true;
  adminAuth.style.display = 'none';
  adminControls.style.display = 'block';
  adminStatus.textContent = 'status: admin';
  adminStatus.style.color = '#5ad0ff';
}
document.getElementById('pastBtn').addEventListener('click', () => switchTimePeriod('past'));
document.getElementById('presentBtn').addEventListener('click', () => switchTimePeriod('present'));
document.getElementById('futureBtn').addEventListener('click', () => switchTimePeriod('future'));

leaderboardBtn.addEventListener('click', () => { openModal(leaderboardModal); fetchLeaderboard(); });
leaderboardClose.addEventListener('click', () => closeModal(leaderboardModal));
leaderboardModal.addEventListener('click', e => { if (e.target === leaderboardModal) closeModal(leaderboardModal); });
dailyBtn.addEventListener('click', () => { openModal(dailyModal); renderDaily(); });
dailyClose.addEventListener('click', () => closeModal(dailyModal));

function autoFuseAll() {
  if (!autoFuse) return;
  const inv = getCurrentInventory();
  const rar = getCurrentRarities();
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of Object.keys(inv)) {
      if (inv[key] >= 2 && !key.includes(' (M)') && !key.includes(' (BT)') && !key.includes(' (E)')) {
        const r = rar.find(x => x.name === key);
        const idx = r ? rar.indexOf(r) : -1;
        if (idx < 0 || idx >= rar.length - 1) continue;
        let next = null;
        if (key === 'Tabula') next = 'Core';
        else if (key === 'Core') next = 'Nexus';
        else {
          const craftR = rar.find(x => x.craftOnly && rar.indexOf(x) > 0 && rar[rar.indexOf(x)-1].name === key);
          if (craftR) next = craftR.name;
          else next = rar[idx + 1].name;
        }
        if (next) {
          inv[key] -= 2;
          inv[next] = (inv[next] || 0) + 1;
          fusionCount++;
          changed = true;
        }
      }
    }
  }
  setCurrentInventory(inv);
}

function renderFuse() {
  if (!fuseList) return;
  fuseList.innerHTML = '';
  const inv = getCurrentInventory();
  const rar = getCurrentRarities();
  const palette = document.getElementById('fusePalette');
  const slots = document.getElementById('forgeSlots');
  const result = document.getElementById('forgeResult');
  const combineBtn = document.getElementById('forgeCombine');
  if (palette) palette.innerHTML = '';
  if (slots) slots.innerHTML = '';
  if (result) result.textContent = '';
  forgeItems = [];

  // populate palette with available rarities
  const keys = Object.keys(inv).filter(k => inv[k] > 0 && !k.includes(' (M)') && !k.includes(' (BT)'));
  for (const key of keys) {
    const chip = document.createElement('div');
    chip.textContent = key + ' x' + inv[key];
    chip.draggable = true;
    chip.dataset.name = key;
    chip.style.cssText = 'padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:rgba(255,255,255,0.05);cursor:grab;font-size:10px;color:var(--cyan-bright)';
    chip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', key); });
    chip.addEventListener('click', () => {
      if (forgeItems.length >= 2) return;
      if ((inv[key] || 0) <= forgeItems.filter(x=>x===key).length) { showToast('no more ' + key); return; }
      forgeItems.push(key);
      renderForgeSlots();
    });
    if (palette) palette.appendChild(chip);
  }

  const forge = document.getElementById('fuseForge');
  if (forge) {
    forge.ondragover = (e) => { e.preventDefault(); forge.style.borderColor = 'var(--cyan-bright)'; };
    forge.ondragleave = () => { forge.style.borderColor = 'var(--border)'; };
    forge.ondrop = (e) => {
      e.preventDefault();
      forge.style.borderColor = 'var(--border)';
      const name = e.dataTransfer.getData('text/plain');
      if (forgeItems.length >= 2) return;
      if ((inv[name] || 0) <= forgeItems.filter(x=>x===name).length) { showToast('no more ' + name); return; }
      forgeItems.push(name);
      renderForgeSlots();
    };
  }

  function renderForgeSlots() {
    if (!slots) return;
    slots.innerHTML = '';
    for (const name of forgeItems) {
      const slot = document.createElement('div');
      slot.textContent = name;
      slot.style.cssText = 'padding:2px 6px;border:1px solid var(--cyan);border-radius:3px;font-size:9px;color:var(--cyan-bright);background:rgba(43,208,208,0.1);cursor:pointer';
      slot.addEventListener('click', () => {
        const idx = forgeItems.indexOf(name);
        if (idx >= 0) forgeItems.splice(idx, 1);
        renderForgeSlots();
      });
      slots.appendChild(slot);
    }
    if (result) {
      if (forgeItems.length === 2) {
        const r = getFuseResult(forgeItems, inv, rar);
        result.textContent = r ? '-> ' + r : 'no recipe';
      } else {
        result.textContent = '';
      }
    }
  }

  if (combineBtn) {
    combineBtn.onclick = () => {
      if (forgeItems.length < 2) { showToast('need 2+ items in forge'); return; }
      const r = getFuseResult(forgeItems, inv, rar);
      if (!r) { showToast('no recipe for this combo'); return; }
      const counts = {};
      for (const it of forgeItems) counts[it] = (counts[it] || 0) + 1;
      let ok = true;
      for (const it in counts) { if ((inv[it] || 0) < counts[it]) { ok = false; break; } }
      if (!ok) { showToast('missing items'); return; }
      for (const it in counts) inv[it] -= counts[it];
      inv[r] = (inv[r] || 0) + 1;
      fusionCount++;
      setCurrentInventory(inv);
      // update best rarity index if crafted rarity is higher
      const rar = getCurrentRarities();
      const rIdx = rar.findIndex(x => x.name === r);
      if (rIdx >= 0 && rIdx > bestRarityIndex) { bestRarityIndex = rIdx; }
      playFusionSound();
      showToast('fused ' + forgeItems.join(' + ') + ' -> ' + r);
      forgeItems = [];
      renderForgeSlots();
      updateUI();
      saveGame();
      renderFuse();
    };
  }
  renderForgeSlots();

  // special: 2 End -> unlock RNG
  if ((inv['End']||0) >= 2 && !rngUnlocked) {
    const row = document.createElement('div');
    row.className = 'shop-item';
    row.innerHTML = '<div class="info"><div class="name">RNG Unlock</div><div class="desc">fuse 2 End to unlock RNG rarity</div></div>';
    const btn = document.createElement('button');
    btn.textContent = 'UNLOCK RNG';
    btn.addEventListener('click', () => {
      if ((inv['End']||0) < 2) { showToast('need 2 End'); return; }
      inv['End'] -= 2;
      rngUnlocked = true;
      setCurrentInventory(inv);
      playFusionSound();
      showToast('RNG rarity unlocked! 0.003% chance at max luck');
      updateUI();
      saveGame();
      renderFuse();
    });
    row.appendChild(btn);
    fuseList.appendChild(row);
  }
  // special: End recipe (2 Eternia + 2 Omnipotence + 2 Dust (R))
  if ((inv['Eternia']||0) >= 2 && (inv['Omnipotence']||0) >= 2 && (inv['Dust (R)']||0) >= 2) {
    const erow = document.createElement('div');
    erow.className = 'shop-item';
    erow.innerHTML = '<div class="info"><div class="name">End Recipe</div><div class="desc">2 Eternia + 2 Omnipotence + 2 Dust (R)</div></div>';
    const ebtn = document.createElement('button');
    ebtn.textContent = 'CRAFT END';
    ebtn.addEventListener('click', () => {
      if ((inv['Eternia']||0) < 2 || (inv['Omnipotence']||0) < 2 || (inv['Dust (R)']||0) < 2) { showToast('missing materials'); return; }
      inv['Eternia'] -= 2;
      inv['Omnipotence'] -= 2;
      inv['Dust (R)'] -= 2;
      inv['End'] = (inv['End'] || 0) + 1;
      fusionCount++;
      setCurrentInventory(inv);
      playFusionSound();
      showToast('crafted End');
      updateUI();
      saveGame();
      renderFuse();
    });
    erow.appendChild(ebtn);
    if (palette) palette.parentElement.insertBefore(erow, palette.parentElement.firstChild);
  }
  if (fuseList) {
    const hints = ['2x same rarity -> next tier (or special)', '3x same -> next tier (use 3 copies via click)'];
    for (let i = 0; i < rar.length; i++) {
      if (rar[i].craftOnly && i > 0) hints.push('2x ' + rar[i-1].name + ' -> ' + rar[i].name);
    }
    hints.push('2 Eternia + 2 Omnipotence + 2 Dust (R) -> End');
    const hintDiv = document.createElement('div');
    hintDiv.style.cssText = 'color:var(--muted);font-size:10px;padding:4px';
    hintDiv.textContent = 'recipes: ' + hints.join(' | ');
    fuseList.appendChild(hintDiv);
  }
}

// cross-rarity recipe table
function isCraftable(name) {
  const rar = getCurrentRarities();
  const li = rar.findIndex(r => r.name === 'Legendary');
  const idx = rar.findIndex(r => r.name === name);
  if (li < 0 || idx < 0) return true;
  return idx >= li;
}
const crossRecipes = [
  { items: ['Frosted', 'Epic', 'Celestial'], result: 'Legendary' },
  { items: ['Quantum', 'Ethereal'], result: 'Infinity' },
  { items: ['Cosmic', 'Nebula'], result: 'Multiverse' },
  { items: ['Dust (R)', 'Tabula'], result: '???' },
  { items: ['Mystic', 'Divine'], result: 'Nebula' },
  { items: ['Radiant', 'Ethereal'], result: 'Transcendent' },
  { items: ['Abyss', 'Eternal'], result: 'Quantum' },
];

function getFuseResult(items, inv, rar) {
  // check cross-rarity recipes first (exact match, any rarity allowed)
  for (const rec of crossRecipes) {
    if (rec.items.length !== items.length) continue;
    const sorted = items.slice().sort();
    const recSorted = rec.items.slice().sort();
    if (sorted.every((v, i) => v === recSorted[i])) return rec.result;
  }
  // 2-of-same -> next tier (or special)
  if (items.length === 2 && items[0] === items[1]) {
    const a = items[0];
    if (!isCraftable(a)) return null;
    const r = rar.find(x => x.name === a);
    const idx = r ? rar.indexOf(r) : -1;
    if (idx >= 0 && idx < rar.length - 1) {
      if (a === 'Tabula') return 'Core';
      if (a === 'Core') return 'Nexus';
      const craftR = rar.find(x => x.craftOnly && rar.indexOf(x) > 0 && rar[rar.indexOf(x)-1].name === a);
      if (craftR) return craftR.name;
      return rar[idx + 1].name;
    }
  }
  // 3-of-same -> next tier
  if (items.length === 3 && items[0] === items[1] && items[1] === items[2]) {
    const a = items[0];
    const r = rar.find(x => x.name === a);
    const idx = r ? rar.indexOf(r) : -1;
    if (idx >= 0 && idx < rar.length - 1) return rar[idx + 1].name;
  }
  return null;
}

document.getElementById('fuseClose').addEventListener('click', () => closeModal(fuseModal));

function renderEvents() {
  if (!eventsList) return;
  eventsList.innerHTML = '';
  const ev = getCurrentEvent();
  for (const e of gameEvents) {
    const row = document.createElement('div');
    row.className = 'shop-item' + (e.id === ev.id ? '' : ' owned');
    row.innerHTML = '<div class="info"><div class="name">' + e.name + (e.id === ev.id ? ' (ACTIVE)' : '') + '</div><div class="desc">' + e.desc + '</div></div>';
    eventsList.appendChild(row);
  }
  const note = document.createElement('div');
  note.style.cssText = 'color:var(--muted);font-size:10px;margin-top:8px';
  note.textContent = 'events rotate daily. active: ' + ev.name;
  eventsList.appendChild(note);
}

document.getElementById('eventsClose').addEventListener('click', () => closeModal(eventsModal));

function renderStats() {
  if (!statsList) return;
  statsList.innerHTML = '';
  const rar = getCurrentRarities();
  const best = rar[Math.min(bestRarityIndex, rar.length - 1)] || rar[0];
  const lines = [
    ['rolls', formatNum(rolls)],
    ['lifetime rolls', formatNum(lifetimeRolls + rolls)],
    ['credits', formatNum(credits)],
    ['lifetime credits', formatNum(lifetimeCredits + credits)],
    ['base luck', formatNum(baseLuck)],
    ['total luck', formatNum(getTotals())],
    ['best rarity', best ? best.name : '-'],
    ['prestige points', formatNum(prestigePoints)],
    ['prestige count', prestigeCount],
    ['transcendence', transcendenceCount],
    ['fusion count', fusionCount],
    ['owned rarities', Object.keys(ownedRarities).length + '/' + rarities.length],
    ['collection complete', collectionRewardClaimed ? 'yes' : 'no'],
    ['pity counter', pityCounter],
    ['roll streak', rollStreak],
    ['auto-sell', autoSellThreshold >= 0 ? 'below ' + (rar[autoSellThreshold] ? rar[autoSellThreshold].name : autoSellThreshold) : 'OFF'],
  ];
  for (const [k, v] of lines) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;padding:4px 6px;border-bottom:1px solid rgba(43,208,208,0.1)';
    row.innerHTML = '<span style="color:var(--muted)">' + k + '</span><strong style="color:var(--cyan-bright)">' + v + '</strong>';
    statsList.appendChild(row);
  }
}

document.getElementById('settingsStatsBtn').addEventListener('click', () => { closeModal(settingsModal); openModal(statsModal); renderStats(); });

function updateAutoFuseBtn() {
  const b = document.getElementById('settingsAutoFuseBtn');
  if (b) b.textContent = 'AUTO-FUSE: ' + (autoFuse ? 'ON' : 'OFF');
}
document.getElementById('settingsAutoFuseBtn').addEventListener('click', () => {
  autoFuse = !autoFuse;
  updateAutoFuseBtn();
  saveGame();
  showToast(autoFuse ? 'auto-fuse on' : 'auto-fuse off');
});

function updateAutoEquipBtn() {
  const b = document.getElementById('settingsAutoEquipBtn');
  if (b) b.textContent = 'AUTO-EQUIP BEST: ' + (autoEquipBest ? 'ON' : 'OFF');
}

function updateSlotBtns() {
  for (let i = 1; i <= 3; i++) {
    const b = document.getElementById('slot' + i + 'Btn');
    if (b) b.classList.toggle('active', currentSlot === i);
  }
}
for (let i = 1; i <= 3; i++) {
  document.getElementById('slot' + i + 'Btn').addEventListener('click', () => {
    if (currentSlot === i) return;
    saveGame();
    currentSlot = i;
    localStorage.setItem('luxRngSlot', String(i));
    location.reload();
  });
}
updateSlotBtns();
document.getElementById('settingsAutoEquipBtn').addEventListener('click', () => {
  autoEquipBest = !autoEquipBest;
  updateAutoEquipBtn();
  saveGame();
  showToast(autoEquipBest ? 'auto-equip on' : 'auto-equip off');
});
document.getElementById('statsClose').addEventListener('click', () => closeModal(statsModal));

function triggerCorruption(seed) {
  if (corrupted) return;
  seed = seed || '';
  // seeded PRNG based on clipboard content
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  let rngState = h || 1;
  function seededRandom() {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  }
  window.__corruptRng = seededRandom;
  corrupted = true;
  autoRoll = false;
  const co = document.getElementById('corruptOverlay');
  if (co) co.style.display = 'block';
  // block all interaction
  document.body.style.pointerEvents = 'none';
  co.style.pointerEvents = 'all';
  // stop original bgm
  try { bgmAudio.pause(); musicPlaying = false; if (musicBtn) musicBtn.textContent = '♪ OFF'; } catch (e) {}
  updateSettingsBtns();
  // play fearful harmony audio on loop (only sound in corruption)
  try {
    const fh = new Audio('https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/fearfulharmony.mp3');
    fh.loop = true;
    fh.volume = 0.6;
    fh.play().catch(() => {});
    window.__fhAudio = fh;
  } catch (e) {}
  // capture snapshots
  const canvases = [document.getElementById('cubeCanvasGL'), document.getElementById('cubeCanvas'), document.getElementById('bgCanvas')];
  const snapshots = [];
  for (const c of canvases) {
    try { snapshots.push(c.toDataURL('image/png')); } catch (e) {}
  }
  const inlineSvgs = Array.from(document.querySelectorAll('svg')).map(s => s.outerHTML);
  const smear = document.getElementById('corruptSmear');
  const src = snapshots.length ? snapshots[0] : null;
  // PROGRESSIVE corruption: start black, add more distortion over time
  let wave = 0;
  function addWave() {
    if (!corrupted) return;
    wave++;
    const intensity = Math.min(1, wave / 8);
    // hall of mirrors (grows with waves)
    const mirrorCount = Math.min(12, 2 + wave * 2);
    for (let i = 0; i < mirrorCount; i++) {
      const el = document.createElement('img');
      if (src) el.src = src;
      el.style.position = 'absolute';
      el.style.left = '50%';
      el.style.top = '50%';
      const scale = 1 - i * 0.06;
      el.style.width = (100 * scale) + '%';
      el.style.height = (100 * scale) + '%';
      el.style.transform = 'translate(-50%, -50%) scale(' + scale + ') rotate(' + (i * 7 + wave * 3) + 'deg)';
      el.style.opacity = (0.5 - i * 0.03) * intensity;
      el.style.filter = 'blur(' + (i * 0.6) + 'px) hue-rotate(' + (i * 30 + wave * 15) + 'deg) contrast(' + (1.1 + i * 0.1) + ')';
      el.style.mixBlendMode = 'screen';
      smear.appendChild(el);
    }
    // distorted copies
    const distCount = Math.min(20, 3 + wave * 3);
    for (let i = 0; i < distCount; i++) {
      const el = document.createElement('img');
      const s = snapshots.length ? snapshots[Math.floor(seededRandom() * snapshots.length)] : null;
      if (s) el.src = s;
      el.style.position = 'absolute';
      el.style.left = (seededRandom() * 90) + '%';
      el.style.top = (seededRandom() * 90) + '%';
      el.style.width = (20 + seededRandom() * 50) + '%';
      const sx = (seededRandom() < 0.5 ? -1 : 1) * (0.6 + seededRandom() * 1.8);
      const sy = (seededRandom() < 0.5 ? -1 : 1) * (0.6 + seededRandom() * 1.8);
      const skewX = (seededRandom() * 40 - 20) * intensity;
      const skewY = (seededRandom() * 40 - 20) * intensity;
      el.style.transform = 'scale(' + sx + ', ' + sy + ') skew(' + skewX + 'deg, ' + skewY + 'deg) rotate(' + (seededRandom() * 60 - 30) + 'deg)';
      el.style.opacity = (0.3 + seededRandom() * 0.5) * intensity;
      el.style.filter = 'blur(' + (seededRandom() * 8) + 'px) hue-rotate(' + (seededRandom() * 360) + 'deg) contrast(' + (0.5 + seededRandom() * 2) + ') brightness(' + (0.5 + seededRandom()) + ')';
      el.style.mixBlendMode = seededRandom() < 0.5 ? 'difference' : 'exclusion';
      smear.appendChild(el);
    }
    // distorted svgs
    const svgCount = Math.min(12, 2 + wave * 2);
    for (let i = 0; i < svgCount; i++) {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = (seededRandom() * 85) + '%';
      el.style.top = (seededRandom() * 85) + '%';
      const sx = (seededRandom() < 0.5 ? -1 : 1) * (1 + seededRandom() * 3);
      const sy = (seededRandom() < 0.5 ? -1 : 1) * (1 + seededRandom() * 3);
      const skewX = seededRandom() * 80 - 40;
      const skewY = seededRandom() * 80 - 40;
      const rot = seededRandom() * 360;
      const persp = 200 + seededRandom() * 400;
      el.style.transform = 'perspective(' + persp + 'px) rotateX(' + (seededRandom()*60-30) + 'deg) rotateY(' + (seededRandom()*60-30) + 'deg) scale(' + sx + ', ' + sy + ') skew(' + skewX + 'deg, ' + skewY + 'deg) rotate(' + rot + 'deg)';
      el.style.opacity = (0.5 + seededRandom() * 0.5) * intensity;
      el.style.filter = 'blur(' + (seededRandom() * 6) + 'px) hue-rotate(' + (seededRandom() * 360) + 'deg) contrast(' + (1.5 + seededRandom() * 2) + ') saturate(' + (seededRandom() * 4) + ')';
      el.style.mixBlendMode = 'screen';
      el.style.transformOrigin = 'center center';
      if (inlineSvgs.length) {
        el.innerHTML = inlineSvgs[Math.floor(seededRandom() * inlineSvgs.length)];
        const svg = el.querySelector('svg');
        if (svg) {
          svg.style.width = (60 + seededRandom() * 120) + 'px';
          svg.style.height = 'auto';
          svg.setAttribute('preserveAspectRatio', 'none');
        }
      }
      smear.appendChild(el);
    }
    // schedule next wave
    if (wave < 8) setTimeout(addWave, 1500);
  }
  // start first wave after a delay (starts mostly black)
  setTimeout(addWave, 800);
  showToast('\u26a0 CORRUPTED DATA DETECTED');

  // max out distortion
  shake = 40;
  chroma = 1;
  flash.style.opacity = 1;
  setTimeout(() => { flash.style.opacity = 0; }, 200);
  spawnParticles(500, '#ff0040', '#ff80a0');
  // scramble the roll text
  const rt = document.getElementById('rollText');
  if (rt) {
    const nameEl = rt.querySelector('.rarity-name');
    if (nameEl) {
      const scramble = () => {
        if (!corrupted) return;
        const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
        let out = '';
        for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
        nameEl.textContent = out;
        nameEl.style.color = '#ff0040';
        setTimeout(scramble, 120);
      };
      scramble();
    }
  }
}

const driveAnim = document.getElementById('driveAnim');
const driveIcon = document.getElementById('driveIcon');
const driveText = document.getElementById('driveText');

function showDriveAnim(text, icon, duration) {
  driveText.textContent = text;
  driveIcon.textContent = icon;
  driveAnim.style.display = 'flex';
  return new Promise(res => setTimeout(res, duration));
}

document.getElementById('settingsExportBtn').addEventListener('click', async () => {
  closeModal(settingsModal);
  await showDriveAnim('CLONING DRIVE...', '💾', 1200);
  const data = localStorage.getItem(saveKey());
  driveAnim.style.display = 'none';
  if (!data) { showToast('no save to export'); return; }
  // copy to clipboard
  try {
    await navigator.clipboard.writeText(data);
    showToast('save copied to clipboard');
  } catch (e) {
    // fallback: show in prompt
    prompt('copy your save:', data);
  }
});

document.getElementById('settingsImportBtn').addEventListener('click', async () => {
  closeModal(settingsModal);
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (e) { text = ''; }
  if (!text) { text = prompt('paste your save JSON:') || ''; }
  if (!text) return;
  await showDriveAnim('PULLING DRIVE...', '💿', 800);
  await showDriveAnim('INSERTING...', '💿', 800);
  driveAnim.style.display = 'none';
  try {
    const data = JSON.parse(text, (key, value) => {
      if (value === '__INF__') return Infinity;
      if (value === '__NINF__') return -Infinity;
      if (value === '__NAN__') return NaN;
      return value;
    });
    // validate: must look like a lux's rng save
    if (!data || typeof data !== 'object' || typeof data.saveVersion === 'undefined') throw new Error('bad');
    // checksum verification
    if (data.checksum) {
      const checkObj = { ...data };
      delete checkObj.checksum;
      const recomputed = _hashStr(JSON.stringify(checkObj, _saveReplacer));
      if (recomputed !== data.checksum) throw new Error('bad checksum');
    }
    localStorage.setItem(saveKey(), text);
    location.reload();
  } catch (e) {
    triggerCorruption(text);
  }
});

function updateSettingsBtns() {
  const sf = document.getElementById('settingsFlashBtn');
  const sm = document.getElementById('settingsMusicBtn');
  if (sf) sf.textContent = 'FLASH: ' + (flashesEnabled ? 'ON' : 'OFF');
  if (sm) sm.textContent = 'MUSIC: ' + (musicPlaying ? 'ON' : 'OFF');
}

let currentTrack = localStorage.getItem('luxRngTrack') || 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/bgm.mp3';
function populateMusicDropdown() {
  const dd = document.getElementById('musicDropdown');
  if (!dd) return;
  dd.innerHTML = '';
  for (const t of musicTracks) {
    const item = document.createElement('div');
    item.textContent = t.name;
    item.style.cssText = 'padding:6px 10px;font-size:11px;cursor:pointer;color:var(--text);border-bottom:1px solid rgba(43,208,208,0.1)';
    item.addEventListener('click', () => {
      currentTrack = t.src;
      localStorage.setItem('luxRngTrack', t.src);
      bgmAudio.pause();
      bgmAudio.src = t.src;
      bgmAudio.load();
      if (musicPlaying) bgmAudio.play().catch(() => {});
      showToast('track: ' + t.name);
      const dd2 = document.getElementById('musicDropdown');
      if (dd2) dd2.style.display = 'none';
    });
    dd.appendChild(item);
  }
}
populateMusicDropdown();

const musicWrap = document.getElementById('musicWrap');
if (musicWrap) {
  musicWrap.addEventListener('mouseenter', () => {
    const dd = document.getElementById('musicDropdown');
    if (dd) dd.style.display = 'block';
  });
  musicWrap.addEventListener('mouseleave', () => {
    const dd = document.getElementById('musicDropdown');
    if (dd) dd.style.display = 'none';
  });
}

// apply saved track on load
(function applySavedTrack() {
  if (currentTrack && currentTrack !== 'https://github.com/iluxz/luxs-rng/releases/download/v0.8-audio/bgm.mp3') {
    bgmAudio.src = currentTrack;
    bgmAudio.load();
  }
})();
settingsBtn.addEventListener('click', () => { updateSettingsBtns(); openModal(settingsModal); });
document.getElementById('settingsEventsBtn').addEventListener('click', () => { closeModal(settingsModal); openModal(eventsModal); renderEvents(); });
document.getElementById('settingsClose').addEventListener('click', () => closeModal(settingsModal));

function renderEvolve() {
  if (!evolveList) return;
  evolveList.innerHTML = '';
  const inv = getCurrentInventory();
  const rar = getCurrentRarities();
  const keys = Object.keys(inv).filter(k => inv[k] >= 5 && !k.includes(' (M)') && !k.includes(' (BT)') && !k.includes(' (E)'));
  if (keys.length === 0) {
    evolveList.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">need 5 of the same aura to evolve.</div>';
    return;
  }
  for (const key of keys) {
    const r = rar.find(x => x.name === key);
    const row = document.createElement('div');
    row.className = 'shop-item';
    row.innerHTML = '<div class="info"><div class="name">' + key + ' x' + inv[key] + '</div><div class="desc">evolve 5 -> ' + key + ' (E) (+10% luck)</div></div>';
    const btn = document.createElement('button');
    btn.textContent = 'EVOLVE';
    btn.addEventListener('click', () => {
      if ((inv[key] || 0) < 5) { showToast('need 5 ' + key); return; }
      inv[key] -= 5;
      const evoKey = key + ' (E)';
      inv[evoKey] = (inv[evoKey] || 0) + 1;
      fusionCount++;
      setCurrentInventory(inv);
      playFusionSound();
      showToast('evolved 5 ' + key + ' -> ' + evoKey);
      updateUI();
      saveGame();
      renderEvolve();
    });
    row.appendChild(btn);
    evolveList.appendChild(row);
  }
}

document.getElementById('settingsEvolveBtn').addEventListener('click', () => { closeModal(settingsModal); openModal(evolveModal); renderEvolve(); });
document.getElementById('evolveClose').addEventListener('click', () => closeModal(evolveModal));

function renderShowcase() {
  if (!showcaseContent) return;
  showcaseContent.innerHTML = '';
  const rar = getCurrentRarities();
  const best = rar[Math.min(bestRarityIndex, rar.length - 1)] || rar[0];
  const col = best.color === 'rainbow' ? '#fff' : best.color === 'prism' ? '#fff' : best.color;
  const div = document.createElement('div');
  div.style.cssText = 'padding:20px';
  div.innerHTML = '<div style="width:80px;height:80px;margin:0 auto 12px;border-radius:8px;background:' + (best.color2 ? 'linear-gradient(135deg,' + best.color + ',' + best.color2 + ')' : best.color) + ';box-shadow:0 0 30px ' + best.glow + '"></div>' +
    '<div style="font-size:20px;font-family:Georgia,serif;letter-spacing:4px;color:' + col + ';text-shadow:0 0 20px ' + best.glow + '">' + best.name + '</div>' +
    '<div style="font-size:11px;color:var(--muted);margin-top:8px">luck: ' + formatNum(best.luck) + ' | odds: 1/' + formatNum(best.odds) + '</div>' +
    '<div style="font-size:11px;color:var(--muted)">rolls: ' + formatNum(rolls) + ' | credits: ' + formatNum(credits) + '</div>';
  const btn = document.createElement('button');
  btn.textContent = 'CAPTURE';
  btn.style.marginTop = '12px';
  btn.addEventListener('click', () => {
    showToast('screenshot captured (right-click to save)');
  });
  div.appendChild(btn);
  showcaseContent.appendChild(div);
}

document.getElementById('settingsShowcaseBtn').addEventListener('click', () => { closeModal(settingsModal); openModal(showcaseModal); renderShowcase(); });
document.getElementById('showcaseClose').addEventListener('click', () => closeModal(showcaseModal));

function renderRecipeBook() {
  if (!recipeList) return;
  recipeList.innerHTML = '';
  const rar = getCurrentRarities();
  const recipes = [];
  // 2-of-same -> next tier
  for (let i = 0; i < rar.length - 1; i++) {
    recipes.push({ a: rar[i].name, b: rar[i].name, result: rar[i+1].name });
  }
  // special
  recipes.push({ a: 'Tabula', b: 'Tabula', result: 'Core' });
  recipes.push({ a: 'Core', b: 'Core', result: 'Nexus' });
  for (let i = 0; i < rar.length; i++) {
    if (rar[i].craftOnly && i > 0) recipes.push({ a: rar[i-1].name, b: rar[i-1].name, result: rar[i].name });
  }
  // dedupe
  const seen = new Set();
  const unique = recipes.filter(r => {
    const k = r.a + '+' + r.b + '=' + r.result;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (const rec of unique) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;padding:3px 6px;border-bottom:1px solid rgba(43,208,208,0.1);font-size:10px';
    row.innerHTML = '<span style="color:var(--muted)">' + rec.a + ' + ' + rec.b + '</span><span style="color:var(--cyan-bright)">-> ' + rec.result + '</span>';
    recipeList.appendChild(row);
  }
}

document.getElementById('settingsRecipeBtn').addEventListener('click', () => { closeModal(settingsModal); openModal(recipeModal); renderRecipeBook(); });
document.getElementById('recipeClose').addEventListener('click', () => closeModal(recipeModal));
dailyModal.addEventListener('click', e => { if (e.target === dailyModal) closeModal(dailyModal); });
lbSubmit.addEventListener('click', submitScore);

const SAVE_VERSION = 3;

const _saveReplacer = (key, value) => {
  // Infinity/NaN are not JSON-serializable; encode them as tagged strings.
  if (value === Infinity) return '__INF__';
  if (value === -Infinity) return '__NINF__';
  if (typeof value === 'number' && isNaN(value)) return '__NAN__';
  return value;
};
function _hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
function saveGame() {
  try {
    const obj = {
      saveVersion: SAVE_VERSION, inventory, pastInventory, futureInventory, mutatedInventory, baseLuck, rolls, credits, unlocked, shopCounts, autoRoll, achievementsUnlocked, bestRarityIndex, startTime, currentBiome, prestigePoints, prestigeCount, transcendencePoints, transcendenceCount, lifetimeRolls, lifetimeCredits, dailyChallengeDate, dailyChallengeProgress, ownedRarities, collectionRewardClaimed, pityCounter, rollStreak, autoSellThreshold, questClaimed, taskProgress, flashesEnabled, qMarkOdds, qMarkRollCounter, qMarkChangeInterval, qMarkShowChance, equippedRarity, fusionCount, autoFuse, autoEquipBest, setsClaimed, rngUnlocked
    };
    const raw = JSON.stringify(obj, _saveReplacer);
    obj.checksum = _hashStr(raw);
    localStorage.setItem(saveKey(), JSON.stringify(obj, _saveReplacer));
  } catch (e) {}
}

function loadGame() {
  try {
    const raw = localStorage.getItem(saveKey());
    if (!raw) return;
    const data = JSON.parse(raw, (key, value) => {
      if (value === '__INF__') return Infinity;
      if (value === '__NINF__') return -Infinity;
      if (value === '__NAN__') return NaN;
      return value;
    });
    // checksum verification: reject tampered saves
    if (data && data.checksum) {
      const checkObj = { ...data };
      delete checkObj.checksum;
      const recomputed = _hashStr(JSON.stringify(checkObj, _saveReplacer));
      if (recomputed !== data.checksum) {
        triggerCorruption('tampered save');
        return;
      }
    }
    if (data.inventory) inventory = data.inventory;
    if (data.pastInventory) pastInventory = data.pastInventory;
    if (data.futureInventory) futureInventory = data.futureInventory;
    if (data.mutatedInventory) mutatedInventory = data.mutatedInventory;
    timePeriod = 'present';
    if (data.currentBiome) currentBiome = data.currentBiome;
    if (typeof data.baseLuck === 'number') baseLuck = data.baseLuck;
    if (typeof data.rolls === 'number') rolls = data.rolls;
    if (typeof data.credits === 'number') credits = data.credits;
    if (data.unlocked) unlocked = { ...unlocked, ...data.unlocked };
    if (data.shopCounts) shopCounts = { ...shopCounts, ...data.shopCounts };
    if (typeof data.autoRoll === 'boolean') autoRoll = data.autoRoll;
    if (data.achievementsUnlocked) achievementsUnlocked = { ...achievementsUnlocked, ...data.achievementsUnlocked };
    if (typeof data.startTime === 'number') startTime = data.startTime;
    if (typeof data.bestRarityIndex === 'number' && data.saveVersion === SAVE_VERSION) bestRarityIndex = data.bestRarityIndex;
    if (data.ownedRarities) ownedRarities = data.ownedRarities;
    if (typeof data.collectionRewardClaimed === 'boolean') collectionRewardClaimed = data.collectionRewardClaimed;
    if (typeof data.pityCounter === 'number') pityCounter = data.pityCounter;
    if (typeof data.rollStreak === 'number') rollStreak = data.rollStreak;
    if (typeof data.autoSellThreshold === 'number') autoSellThreshold = data.autoSellThreshold;
    if (typeof data.flashesEnabled === 'boolean') { flashesEnabled = data.flashesEnabled; updateFlashBtn(); }
    if (typeof data.qMarkOdds === 'number') qMarkOdds = data.qMarkOdds;
    if (typeof data.qMarkRollCounter === 'number') qMarkRollCounter = data.qMarkRollCounter;
    if (typeof data.qMarkChangeInterval === 'number') qMarkChangeInterval = data.qMarkChangeInterval;
    if (typeof data.qMarkShowChance === 'boolean') qMarkShowChance = data.qMarkShowChance;
    if (typeof data.equippedRarity === 'string' || data.equippedRarity === null) equippedRarity = data.equippedRarity;
    if (typeof data.fusionCount === 'number') fusionCount = data.fusionCount;
    if (typeof data.autoFuse === 'boolean') { autoFuse = data.autoFuse; updateAutoFuseBtn(); }
    if (typeof data.autoEquipBest === 'boolean') { autoEquipBest = data.autoEquipBest; updateAutoEquipBtn(); }
    if (data.setsClaimed) setsClaimed = data.setsClaimed;
    if (typeof data.rngUnlocked === 'boolean') rngUnlocked = data.rngUnlocked;
    if (data.questClaimed) questClaimed = { ...questClaimed, ...data.questClaimed };
    if (data.taskProgress) taskProgress = { ...taskProgress, ...data.taskProgress };
    if (typeof data.prestigePoints === 'number') prestigePoints = data.prestigePoints;
    if (typeof data.prestigeCount === 'number') prestigeCount = data.prestigeCount;
    if (typeof data.transcendencePoints === 'number') transcendencePoints = data.transcendencePoints;
    if (typeof data.transcendenceCount === 'number') transcendenceCount = data.transcendenceCount;
    if (typeof data.lifetimeRolls === 'number') lifetimeRolls = data.lifetimeRolls;
    if (typeof data.lifetimeCredits === 'number') lifetimeCredits = data.lifetimeCredits;
    if (data.dailyChallengeDate) dailyChallengeDate = data.dailyChallengeDate;
    if (data.dailyChallengeProgress) dailyChallengeProgress = { ...dailyChallengeProgress, ...data.dailyChallengeProgress };
    generateDailyChallenges();
    // timePeriod always starts on present
    timePeriod = 'present';
    if (unlocked.timeMachine) {
      const tmUI = document.getElementById('timeMachineUI');
      if (tmUI) tmUI.style.display = 'block';
    }

    // migrate renamed rarities from pre-original-name saves
    const renameMap = { Divinus: 'Celestial', Crystallized: 'Frosted', Gilded: 'Auric', Arcane: 'Mystic', Galaxy: 'Nebula', Exalted: 'Ascended', Glorious: 'Radiant', Googol: 'Google', Googolplex: 'Perplexity' };
    for (const [oldName, newName] of Object.entries(renameMap)) {
      if (inventory[oldName]) {
        inventory[newName] = (inventory[newName] || 0) + inventory[oldName];
        delete inventory[oldName];
      }
    }
  } catch (e) {}
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function resetSave() {
  if (!confirm('reset all progress? this cannot be undone.')) return;
  inventory = {};
  pastInventory = {};
  futureInventory = {};
  mutatedInventory = {};
  baseLuck = 1;
  rolls = 0;
  credits = 0;
  autoRoll = false;
  unlocked = { auto: false, x10: true, x100: true };
  shopCounts = { luckBracelet: 0, luckyGloves: 0, fortuneTalisman: 0, creditsBracelet: 0, autoSpeed: 0, mutationCharm: 0, luckAmplifier: 0, creditsAmplifier: 0 };
  achievementsUnlocked = {};
  prestigePoints = 0;
  prestigeCount = 0;
  transcendencePoints = 0;
  transcendenceCount = 0;
  lifetimeRolls = 0;
  lifetimeCredits = 0;
  dailyChallenges = [];
  dailyChallengeDate = '';
  dailyChallengeProgress = {};
  bestRarityIndex = 0;
  ownedRarities = {};
  collectionRewardClaimed = false;
  pityCounter = 0;
  rollStreak = 0;
  streakBonusMult = 1;
  streakBonusUntil = 0;
  autoSellThreshold = -1;
  flashesEnabled = true;
  updateFlashBtn();
  qMarkOdds = 1.6e17;
  qMarkRollCounter = 0;
  qMarkChangeInterval = 20;
  qMarkShowChance = false;
  equippedRarity = null;
  fusionCount = 0;
  autoFuse = false;
  updateAutoFuseBtn();
  autoEquipBest = false;
  updateAutoEquipBtn();
  setsClaimed = {};
  rngUnlocked = false;
  questClaimed = {};
  taskProgress = {};
  startTime = Date.now();
  currentRarity = rarities[0];
  timePeriod = 'present';
  localStorage.removeItem(saveKey());
  updateUI();
  showToast('save reset');
}

function checkSets() {
  const inv = getCurrentInventory();
  for (const s of raritySets) {
    if (setsClaimed[s.id]) continue;
    if (s.check(inv)) {
      setsClaimed[s.id] = true;
      if (s.reward.luck) baseLuck += s.reward.luck;
      showToast('set complete: ' + s.name + ' (+' + (s.reward.luck||0) + ' luck)');
      saveGame();
    }
  }
}

function checkAchievements() {
  let newUnlock = false;
  for (const a of achievements) {
    if (!achievementsUnlocked[a.id] && a.check()) {
      achievementsUnlocked[a.id] = true;
      newUnlock = true;
      showToast('achievement unlocked: ' + a.name);
    }
  }
  if (newUnlock) {
    playAchievementSound();
    objSay('achievement');
    saveGame();
    renderAchievements();
  }
}

function loop(ts) {
  // biome rotation
  if (biomeTimer === 0) biomeTimer = ts;
  if (ts - biomeTimer > BIOME_DURATION) {
    const idx = Math.floor(Math.random() * biomes.length);
    currentBiome = biomes[idx].name;
    biomeTimer = ts;
    applyBiomeColors();
    objSay('biome');
    saveGame();
  }
  // biome countdown display
  const remaining = Math.max(0, BIOME_DURATION - (ts - biomeTimer));
  const secs = Math.ceil(remaining / 1000);
  if (biomeTimerEl && biomeTimerEl.textContent !== secs + 's') biomeTimerEl.textContent = secs + 's';

  if (autoRoll && !isRolling && timePeriod === 'present') {
    if (ts - lastAuto > autoInterval) {
      triggerRoll(1);
      lastAuto = ts;
    }
  }
  draw();
  requestAnimationFrame(loop);
}

loadGame();
// daily login bonus
const today = new Date().toDateString();
if (lastLoginDate !== today) {
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (lastLoginDate === yesterday) loginStreak++;
  else if (lastLoginDate !== '') loginStreak = 1;
  else loginStreak = 1;
  lastLoginDate = today;
  localStorage.setItem('luxRngLastLogin', today);
  localStorage.setItem('luxRngLoginStreak', String(loginStreak));
  const reward = Math.min(10000, 100 * loginStreak);
  credits += reward;
  baseLuck += Math.min(5, loginStreak * 0.5);
  showToast('daily login: day ' + loginStreak + ' — +' + reward + ' credits, +' + Math.min(5, loginStreak * 0.5) + ' luck');
  updateUI();
  saveGame();
}
applyBiomeColors();
if (localStorage.getItem(saveKey())) objSay('idle');
if (unlocked.timeMachine) {
  const tmUI = document.getElementById('timeMachineUI');
  if (tmUI) tmUI.style.display = 'block';
  switchTimePeriod(timePeriod);
}
populateAuraFilter();
populateAutoSell();
// scene canvas click handling for quest mini-games
if (sceneCanvasEl) {
  sceneCanvasEl.addEventListener('click', (e) => {
    if (timePeriod === 'present') return;
    const rect = sceneCanvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = sceneCanvasEl.width, h = sceneCanvasEl.height;
    const sx = x * (w / rect.width), sy = y * (h / rect.height);
    if (timePeriod === 'past') {
      // dig grid
      const cell = Math.round(Math.min(w, h) * 0.07);
      const gx = Math.round(w * 0.35), gy = Math.round(h * 0.4);
      const ci = Math.floor((sx - gx) / cell);
      const ri = Math.floor((sy - gy) / cell);
      if (ci >= 0 && ci < 4 && ri >= 0 && ri < 4) {
        const idx = ri * 4 + ci;
        const c = digGrid[idx];
        if (c && !c.dug) {
          c.dug = true;
          if (c.hasRelic) {
            digRelicsFound++;
            npcDialogue = c.rare ? 'a RARE relic! the desert yields its secrets.' : 'you found a relic!';
            npcDialogueUntil = Date.now() + 2500;
            showToast(c.rare ? 'rare relic found!' : 'relic found!');
            objSay('quest');
          } else {
            npcDialogue = 'just sand. keep digging.';
            npcDialogueUntil = Date.now() + 2000;
          }
          // update quest progress
          taskProgress['past_digAny'] = (taskProgress['past_digAny'] || 0) + 1;
          if (c.hasRelic) taskProgress['past_dig'] = (taskProgress['past_dig'] || 0) + 1;
          if (c.rare) taskProgress['past_rare'] = (taskProgress['past_rare'] || 0) + 1;
          saveGame();
          updateUI();
          renderQuests();
        }
      }
      // NPC click
      if (sx > w*0.1 && sx < w*0.3 && sy > h*0.45 && sy < h*0.8) {
        npcDialogue = 'Past Keeper: the desert hides what time buried. dig, and remember.';
        npcDialogueUntil = Date.now() + 3000;
      }
    } else if (timePeriod === 'future') {
      const cell = Math.round(Math.min(w, h) * 0.07);
      const tx = Math.round(w * 0.35), ty = Math.round(h * 0.4);
      const tw = Math.round(cell * 1.2);
      for (let i = 0; i < 3; i++) {
        const bx = tx + i * (tw + 10), by = ty;
        if (sx >= bx && sx <= bx + tw && sy >= by && sy <= by + Math.round(cell * 1.6)) {
          const t = cityTerminals[i];
          if (t && !t.hacked) {
            t.hacked = Math.random() < 0.4;
            if (t.hacked) {
              cityHacked++;
              npcDialogue = t.rare ? 'rare terminal cracked! the city speaks.' : 'terminal hacked!';
              npcDialogueUntil = Date.now() + 2500;
              showToast(t.rare ? 'rare terminal!' : 'hacked!');
              objSay('quest');
              taskProgress['future_hackAny'] = (taskProgress['future_hackAny'] || 0) + 1;
              taskProgress['future_hack'] = (taskProgress['future_hack'] || 0) + 1;
              if (t.rare) taskProgress['future_rare'] = (taskProgress['future_rare'] || 0) + 1;
            } else {
              npcDialogue = 'access denied. try again.';
              npcDialogueUntil = Date.now() + 2000;
              taskProgress['future_hackAny'] = (taskProgress['future_hackAny'] || 0) + 1;
            }
            saveGame();
            updateUI();
            renderQuests();
          }
        }
      }
      if (sx > w*0.1 && sx < w*0.3 && sy > h*0.6 && sy < h*0.85) {
        npcDialogue = 'Future Oracle: the city never sleeps. neither do i. hack on.';
        npcDialogueUntil = Date.now() + 3000;
      }
    }
  });
}
resize();updateUI();
draw();
requestAnimationFrame(loop);