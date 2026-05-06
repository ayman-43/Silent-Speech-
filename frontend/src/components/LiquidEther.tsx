'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './LiquidEther.css';

interface LiquidEtherProps {
  mouseForce?: number;
  cursorSize?: number;
  isViscous?: boolean;
  viscous?: number;
  iterationsViscous?: number;
  iterationsPoisson?: number;
  dt?: number;
  BFECC?: boolean;
  resolution?: number;
  isBounce?: boolean;
  colors?: string[];
  style?: React.CSSProperties;
  className?: string;
  autoDemo?: boolean;
  autoSpeed?: number;
  autoIntensity?: number;
  takeoverDuration?: number;
  autoResumeDelay?: number;
  autoRampDuration?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWebGLManager = any;

export default function LiquidEther({
  mouseForce = 20,
  cursorSize = 100,
  isViscous = false,
  viscous = 30,
  iterationsViscous = 32,
  iterationsPoisson = 32,
  dt = 0.014,
  BFECC = true,
  resolution = 0.5,
  isBounce = false,
  colors = ['#5227FF', '#FF9FFC', '#B497CF'],
  style = {},
  className = '',
  autoDemo = true,
  autoSpeed = 0.5,
  autoIntensity = 2.2,
  takeoverDuration = 0.25,
  autoResumeDelay = 1000,
  autoRampDuration = 0.6,
}: LiquidEtherProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const webglRef = useRef<AnyWebGLManager>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number | null>(null);
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const isVisibleRef = useRef(true);
  const resizeRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    function makePaletteTexture(stops: string[]) {
      const arr = stops.length === 0 ? ['#ffffff', '#ffffff'] : stops.length === 1 ? [stops[0], stops[0]] : stops;
      const data = new Uint8Array(arr.length * 4);
      for (let i = 0; i < arr.length; i++) {
        const c = new THREE.Color(arr[i]);
        data[i * 4 + 0] = Math.round(c.r * 255);
        data[i * 4 + 1] = Math.round(c.g * 255);
        data[i * 4 + 2] = Math.round(c.b * 255);
        data[i * 4 + 3] = 255;
      }
      const tex = new THREE.DataTexture(data, arr.length, 1, THREE.RGBAFormat);
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      return tex;
    }

    const paletteTex = makePaletteTexture(colors);
    const bgVec4 = new THREE.Vector4(0, 0, 0, 0);

    // ---- Common ----
    let commonWidth = 1, commonHeight = 1;
    let commonRenderer: THREE.WebGLRenderer | null = null;
    let commonClock: THREE.Clock | null = null;
    let commonTime = 0;
    let commonDelta = 0;
    let commonContainer: HTMLElement | null = null;

    function commonInit(container: HTMLElement) {
      commonContainer = container;
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      commonResize();
      commonRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      commonRenderer.autoClear = false;
      commonRenderer.setClearColor(new THREE.Color(0x000000), 0);
      commonRenderer.setPixelRatio(pr);
      commonRenderer.setSize(commonWidth, commonHeight);
      commonRenderer.domElement.style.width = '100%';
      commonRenderer.domElement.style.height = '100%';
      commonRenderer.domElement.style.display = 'block';
      commonClock = new THREE.Clock();
      commonClock.start();
    }
    function commonResize() {
      if (!commonContainer) return;
      const rect = commonContainer.getBoundingClientRect();
      commonWidth = Math.max(1, Math.floor(rect.width));
      commonHeight = Math.max(1, Math.floor(rect.height));
      if (commonRenderer) commonRenderer.setSize(commonWidth, commonHeight, false);
    }
    function commonUpdate() {
      commonDelta = commonClock!.getDelta();
      commonTime += commonDelta;
    }
    void commonDelta; void commonTime;

    // ---- Mouse ----
    let mouseCoords = new THREE.Vector2();
    let mouseCoordsOld = new THREE.Vector2();
    let mouseDiff = new THREE.Vector2();
    let mouseIsHoverInside = false;
    let mouseHasUserControl = false;
    let mouseIsAutoActive = false;
    let mouseAutoIntensity = 2.0;
    let mouseTakeoverActive = false;
    let mouseTakeoverStartTime = 0;
    let mouseTakeoverDuration = 0.25;
    const mouseTakeoverFrom = new THREE.Vector2();
    const mouseTakeoverTo = new THREE.Vector2();
    let mouseOnInteract: (() => void) | null = null;
    let mouseTimer: number | null = null;
    let mouseContainer: HTMLElement | null = null;
    let mouseListenerTarget: Window | null = null;
    let mouseDocTarget: Document | null = null;

    function mouseIsPointInside(clientX: number, clientY: number) {
      if (!mouseContainer) return false;
      const rect = mouseContainer.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }
    function mouseSetCoords(x: number, y: number) {
      if (!mouseContainer) return;
      if (mouseTimer !== null) window.clearTimeout(mouseTimer);
      const rect = mouseContainer.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = (x - rect.left) / rect.width;
      const ny = (y - rect.top) / rect.height;
      mouseCoords.set(nx * 2 - 1, -(ny * 2 - 1));
      mouseTimer = window.setTimeout(() => { mouseTimer = null; }, 100);
    }
    function mouseSetNormalized(nx: number, ny: number) { mouseCoords.set(nx, ny); }

    function onDocMouseMove(e: MouseEvent) {
      const inside = mouseIsPointInside(e.clientX, e.clientY);
      mouseIsHoverInside = inside;
      if (!inside) return;
      if (mouseOnInteract) mouseOnInteract();
      if (mouseIsAutoActive && !mouseHasUserControl && !mouseTakeoverActive) {
        if (!mouseContainer) return;
        const rect = mouseContainer.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        mouseTakeoverFrom.copy(mouseCoords);
        mouseTakeoverTo.set(nx * 2 - 1, -(ny * 2 - 1));
        mouseTakeoverStartTime = performance.now();
        mouseTakeoverActive = true;
        mouseHasUserControl = true;
        mouseIsAutoActive = false;
        return;
      }
      mouseSetCoords(e.clientX, e.clientY);
      mouseHasUserControl = true;
    }
    function onDocTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      mouseIsHoverInside = mouseIsPointInside(t.clientX, t.clientY);
      if (!mouseIsHoverInside) return;
      if (mouseOnInteract) mouseOnInteract();
      mouseSetCoords(t.clientX, t.clientY);
      mouseHasUserControl = true;
    }
    function onDocTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      mouseIsHoverInside = mouseIsPointInside(t.clientX, t.clientY);
      if (!mouseIsHoverInside) return;
      if (mouseOnInteract) mouseOnInteract();
      mouseSetCoords(t.clientX, t.clientY);
    }
    function onTouchEnd() { mouseIsHoverInside = false; }
    function onDocLeave() { mouseIsHoverInside = false; }

    function mouseInit(container: HTMLElement) {
      mouseContainer = container;
      mouseDocTarget = container.ownerDocument || null;
      const dv = mouseDocTarget?.defaultView ?? (typeof window !== 'undefined' ? window : null);
      if (!dv) return;
      mouseListenerTarget = dv;
      dv.addEventListener('mousemove', onDocMouseMove);
      dv.addEventListener('touchstart', onDocTouchStart, { passive: true });
      dv.addEventListener('touchmove', onDocTouchMove, { passive: true });
      dv.addEventListener('touchend', onTouchEnd);
      if (mouseDocTarget) mouseDocTarget.addEventListener('mouseleave', onDocLeave);
    }
    function mouseDispose() {
      if (mouseListenerTarget) {
        mouseListenerTarget.removeEventListener('mousemove', onDocMouseMove);
        mouseListenerTarget.removeEventListener('touchstart', onDocTouchStart);
        mouseListenerTarget.removeEventListener('touchmove', onDocTouchMove);
        mouseListenerTarget.removeEventListener('touchend', onTouchEnd);
      }
      if (mouseDocTarget) mouseDocTarget.removeEventListener('mouseleave', onDocLeave);
      mouseListenerTarget = null;
      mouseDocTarget = null;
      mouseContainer = null;
    }
    function mouseUpdate() {
      if (mouseTakeoverActive) {
        const t = (performance.now() - mouseTakeoverStartTime) / (mouseTakeoverDuration * 1000);
        if (t >= 1) {
          mouseTakeoverActive = false;
          mouseCoords.copy(mouseTakeoverTo);
          mouseCoordsOld.copy(mouseCoords);
          mouseDiff.set(0, 0);
        } else {
          const k = t * t * (3 - 2 * t);
          mouseCoords.copy(mouseTakeoverFrom).lerp(mouseTakeoverTo, k);
        }
      }
      mouseDiff.subVectors(mouseCoords, mouseCoordsOld);
      mouseCoordsOld.copy(mouseCoords);
      if (mouseCoordsOld.x === 0 && mouseCoordsOld.y === 0) mouseDiff.set(0, 0);
      if (mouseIsAutoActive && !mouseTakeoverActive) mouseDiff.multiplyScalar(mouseAutoIntensity);
    }

    // ---- AutoDriver ----
    let autoDriving = false;
    const autoCurrent = new THREE.Vector2(0, 0);
    const autoTarget = new THREE.Vector2();
    let autoLastTime = performance.now();
    let autoActivationTime = 0;
    const autoMargin = 0.2;
    const _tmpDir = new THREE.Vector2();
    let autoLastUserInteraction = performance.now();

    function autoPickTarget() {
      autoTarget.set((Math.random() * 2 - 1) * (1 - autoMargin), (Math.random() * 2 - 1) * (1 - autoMargin));
    }
    function autoForceStop() {
      autoDriving = false;
      mouseIsAutoActive = false;
    }
    function autoUpdate() {
      if (!autoDemo) return;
      const now = performance.now();
      if (now - autoLastUserInteraction < autoResumeDelay) { if (autoDriving) autoForceStop(); return; }
      if (mouseIsHoverInside) { if (autoDriving) autoForceStop(); return; }
      if (!autoDriving) {
        autoDriving = true;
        autoCurrent.copy(mouseCoords);
        autoLastTime = now;
        autoActivationTime = now;
      }
      mouseIsAutoActive = true;
      let dtSec = (now - autoLastTime) / 1000;
      autoLastTime = now;
      if (dtSec > 0.2) dtSec = 0.016;
      const dir = _tmpDir.subVectors(autoTarget, autoCurrent);
      const dist = dir.length();
      if (dist < 0.01) { autoPickTarget(); return; }
      dir.normalize();
      let ramp = 1;
      const rampMs = autoRampDuration * 1000;
      if (rampMs > 0) { const t = Math.min(1, (now - autoActivationTime) / rampMs); ramp = t * t * (3 - 2 * t); }
      autoCurrent.addScaledVector(dir, Math.min(autoSpeed * dtSec * ramp, dist));
      mouseSetNormalized(autoCurrent.x, autoCurrent.y);
    }
    autoPickTarget();

    // ---- Shaders ----
    const face_vert = `
  attribute vec3 position;
  uniform vec2 px;
  uniform vec2 boundarySpace;
  varying vec2 uv;
  precision highp float;
  void main(){
    vec3 pos = position;
    vec2 scale = 1.0 - boundarySpace * 2.0;
    pos.xy = pos.xy * scale;
    uv = vec2(0.5)+(pos.xy)*0.5;
    gl_Position = vec4(pos, 1.0);
  }
`;
    const line_vert = `
  attribute vec3 position;
  uniform vec2 px;
  precision highp float;
  varying vec2 uv;
  void main(){
    vec3 pos = position;
    uv = 0.5 + pos.xy * 0.5;
    vec2 n = sign(pos.xy);
    pos.xy = abs(pos.xy) - px * 1.0;
    pos.xy *= n;
    gl_Position = vec4(pos, 1.0);
  }
`;
    const mouse_vert = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform vec2 center;
  uniform vec2 scale;
  uniform vec2 px;
  varying vec2 vUv;
  void main(){
    vec2 pos = position.xy * scale * 2.0 * px + center;
    vUv = uv;
    gl_Position = vec4(pos, 0.0, 1.0);
  }
