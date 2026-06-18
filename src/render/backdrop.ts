import * as THREE from 'three';

// Depth for the sky. The nebula dome is a single painted shell; on its own the
// background reads as flat. These additive sprites sit inside the skybox group
// (which tracks the camera, so they stay at "infinity") at staggered radii to
// give the void real layers, plus a distant sun glow and a planet that anchor
// scale and give the player something to race toward.

const SUN_DIR = new THREE.Vector3(-0.72, 0.34, 0.58).normalize();

function radialTexture(stops: Array<[number, string]>, size = 256): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture(tint: string, size = 512): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);
  // Stack soft offset blobs into an irregular cloud so no two read identically.
  for (let i = 0; i < 26; i++) {
    const x = size * (0.2 + Math.random() * 0.6);
    const y = size * (0.2 + Math.random() * 0.6);
    const r = size * (0.06 + Math.random() * 0.22);
    const a = 0.04 + Math.random() * 0.07;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, tint.replace('ALPHA', a.toFixed(3)));
    grad.addColorStop(1, tint.replace('ALPHA', '0'));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addSprite(
  group: THREE.Group,
  tex: THREE.Texture,
  dir: THREE.Vector3,
  radius: number,
  scale: number,
  opacity: number,
  blending: THREE.Blending = THREE.AdditiveBlending,
): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity,
    blending,
    depthWrite: false,
    // depthTest ON so the asteroid field (opaque, writes depth) occludes the
    // backdrop. Without it these transparent sprites paint over every rock.
    depthTest: true,
    fog: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(dir).multiplyScalar(radius);
  sprite.scale.setScalar(scale);
  sprite.renderOrder = -8;
  group.add(sprite);
  return sprite;
}

/** Populate the skybox group with parallax nebula, a sun glow, and a planet. */
export function buildBackdrop(skybox: THREE.Group): void {
  const clouds: Array<[string, THREE.Vector3, number]> = [
    ['rgba(90,150,210,ALPHA)', new THREE.Vector3(0.5, 0.25, 0.83), 0.82],
    ['rgba(190,110,230,ALPHA)', new THREE.Vector3(-0.62, -0.1, 0.78), 0.9],
    ['rgba(255,140,70,ALPHA)', new THREE.Vector3(-0.7, 0.18, 0.36), 0.7],
    ['rgba(70,210,200,ALPHA)', new THREE.Vector3(0.2, -0.55, -0.8), 0.85],
  ];
  // All backdrop elements sit well beyond the asteroid shell (outer ~8200,
  // dome 9200) but inside the camera far plane (20000), so the field reads in
  // front of them and they hold still at "infinity".
  clouds.forEach(([tint, dir, op], i) => {
    addSprite(skybox, cloudTexture(tint), dir.clone().normalize(), 15000 - i * 400, 12000 + i * 1200, op);
  });

  // Distant sun: a tight white-hot core under a broad warm halo, both aligned
  // with the scene key light so glow agrees with where the light comes from.
  const sunHalo = radialTexture([
    [0, 'rgba(255,238,210,0.95)'],
    [0.18, 'rgba(255,180,110,0.55)'],
    [0.5, 'rgba(255,120,60,0.12)'],
    [1, 'rgba(255,120,60,0)'],
  ]);
  addSprite(skybox, sunHalo, SUN_DIR, 16500, 10200, 1);
  const sunCore = radialTexture([
    [0, 'rgba(255,252,240,1)'],
    [0.4, 'rgba(255,230,190,0.9)'],
    [1, 'rgba(255,200,150,0)'],
  ]);
  addSprite(skybox, sunCore, SUN_DIR, 16300, 1800, 1);

  // Planet: a lit disc with a terminator, placed off the racing axis as a
  // scale anchor. Multiply-ish via normal alpha so it reads solid, not glowy.
  const planetDir = new THREE.Vector3(0.78, -0.22, -0.58).normalize();
  addSprite(skybox, planetTexture(planetDir), planetDir, 15000, 3200, 1, THREE.NormalBlending);
}

function planetTexture(planetDir: THREE.Vector3, size = 512): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const rad = size * 0.46;

  // Light comes from the sun direction projected into the sprite plane.
  const lx = SUN_DIR.x - planetDir.x * SUN_DIR.dot(planetDir);
  const ly = SUN_DIR.y - planetDir.y * SUN_DIR.dot(planetDir);
  const len = Math.hypot(lx, ly) || 1;
  const gx = cx + (lx / len) * rad * 0.6;
  const gy = cy - (ly / len) * rad * 0.6;

  const grad = ctx.createRadialGradient(gx, gy, rad * 0.1, cx, cy, rad);
  grad.addColorStop(0, '#7a8da6');
  grad.addColorStop(0.5, '#3d4a63');
  grad.addColorStop(0.85, '#161d2e');
  grad.addColorStop(1, '#0a0e18');
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Faint rim light on the sunward edge.
  ctx.globalCompositeOperation = 'lighter';
  const rim = ctx.createRadialGradient(gx, gy, rad * 0.7, gx, gy, rad * 1.15);
  rim.addColorStop(0, 'rgba(255,220,180,0)');
  rim.addColorStop(0.8, 'rgba(255,210,170,0.18)');
  rim.addColorStop(1, 'rgba(255,210,170,0)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
