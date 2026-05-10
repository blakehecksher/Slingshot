import * as THREE from 'three';

// HUD reticle:
//  - center crosshair (forward aim direction)
//  - lock target box (drawn around locked enemy)
//  - lead indicator (where to aim so a fired bullet meets the moving target)
//
// All elements are absolute-positioned DOM children of `host`. World→screen
// projection uses Three's standard Vector3.project(camera) → NDC.

export interface LeadTarget {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

const tmpRel = new THREE.Vector3();
const tmpRelV = new THREE.Vector3();
const tmpProj = new THREE.Vector3();

/** Solve quadratic intercept time. Returns the smallest non-negative root,
 *  or null if no intercept. */
export function interceptTime(
  shipPos: THREE.Vector3,
  shipVel: THREE.Vector3,
  targetPos: THREE.Vector3,
  targetVel: THREE.Vector3,
  muzzleSpeed: number,
): number | null {
  tmpRel.copy(targetPos).sub(shipPos);
  tmpRelV.copy(targetVel).sub(shipVel);
  const a = tmpRelV.dot(tmpRelV) - muzzleSpeed * muzzleSpeed;
  const b = 2 * tmpRel.dot(tmpRelV);
  const c = tmpRel.dot(tmpRel);

  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return null;
    const t = -c / b;
    return t > 0 ? t : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  // Prefer the smaller positive root.
  const candidates = [t1, t2].filter((t) => t > 0).sort((x, y) => x - y);
  return candidates.length > 0 ? candidates[0] : null;
}

export class ReticleHUD {
  private root: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private lockBox: HTMLDivElement;
  private lead: HTMLDivElement;
  private label: HTMLDivElement;

  constructor() {
    ReticleHUD.injectStyles();
    this.root = document.createElement('div');
    this.root.id = 'reticle-root';
    document.body.appendChild(this.root);

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'reticle-crosshair';
    this.crosshair.innerHTML = `
      <span class="dot"></span>
      <span class="bar t"></span>
      <span class="bar b"></span>
      <span class="bar l"></span>
      <span class="bar r"></span>
    `;
    this.root.appendChild(this.crosshair);

    this.lockBox = document.createElement('div');
    this.lockBox.className = 'reticle-lockbox';
    this.lockBox.style.display = 'none';
    this.root.appendChild(this.lockBox);

    this.lead = document.createElement('div');
    this.lead.className = 'reticle-lead';
    this.lead.style.display = 'none';
    this.root.appendChild(this.lead);

    this.label = document.createElement('div');
    this.label.className = 'reticle-label';
    this.label.textContent = '';
    this.root.appendChild(this.label);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  setLabel(text: string): void {
    this.label.textContent = text;
  }

  /** Project a world position to screen pixels. Returns null if behind camera. */
  private project(world: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } | null {
    tmpProj.copy(world).project(camera);
    if (tmpProj.z > 1 || tmpProj.z < -1) return null;
    const x = (tmpProj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-tmpProj.y * 0.5 + 0.5) * window.innerHeight;
    return { x, y };
  }

  /** Update lock box + lead indicator. Pass null target to hide both. */
  update(
    camera: THREE.Camera,
    target: LeadTarget | null,
    shipPos: THREE.Vector3,
    shipVel: THREE.Vector3,
    muzzleSpeed: number,
  ): void {
    if (!target || muzzleSpeed <= 0) {
      this.lockBox.style.display = 'none';
      this.lead.style.display = 'none';
      return;
    }

    const targetScreen = this.project(target.position, camera);
    if (targetScreen) {
      this.lockBox.style.display = 'block';
      this.lockBox.style.left = `${targetScreen.x}px`;
      this.lockBox.style.top = `${targetScreen.y}px`;
    } else {
      this.lockBox.style.display = 'none';
    }

    const t = interceptTime(shipPos, shipVel, target.position, target.velocity, muzzleSpeed);
    if (t === null) {
      this.lead.style.display = 'none';
      return;
    }
    const leadWorld = target.position.clone().addScaledVector(target.velocity, t);
    const leadScreen = this.project(leadWorld, camera);
    if (!leadScreen) {
      this.lead.style.display = 'none';
      return;
    }
    this.lead.style.display = 'block';
    this.lead.style.left = `${leadScreen.x}px`;
    this.lead.style.top = `${leadScreen.y}px`;
  }

  private static injectStyles(): void {
    if (document.getElementById('slingshot-reticle-styles')) return;
    const style = document.createElement('style');
    style.id = 'slingshot-reticle-styles';
    style.textContent = `
      #reticle-root {
        position: fixed; inset: 0;
        pointer-events: none;
        z-index: 80;
      }
      .reticle-crosshair {
        position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        width: 36px; height: 36px;
        opacity: 0.78;
      }
      .reticle-crosshair .dot {
        position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        width: 3px; height: 3px;
        background: #6dd6c8;
        border-radius: 50%;
      }
      .reticle-crosshair .bar {
        position: absolute;
        background: #6dd6c8;
      }
      .reticle-crosshair .bar.t { left: 50%; top: 0; width: 1px; height: 8px; transform: translateX(-50%); }
      .reticle-crosshair .bar.b { left: 50%; bottom: 0; width: 1px; height: 8px; transform: translateX(-50%); }
      .reticle-crosshair .bar.l { top: 50%; left: 0; width: 8px; height: 1px; transform: translateY(-50%); }
      .reticle-crosshair .bar.r { top: 50%; right: 0; width: 8px; height: 1px; transform: translateY(-50%); }

      .reticle-lockbox {
        position: absolute;
        width: 56px; height: 56px;
        margin-left: -28px; margin-top: -28px;
        border: 1px solid #ff5a4a;
        box-sizing: border-box;
      }
      .reticle-lockbox::before, .reticle-lockbox::after {
        content: ''; position: absolute;
        width: 10px; height: 10px;
        border: 2px solid #ff5a4a;
        border-right: none; border-bottom: none;
      }
      .reticle-lockbox::before { left: -3px; top: -3px; }
      .reticle-lockbox::after { right: -3px; bottom: -3px; transform: rotate(180deg); }

      .reticle-lead {
        position: absolute;
        width: 22px; height: 22px;
        margin-left: -11px; margin-top: -11px;
        border: 2px solid #ffd06a;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(255,208,106,0.55);
      }
      .reticle-lead::after {
        content: ''; position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        width: 4px; height: 4px;
        background: #ffd06a; border-radius: 50%;
      }

      .reticle-label {
        position: absolute;
        left: 50%; top: calc(50% + 28px);
        transform: translateX(-50%);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px; letter-spacing: 0.08em;
        color: #ff5a4a; opacity: 0.85;
        text-shadow: 0 1px 2px rgba(0,0,0,0.85);
      }
    `;
    document.head.appendChild(style);
  }
}