`;
    const advection_frag = `
  precision highp float;
  uniform sampler2D velocity;
  uniform float dt;
  uniform bool isBFECC;
  uniform vec2 fboSize;
  uniform vec2 px;
  varying vec2 uv;
  void main(){
    vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;
    if(isBFECC == false){
      vec2 vel = texture2D(velocity, uv).xy;
      vec2 uv2 = uv - vel * dt * ratio;
      gl_FragColor = vec4(texture2D(velocity, uv2).xy, 0.0, 0.0);
    } else {
      vec2 vel_old = texture2D(velocity, uv).xy;
      vec2 spot_old = uv - vel_old * dt * ratio;
      vec2 vel_new1 = texture2D(velocity, spot_old).xy;
      vec2 spot_new2 = spot_old + vel_new1 * dt * ratio;
      vec2 spot_new3 = uv - (spot_new2 - uv) / 2.0;
      vec2 vel_2 = texture2D(velocity, spot_new3).xy;
      vec2 spot_old2 = spot_new3 - vel_2 * dt * ratio;
      gl_FragColor = vec4(texture2D(velocity, spot_old2).xy, 0.0, 0.0);
    }
  }
`;
    const color_frag = `
  precision highp float;
  uniform sampler2D velocity;
  uniform sampler2D palette;
  uniform vec4 bgColor;
  varying vec2 uv;
  void main(){
    vec2 vel = texture2D(velocity, uv).xy;
    float lenv = clamp(length(vel), 0.0, 1.0);
    vec3 c = texture2D(palette, vec2(lenv, 0.5)).rgb;
    gl_FragColor = vec4(mix(bgColor.rgb, c, lenv), mix(bgColor.a, 1.0, lenv));
  }
`;
    const divergence_frag = `
  precision highp float;
  uniform sampler2D velocity;
  uniform float dt;
  uniform vec2 px;
  varying vec2 uv;
  void main(){
    float x0 = texture2D(velocity, uv-vec2(px.x,0.0)).x;
    float x1 = texture2D(velocity, uv+vec2(px.x,0.0)).x;
    float y0 = texture2D(velocity, uv-vec2(0.0,px.y)).y;
    float y1 = texture2D(velocity, uv+vec2(0.0,px.y)).y;
    gl_FragColor = vec4((x1-x0+y1-y0)/2.0/dt);
  }
`;
    const externalForce_frag = `
  precision highp float;
  uniform vec2 force;
  uniform vec2 center;
  uniform vec2 scale;
  uniform vec2 px;
  varying vec2 vUv;
  void main(){
    vec2 circle = (vUv - 0.5) * 2.0;
    float d = 1.0 - min(length(circle), 1.0);
    d *= d;
    gl_FragColor = vec4(force * d, 0.0, 1.0);
  }
`;
    const poisson_frag = `
  precision highp float;
  uniform sampler2D pressure;
  uniform sampler2D divergence;
  uniform vec2 px;
  varying vec2 uv;
  void main(){
    float p0 = texture2D(pressure, uv+vec2(px.x*2.0,0.0)).r;
    float p1 = texture2D(pressure, uv-vec2(px.x*2.0,0.0)).r;
    float p2 = texture2D(pressure, uv+vec2(0.0,px.y*2.0)).r;
    float p3 = texture2D(pressure, uv-vec2(0.0,px.y*2.0)).r;
    float div = texture2D(divergence, uv).r;
    gl_FragColor = vec4((p0+p1+p2+p3)/4.0-div);
  }
`;
    const pressure_frag = `
  precision highp float;
  uniform sampler2D pressure;
  uniform sampler2D velocity;
  uniform vec2 px;
  uniform float dt;
  varying vec2 uv;
  void main(){
    float p0 = texture2D(pressure, uv+vec2(px.x,0.0)).r;
    float p1 = texture2D(pressure, uv-vec2(px.x,0.0)).r;
    float p2 = texture2D(pressure, uv+vec2(0.0,px.y)).r;
    float p3 = texture2D(pressure, uv-vec2(0.0,px.y)).r;
    vec2 v = texture2D(velocity, uv).xy;
    v -= vec2(p0-p1, p2-p3)*0.5*dt;
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;
    const viscous_frag = `
  precision highp float;
  uniform sampler2D velocity;
  uniform sampler2D velocity_new;
  uniform float v;
  uniform vec2 px;
  uniform float dt;
  varying vec2 uv;
  void main(){
    vec2 old = texture2D(velocity, uv).xy;
    vec2 n0 = texture2D(velocity_new, uv+vec2(px.x*2.0,0.0)).xy;
    vec2 n1 = texture2D(velocity_new, uv-vec2(px.x*2.0,0.0)).xy;
    vec2 n2 = texture2D(velocity_new, uv+vec2(0.0,px.y*2.0)).xy;
    vec2 n3 = texture2D(velocity_new, uv-vec2(0.0,px.y*2.0)).xy;
    vec2 newv = (4.0*old + v*dt*(n0+n1+n2+n3)) / (4.0*(1.0+v*dt));
    gl_FragColor = vec4(newv, 0.0, 0.0);
  }
`;

    // ---- FBO helpers ----
    function makeFBO(w: number, h: number) {
      const isIOS = /(iPad|iPhone|iPod)/i.test(navigator.userAgent);
      return new THREE.WebGLRenderTarget(w, h, {
        type: isIOS ? THREE.HalfFloatType : THREE.FloatType,
        depthBuffer: false, stencilBuffer: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      });
    }

    function makeScene() { const s = new THREE.Scene(); const c = new THREE.Camera(); return { scene: s, camera: c }; }

    function renderTo(scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget | null) {
      commonRenderer!.setRenderTarget(target);
      commonRenderer!.render(scene, camera);
      commonRenderer!.setRenderTarget(null);
    }

    // ---- Simulation state ----
    const fboSize = new THREE.Vector2();
    const cellScale = new THREE.Vector2();
    const boundarySpace = new THREE.Vector2();

    function calcFboSize() {
      const w = Math.max(1, Math.round(resolution * commonWidth));
      const h = Math.max(1, Math.round(resolution * commonHeight));
      cellScale.set(1 / w, 1 / h);
      fboSize.set(w, h);
    }

    calcFboSize();

    let fbos = {
      vel_0: makeFBO(fboSize.x, fboSize.y),
      vel_1: makeFBO(fboSize.x, fboSize.y),
      vel_viscous0: makeFBO(fboSize.x, fboSize.y),
      vel_viscous1: makeFBO(fboSize.x, fboSize.y),
      div: makeFBO(fboSize.x, fboSize.y),
      pressure_0: makeFBO(fboSize.x, fboSize.y),
      pressure_1: makeFBO(fboSize.x, fboSize.y),
    };

    function resizeFBOs() {
      calcFboSize();
      for (const k of Object.keys(fbos) as (keyof typeof fbos)[]) {
        fbos[k].setSize(fboSize.x, fboSize.y);
      }
    }

    // ---- Advection pass ----
    const advUniforms: Record<string, THREE.IUniform> = {
      boundarySpace: { value: cellScale },
      px: { value: cellScale },
      fboSize: { value: fboSize },
      velocity: { value: fbos.vel_0.texture },
      dt: { value: dt },
      isBFECC: { value: BFECC },
    };
    const { scene: advScene, camera: advCamera } = makeScene();
    const advGeo = new THREE.PlaneGeometry(2, 2);
    advScene.add(new THREE.Mesh(advGeo, new THREE.RawShaderMaterial({ vertexShader: face_vert, fragmentShader: advection_frag, uniforms: advUniforms })));
    const boundGeo = new THREE.BufferGeometry();
    boundGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1,-1,0,-1,1,0,-1,1,0,1,1,0,1,1,0,1,-1,0,1,-1,0,-1,-1,0]), 3));
    const boundLine = new THREE.LineSegments(boundGeo, new THREE.RawShaderMaterial({ vertexShader: line_vert, fragmentShader: advection_frag, uniforms: advUniforms }));
    advScene.add(boundLine);

    function advectionPass(opts: { dt: number; isBounce: boolean; BFECC: boolean }) {
      advUniforms.dt.value = opts.dt;
      advUniforms.isBFECC.value = opts.BFECC;
      boundLine.visible = opts.isBounce;
      renderTo(advScene, advCamera, fbos.vel_1);
    }

    // ---- External force pass ----
    const forceUniforms: Record<string, THREE.IUniform> = {
      px: { value: cellScale },
      force: { value: new THREE.Vector2(0, 0) },
      center: { value: new THREE.Vector2(0, 0) },
      scale: { value: new THREE.Vector2(cursorSize, cursorSize) },
    };
    const { scene: forceScene, camera: forceCamera } = makeScene();
    const forceMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.RawShaderMaterial({ vertexShader: mouse_vert, fragmentShader: externalForce_frag, blending: THREE.AdditiveBlending, depthWrite: false, uniforms: forceUniforms })
    );
    forceScene.add(forceMesh);

    function externalForcePass(opts: { cursor_size: number; mouse_force: number; cellScale: THREE.Vector2 }) {
      const fx = (mouseDiff.x / 2) * opts.mouse_force;
      const fy = (mouseDiff.y / 2) * opts.mouse_force;
      const csx = opts.cursor_size * opts.cellScale.x;
      const csy = opts.cursor_size * opts.cellScale.y;
      forceUniforms.force.value.set(fx, fy);
      forceUniforms.center.value.set(
        Math.min(Math.max(mouseCoords.x, -1 + csx + opts.cellScale.x * 2), 1 - csx - opts.cellScale.x * 2),
        Math.min(Math.max(mouseCoords.y, -1 + csy + opts.cellScale.y * 2), 1 - csy - opts.cellScale.y * 2)
      );
      forceUniforms.scale.value.set(opts.cursor_size, opts.cursor_size);
      renderTo(forceScene, forceCamera, fbos.vel_1);
    }

    // ---- Viscous pass ----
    const viscUniforms: Record<string, THREE.IUniform> = {
      boundarySpace: { value: boundarySpace },
      velocity: { value: fbos.vel_1.texture },
      velocity_new: { value: fbos.vel_viscous0.texture },
      v: { value: viscous },
      px: { value: cellScale },
      dt: { value: dt },
    };
    const { scene: viscScene, camera: viscCamera } = makeScene();
    viscScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.RawShaderMaterial({ vertexShader: face_vert, fragmentShader: viscous_frag, uniforms: viscUniforms })));

    function viscousPass(opts: { viscous: number; iterations: number; dt: number }) {
      viscUniforms.v.value = opts.viscous;
      viscUniforms.dt.value = opts.dt;
      let fboOut = fbos.vel_viscous0;
      for (let i = 0; i < opts.iterations; i++) {
        const fboIn = i % 2 === 0 ? fbos.vel_viscous0 : fbos.vel_viscous1;
        fboOut = i % 2 === 0 ? fbos.vel_viscous1 : fbos.vel_viscous0;
        viscUniforms.velocity_new.value = fboIn.texture;
        renderTo(viscScene, viscCamera, fboOut);
      }
      return fboOut;
    }

    // ---- Divergence pass ----
    const divUniforms: Record<string, THREE.IUniform> = {
      boundarySpace: { value: boundarySpace },
      velocity: { value: fbos.vel_1.texture },
      px: { value: cellScale },
      dt: { value: dt },
    };
    const { scene: divScene, camera: divCamera } = makeScene();
    divScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.RawShaderMaterial({ vertexShader: face_vert, fragmentShader: divergence_frag, uniforms: divUniforms })));

    function divergencePass(vel: THREE.WebGLRenderTarget) {
      divUniforms.velocity.value = vel.texture;
      renderTo(divScene, divCamera, fbos.div);
    }

    // ---- Poisson pass ----
    const poissonUniforms: Record<string, THREE.IUniform> = {
      boundarySpace: { value: boundarySpace },
      pressure: { value: fbos.pressure_0.texture },
      divergence: { value: fbos.div.texture },
      px: { value: cellScale },
    };
    const { scene: poissonScene, camera: poissonCamera } = makeScene();
    poissonScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.RawShaderMaterial({ vertexShader: face_vert, fragmentShader: poisson_frag, uniforms: poissonUniforms })));

    function poissonPass(iterations: number) {
      let pOut = fbos.pressure_0;
      for (let i = 0; i < iterations; i++) {
        const pIn = i % 2 === 0 ? fbos.pressure_0 : fbos.pressure_1;
        pOut = i % 2 === 0 ? fbos.pressure_1 : fbos.pressure_0;
        poissonUniforms.pressure.value = pIn.texture;
        renderTo(poissonScene, poissonCamera, pOut);
      }
      return pOut;
    }

    // ---- Pressure pass ----
    const pressureUniforms: Record<string, THREE.IUniform> = {
      boundarySpace: { value: boundarySpace },
      pressure: { value: fbos.pressure_0.texture },
      velocity: { value: fbos.vel_1.texture },
      px: { value: cellScale },
      dt: { value: dt },
    };
    const { scene: pressureScene, camera: pressureCamera } = makeScene();
    pressureScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.RawShaderMaterial({ vertexShader: face_vert, fragmentShader: pressure_frag, uniforms: pressureUniforms })));

    function pressurePass(vel: THREE.WebGLRenderTarget, pressure: THREE.WebGLRenderTarget) {
      pressureUniforms.velocity.value = vel.texture;
      pressureUniforms.pressure.value = pressure.texture;
      renderTo(pressureScene, pressureCamera, fbos.vel_0);
    }

    // ---- Output pass ----
    const outputUniforms: Record<string, THREE.IUniform> = {
      velocity: { value: fbos.vel_0.texture },
      boundarySpace: { value: new THREE.Vector2() },
      palette: { value: paletteTex },
      bgColor: { value: bgVec4 },
    };
    const { scene: outputScene, camera: outputCamera } = makeScene();
    outputScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.RawShaderMaterial({ vertexShader: face_vert, fragmentShader: color_frag, transparent: true, depthWrite: false, uniforms: outputUniforms })));

    // ---- Simulation options (mutable) ----
    const simOpts = {
      mouse_force: mouseForce,
      cursor_size: cursorSize,
      isViscous,
      viscous,
      iterations_viscous: iterationsViscous,
      iterations_poisson: iterationsPoisson,
      dt,
      BFECC,
      resolution,
      isBounce,
    };

    // ---- Main simulation step ----
    function simulationStep() {
      if (simOpts.isBounce) { boundarySpace.set(0, 0); } else { boundarySpace.copy(cellScale); }
      advectionPass({ dt: simOpts.dt, isBounce: simOpts.isBounce, BFECC: simOpts.BFECC });
      externalForcePass({ cursor_size: simOpts.cursor_size, mouse_force: simOpts.mouse_force, cellScale });
      let vel = fbos.vel_1;
      if (simOpts.isViscous) vel = viscousPass({ viscous: simOpts.viscous, iterations: simOpts.iterations_viscous, dt: simOpts.dt });
      divergencePass(vel);
      const pressure = poissonPass(simOpts.iterations_poisson);
      pressurePass(vel, pressure);
      outputUniforms.velocity.value = fbos.vel_0.texture;
    }

    // ---- WebGL manager ----
    let running = false;

    function render() {
      autoUpdate();
      mouseUpdate();
      commonUpdate();
      simulationStep();
      renderTo(outputScene, outputCamera, null);
    }

    function loop() {
      if (!running) return;
      render();
      rafRef.current = requestAnimationFrame(loop);
    }

    function start() {
      if (running) return;
      running = true;
      loop();
    }

    function pause() {
      running = false;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    }

    function onWindowResize() {
      commonResize();
      resizeFBOs();
    }

    function onVisibility() {
      if (document.hidden) pause();
      else if (isVisibleRef.current) start();
    }

    // expose simOpts for the second useEffect
    webglRef.current = {
      start, pause,
      resize: onWindowResize,
      dispose() {
        window.removeEventListener('resize', onWindowResize);
        document.removeEventListener('visibilitychange', onVisibility);
        mouseDispose();
        if (commonRenderer) {
          const canvas = commonRenderer.domElement;
          if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
          commonRenderer.dispose();
          try { commonRenderer.forceContextLoss(); } catch { /* ignore */ }
        }
      },
      simOpts,
      resizeFBOs,
      setAutoResumeDelay(d: number) { /* used externally */ void d; },
      getAutoLastUserInteraction() { return autoLastUserInteraction; },
      setAutoLastUserInteraction(t: number) { autoLastUserInteraction = t; },
      forceStopAuto() { autoForceStop(); },
      setMouseAutoIntensity(v: number) { mouseAutoIntensity = v; },
      setMouseTakeoverDuration(v: number) { mouseTakeoverDuration = v; },
    };

    mouseOnInteract = () => {
      autoLastUserInteraction = performance.now();
      autoForceStop();
    };

    const container = mountRef.current!;
    container.style.position = container.style.position || 'relative';
    container.style.overflow = container.style.overflow || 'hidden';

    commonInit(container);
    mouseInit(container);
    container.prepend(commonRenderer!.domElement);

    start();

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries[0].isIntersecting && entries[0].intersectionRatio > 0;
        isVisibleRef.current = visible;
        if (visible && !document.hidden) start(); else pause();
      },
      { threshold: [0, 0.01, 0.1] }
    );
    io.observe(container);
    intersectionObserverRef.current = io;

    const ro = new ResizeObserver(() => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = requestAnimationFrame(() => { onWindowResize(); });
    });
    ro.observe(container);
    resizeObserverRef.current = ro;

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { resizeObserverRef.current?.disconnect(); } catch { /* ignore */ }
      try { intersectionObserverRef.current?.disconnect(); } catch { /* ignore */ }
      if (webglRef.current) { webglRef.current.dispose(); webglRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wgl = webglRef.current;
    if (!wgl) return;
    const prevRes = wgl.simOpts.resolution;
    Object.assign(wgl.simOpts, {
      mouse_force: mouseForce,
      cursor_size: cursorSize,
      isViscous,
      viscous,
      iterations_viscous: iterationsViscous,
      iterations_poisson: iterationsPoisson,
      dt,
      BFECC,
      resolution,
      isBounce,
    });
    wgl.setMouseAutoIntensity(autoIntensity);
    wgl.setMouseTakeoverDuration(takeoverDuration);
    if (resolution !== prevRes) wgl.resizeFBOs();
  }, [mouseForce, cursorSize, isViscous, viscous, iterationsViscous, iterationsPoisson, dt, BFECC, resolution, isBounce, autoDemo, autoSpeed, autoIntensity, takeoverDuration, autoResumeDelay, autoRampDuration]);

  return <div ref={mountRef} className={`liquid-ether-container ${className || ''}`} style={style} />;
}
