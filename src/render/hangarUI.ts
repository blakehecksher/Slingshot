import * as THREE from 'three';
import {
  assemblePartList,
  listPartsForSlot,
  PART_SLOTS,
  type PartSlot,
} from './shipVisual';
import type { HangarState } from '../game/hangar';
import { computeModsFromParts } from '../game/upgrades';

// DOM hangar overlay. Lives in <body>; hidden by default. Has its own tiny
// Three.js renderer for the live preview so it doesn't interfere with the
// flight composer.

const SLOT_LABELS: Record<PartSlot, string> = {
  'hull': 'Hull',
  'cockpit': 'Cockpit',
  'engine-l': 'Port engine',
  'engine-r': 'Starboard engine',
  'wing-l': 'Port wing',
  'wing-r': 'Starboard wing',
  'topspine': 'Top spine',
  'cargo-bay': 'Cargo bay',
  'weapon-l': 'Port weapon',
  'weapon-r': 'Starboard weapon',
};

export interface HangarUIDeps {
  hangar: HangarState;
  getBank(): number;
  getOwned(): readonly string[];
  onApply(cost: number): void;
  onCancel(): void;
}

export class HangarUI {
  private root: HTMLDivElement;
  private slotsEl: HTMLDivElement;
  private statsEl: HTMLDivElement;
  private summaryEl: HTMLDivElement;
  private applyBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;
  private deps: HangarUIDeps;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rigGroup: THREE.Group;
  private currentMesh: THREE.Object3D | null = null;
  private rotateT = 0;

  // Focus state for keyboard / gamepad navigation.
  private focusSlot = 0;
  private focusOptionBySlot: Record<PartSlot, number> = {} as Record<PartSlot, number>;
  private prevPadButtons: boolean[] = [];
  private stickRepeatCooldown = 0;
  private slotRowEls: Record<PartSlot, HTMLDivElement> = {} as Record<PartSlot, HTMLDivElement>;
  // 'rows' = navigating slot list. 'options' = inside a slot's parts list.
  private navMode: 'rows' | 'options' = 'rows';
  // Snapshot taken on entering options so B can revert previewed change.
  private optionsEntry: { slot: PartSlot; partId: string | null } | null = null;

  constructor(deps: HangarUIDeps) {
    this.deps = deps;
    HangarUI.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'hangar-overlay';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);

    const title = document.createElement('div');
    title.className = 'hangar-title';
    title.innerHTML = `<b>HANGAR</b> <span class="hint">L-stick / D-pad / arrows: nav · A / Enter: open slot / confirm · B / Esc: back · Y: close · Start: apply · R: reset</span>`;
    this.root.appendChild(title);

    const main = document.createElement('div');
    main.className = 'hangar-main';
    this.root.appendChild(main);

    this.slotsEl = document.createElement('div');
    this.slotsEl.className = 'hangar-slots';
    main.appendChild(this.slotsEl);

    const center = document.createElement('div');
    center.className = 'hangar-center';
    main.appendChild(center);

    const previewWrap = document.createElement('div');
    previewWrap.className = 'hangar-preview';
    center.appendChild(previewWrap);

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = 360;
    previewCanvas.height = 280;
    previewWrap.appendChild(previewCanvas);

    this.statsEl = document.createElement('div');
    this.statsEl.className = 'hangar-stats';
    main.appendChild(this.statsEl);

    this.summaryEl = document.createElement('div');
    this.summaryEl.className = 'hangar-summary';
    this.root.appendChild(this.summaryEl);

    const actions = document.createElement('div');
    actions.className = 'hangar-actions';
    this.root.appendChild(actions);

    this.applyBtn = document.createElement('button');
    this.applyBtn.className = 'hangar-btn primary';
    this.applyBtn.textContent = 'APPLY';
    this.applyBtn.addEventListener('click', () => this.handleApply());
    actions.appendChild(this.applyBtn);

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.className = 'hangar-btn';
    this.cancelBtn.textContent = 'CANCEL';
    this.cancelBtn.addEventListener('click', () => this.deps.onCancel());
    actions.appendChild(this.cancelBtn);

    this.resetBtn = document.createElement('button');
    this.resetBtn.className = 'hangar-btn';
    this.resetBtn.textContent = 'RESET TO STRIPPED';
    this.resetBtn.addEventListener('click', () => {
      this.deps.hangar.resetToDefault();
      this.refresh();
    });
    actions.appendChild(this.resetBtn);

    // --- Mini preview renderer ---
    this.renderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x05080f, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05080f);
    this.camera = new THREE.PerspectiveCamera(40, previewCanvas.width / previewCanvas.height, 0.1, 200);
    this.camera.position.set(4.6, 2.2, 6.4);
    this.camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight(0xffd49a, 2.2);
    key.position.set(-3, 4, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x3affd6, 1.0);
    rim.position.set(3, 1, -4);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0x3a5a78, 0x10120e, 0.7));

    this.rigGroup = new THREE.Group();
    this.scene.add(this.rigGroup);

    let last = performance.now();
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (this.root.style.display !== 'none') {
        this.rotateT += dt;
        this.rigGroup.rotation.y = this.rotateT * 0.5;
        this.renderer.render(this.scene, this.camera);
        this.pollGamepad(dt);
      }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    window.addEventListener('keydown', (e) => this.handleKey(e));
  }

  private handleKey(e: KeyboardEvent): void {
    if (this.root.style.display === 'none') return;
    switch (e.code) {
      case 'ArrowUp':
        if (this.navMode === 'rows') this.moveSlot(-1);
        else this.cycleOption(-1);
        e.preventDefault();
        break;
      case 'ArrowDown':
        if (this.navMode === 'rows') this.moveSlot(1);
        else this.cycleOption(1);
        e.preventDefault();
        break;
      case 'ArrowLeft':
        if (this.navMode === 'options') this.cycleOption(-1);
        e.preventDefault();
        break;
      case 'ArrowRight':
        if (this.navMode === 'options') this.cycleOption(1);
        e.preventDefault();
        break;
      case 'Enter':
        if (this.navMode === 'rows') this.enterOptions();
        else this.confirmOption();
        e.preventDefault();
        break;
      case 'Escape':
      case 'Backspace':
        if (this.navMode === 'options') this.cancelOption();
        else this.deps.onCancel();
        e.preventDefault();
        break;
      case 'KeyY':
        // Y toggles hangar from outside; while open, also closes it.
        this.deps.onCancel();
        e.preventDefault();
        break;
      case 'KeyR':
        this.deps.hangar.resetToDefault();
        this.refresh();
        e.preventDefault();
        break;
      case 'KeyP':
        // Start key alt — apply.
        this.handleApply();
        e.preventDefault();
        break;
    }
  }

  private pollGamepad(dt: number): void {
    const pads = navigator.getGamepads?.() ?? [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected && p.mapping === 'standard') { pad = p; break; }
    }
    if (!pad) {
      for (const p of pads) {
        if (p && p.connected) { pad = p; break; }
      }
    }
    if (!pad) {
      this.prevPadButtons = [];
      return;
    }

    const btn = (i: number): boolean => pad!.buttons[i]?.pressed ?? false;
    const edge = (i: number): boolean => btn(i) && !this.prevPadButtons[i];

    const navUp = () => this.navMode === 'rows' ? this.moveSlot(-1) : this.cycleOption(-1);
    const navDown = () => this.navMode === 'rows' ? this.moveSlot(1) : this.cycleOption(1);
    const navLeft = () => this.navMode === 'options' && this.cycleOption(-1);
    const navRight = () => this.navMode === 'options' && this.cycleOption(1);

    // D-pad navigation (edge-triggered).
    if (edge(12)) navUp();
    if (edge(13)) navDown();
    if (edge(14)) navLeft();
    if (edge(15)) navRight();

    // L-stick navigation with repeat cooldown.
    this.stickRepeatCooldown = Math.max(0, this.stickRepeatCooldown - dt);
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const DZ = 0.55;
    if (this.stickRepeatCooldown <= 0) {
      if (ly < -DZ) { navUp(); this.stickRepeatCooldown = 0.18; }
      else if (ly > DZ) { navDown(); this.stickRepeatCooldown = 0.18; }
      else if (lx < -DZ) { navLeft(); this.stickRepeatCooldown = 0.18; }
      else if (lx > DZ) { navRight(); this.stickRepeatCooldown = 0.18; }
    }
    if (Math.abs(ly) < DZ * 0.6 && Math.abs(lx) < DZ * 0.6) {
      this.stickRepeatCooldown = 0;
    }

    // Buttons:
    //   A (b0)  — rows: enter options ; options: confirm (return to rows).
    //   B (b1)  — rows: close hangar  ; options: cancel/revert and return.
    //   Y (b3)  — close hangar (any mode).
    //   X (b2)  — reset to stripped.
    //   Start(9)— apply (commit costs).
    if (edge(0)) {
      if (this.navMode === 'rows') this.enterOptions();
      else this.confirmOption();
    }
    if (edge(1)) {
      if (this.navMode === 'options') this.cancelOption();
      else this.deps.onCancel();
    }
    // Y (b3): handled by main input loop (cmd.toggleHangar) so we ignore here
    // to avoid double-firing close-then-reopen on the same press.
    if (edge(2)) { this.deps.hangar.resetToDefault(); this.refresh(); }
    if (edge(9)) this.handleApply();

    this.prevPadButtons = pad.buttons.map((b) => b.pressed);
  }

  private enterOptions(): void {
    const slot = PART_SLOTS[this.focusSlot];
    const current = this.deps.hangar.workingParts.find((p) => p.slot === slot);
    this.optionsEntry = { slot, partId: current?.partId ?? null };
    this.navMode = 'options';
    this.refresh();
  }

  private confirmOption(): void {
    // Selection already previewed by cycleOption — just exit submenu.
    this.optionsEntry = null;
    this.navMode = 'rows';
    this.refresh();
  }

  private cancelOption(): void {
    if (this.optionsEntry) {
      this.deps.hangar.setSlot(this.optionsEntry.slot, this.optionsEntry.partId);
    }
    this.optionsEntry = null;
    this.navMode = 'rows';
    this.refresh();
  }

  private moveSlot(delta: number): void {
    const n = PART_SLOTS.length;
    this.focusSlot = (this.focusSlot + delta + n) % n;
    const slot = PART_SLOTS[this.focusSlot];
    const row = this.slotRowEls[slot];
    row?.scrollIntoView({ block: 'nearest' });
    this.applyFocusClasses();
  }

  private cycleOption(delta: number): void {
    const slot = PART_SLOTS[this.focusSlot];
    const opts = listPartsForSlot(slot);
    if (opts.length === 0) return;
    const cur = this.focusOptionBySlot[slot] ?? 0;
    const next = (cur + delta + opts.length) % opts.length;
    this.focusOptionBySlot[slot] = next;
    this.deps.hangar.setSlot(slot, opts[next].id);
    this.refresh();
    const row = this.slotRowEls[slot];
    const focused = row?.querySelector('.hangar-part.focused');
    focused?.scrollIntoView({ block: 'nearest' });
  }

  private applyFocusClasses(): void {
    for (let i = 0; i < PART_SLOTS.length; i++) {
      const row = this.slotRowEls[PART_SLOTS[i]];
      if (!row) continue;
      row.classList.toggle('focused-slot', i === this.focusSlot);
      row.classList.toggle('mode-options', i === this.focusSlot && this.navMode === 'options');
    }
  }

  show(): void {
    this.root.style.display = 'flex';
    // Initialize focused option per slot from current working manifest.
    for (const slot of PART_SLOTS) {
      const opts = listPartsForSlot(slot);
      const current = this.deps.hangar.workingParts.find((p) => p.slot === slot);
      const idx = current ? opts.findIndex((o) => o.id === current.partId) : -1;
      this.focusOptionBySlot[slot] = idx >= 0 ? idx : 0;
    }
    this.focusSlot = 0;
    this.navMode = 'rows';
    this.optionsEntry = null;
    this.refresh();
    this.applyFocusClasses();
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  isVisible(): boolean {
    return this.root.style.display !== 'none';
  }

  private handleApply(): void {
    const cost = this.deps.hangar.costToApply(this.deps.getOwned());
    if (!this.deps.hangar.isValid()) return;
    if (cost > this.deps.getBank()) return;
    this.deps.onApply(cost);
  }

  refresh(): void {
    this.renderSlots();
    this.renderPreview();
    this.renderStats();
    this.renderSummary();
  }

  private renderSlots(): void {
    const owned = new Set(this.deps.getOwned());
    this.slotsEl.innerHTML = '';
    this.slotRowEls = {} as Record<PartSlot, HTMLDivElement>;
    for (let slotIdx = 0; slotIdx < PART_SLOTS.length; slotIdx++) {
      const slot = PART_SLOTS[slotIdx];
      const row = document.createElement('div');
      row.className = 'hangar-slot';
      if (slotIdx === this.focusSlot) row.classList.add('focused-slot');
      this.slotRowEls[slot] = row;

      const head = document.createElement('div');
      head.className = 'hangar-slot-head';
      head.textContent = SLOT_LABELS[slot];
      row.appendChild(head);

      const list = document.createElement('div');
      list.className = 'hangar-slot-list';
      row.appendChild(list);

      const options = listPartsForSlot(slot);
      const current = this.deps.hangar.workingParts.find((p) => p.slot === slot);
      const focusedIdx = this.focusOptionBySlot[slot] ?? 0;
      options.forEach((part, optIdx) => {
        const btn = document.createElement('button');
        btn.className = 'hangar-part';
        if (current?.partId === part.id) btn.classList.add('selected');
        if (slotIdx === this.focusSlot && optIdx === focusedIdx) btn.classList.add('focused');
        const isOwned = owned.has(part.id) || part.cost === 0;
        btn.classList.toggle('locked', !isOwned);
        btn.innerHTML = `
          <span class="name">${part.displayName}</span>
          <span class="cost">${isOwned ? 'OWNED' : `${part.cost} kg`}</span>
          <span class="desc">${part.description}</span>
        `;
        btn.addEventListener('click', () => {
          this.focusSlot = slotIdx;
          this.focusOptionBySlot[slot] = optIdx;
          this.deps.hangar.setSlot(slot, part.id);
          this.refresh();
        });
        list.appendChild(btn);
      });
      this.slotsEl.appendChild(row);
    }
  }

  private renderPreview(): void {
    if (this.currentMesh) {
      this.rigGroup.remove(this.currentMesh);
      this.currentMesh.traverse?.((node) => {
        const m = node as THREE.Mesh;
        if (m.geometry) m.geometry.dispose?.();
      });
      this.currentMesh = null;
    }
    const built = assemblePartList(this.deps.hangar.workingParts);
    this.currentMesh = built.root;
    this.rigGroup.add(built.root);
  }

  private renderStats(): void {
    const mods = computeModsFromParts(this.deps.hangar.workingParts);
    const rows: Array<[string, string]> = [
      ['Thrust', `${(mods.thrustMult * 100).toFixed(0)}%`],
      ['Reverse', `${(mods.reverseMult * 100).toFixed(0)}%`],
      ['Agility', `${(mods.agilityMult * 100).toFixed(0)}%`],
      ['Hull HP', `${mods.hullHpMax}`],
      ['Cargo cap +', `${Math.round(mods.cargoCapAdd)} kg`],
      ['Energy max +', `${Math.round(mods.energyMaxAdd)}`],
      ['Mining bonus', `${(mods.miningCoefAdd * 1000).toFixed(2)}/k`],
      ['Weapon dmg', `${mods.weaponDamage.toFixed(0)}`],
      ['Weapon RoF', `${mods.weaponRof.toFixed(1)}/s`],
      ['Muzzle vel', `${mods.weaponMuzzle.toFixed(0)} m/s`],
    ];
    this.statsEl.innerHTML = rows.map(([k, v]) =>
      `<div class="stat-row"><span class="k">${k}</span><span class="v">${v}</span></div>`
    ).join('');
  }

  private renderSummary(): void {
    const cost = this.deps.hangar.costToApply(this.deps.getOwned());
    const bank = this.deps.getBank();
    const valid = this.deps.hangar.isValid();
    const affordable = cost <= bank;

    let warning = '';
    if (!valid) warning = '<span class="warn">missing required slot (hull / cockpit / engine-l / engine-r)</span>';
    else if (!affordable) warning = '<span class="warn">not enough bank</span>';

    this.summaryEl.innerHTML = `
      <div>BANK <b>${Math.round(bank)} kg</b></div>
      <div>COST <b>${cost} kg</b></div>
      ${warning}
    `;
    this.applyBtn.disabled = !valid || !affordable;
  }

  private static injectStyles(): void {
    if (document.getElementById('slingshot-hangar-styles')) return;
    const style = document.createElement('style');
    style.id = 'slingshot-hangar-styles';
    style.textContent = `
      .hangar-overlay {
        position: fixed; inset: 0;
        background: rgba(3, 6, 12, 0.94);
        z-index: 200;
        flex-direction: column;
        padding: 16px 24px 24px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color: #d8d2c2;
        overflow: hidden;
      }
      .hangar-title {
        font-size: 16px; letter-spacing: 0.12em;
        color: #eae0c8;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(208,100,36,0.4);
      }
      .hangar-title .hint {
        font-size: 11px; opacity: 0.55; letter-spacing: 0.05em; margin-left: 12px;
      }
      .hangar-main {
        flex: 1; display: grid;
        grid-template-columns: 320px 1fr 240px;
        gap: 16px; margin-top: 12px;
        min-height: 0;
      }
      .hangar-slots { overflow-y: auto; padding-right: 6px; }
      .hangar-slot {
        margin-bottom: 12px;
        background: rgba(8,10,16,0.6);
        border: 1px solid rgba(184,115,51,0.25);
        padding: 8px;
      }
      .hangar-slot-head {
        font-size: 12px; letter-spacing: 0.08em; color: #d06424;
        padding-bottom: 4px; margin-bottom: 6px;
        border-bottom: 1px solid rgba(208,100,36,0.2);
      }
      .hangar-slot-list { display: flex; flex-direction: column; gap: 4px; }
      .hangar-part {
        display: grid; grid-template-columns: 1fr auto; grid-template-areas: "name cost" "desc desc";
        text-align: left; gap: 2px 8px;
        background: rgba(20,24,32,0.6); color: #d8d2c2;
        border: 1px solid rgba(184,115,51,0.18);
        padding: 6px 8px; cursor: pointer;
        font-family: inherit; font-size: 11px;
      }
      .hangar-part .name { grid-area: name; color: #eae0c8; }
      .hangar-part .cost { grid-area: cost; color: #6dd6c8; }
      .hangar-part.locked .cost { color: #d06424; }
      .hangar-part .desc { grid-area: desc; opacity: 0.65; font-size: 10px; }
      .hangar-part:hover { background: rgba(40,46,58,0.8); }
      .hangar-part.selected { background: rgba(64,32,16,0.85); border-color: #d06424; }
      .hangar-part.focused { outline: 2px solid #6dd6c8; outline-offset: -2px; }
      .hangar-slot.focused-slot { border-color: #6dd6c8; box-shadow: 0 0 0 1px rgba(109,214,200,0.25); }
      .hangar-slot.mode-options { border-color: #ffd06a; box-shadow: 0 0 0 2px rgba(255,208,106,0.45); }
      .hangar-slot.mode-options .hangar-part.focused { outline-color: #ffd06a; }
      .hangar-center { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
      .hangar-preview {
        background: rgba(5,8,15,0.7);
        border: 1px solid rgba(184,115,51,0.3);
        padding: 6px;
      }
      .hangar-preview canvas { display: block; }
      .hangar-stats {
        background: rgba(8,10,16,0.6);
        border: 1px solid rgba(184,115,51,0.25);
        padding: 10px 12px; font-size: 12px;
        display: flex; flex-direction: column; gap: 4px;
        height: fit-content;
      }
      .stat-row { display: flex; justify-content: space-between; }
      .stat-row .k { color: #b89464; }
      .stat-row .v { color: #eae0c8; }
      .hangar-summary {
        margin-top: 12px;
        font-size: 13px; color: #eae0c8;
        display: flex; gap: 24px; align-items: center;
      }
      .hangar-summary .warn { color: #ff5a4a; font-weight: bold; }
      .hangar-actions { display: flex; gap: 12px; margin-top: 8px; }
      .hangar-btn {
        font-family: inherit; font-size: 12px; letter-spacing: 0.08em;
        padding: 8px 16px;
        background: rgba(20,24,32,0.8); color: #eae0c8;
        border: 1px solid rgba(184,115,51,0.4); cursor: pointer;
      }
      .hangar-btn:hover:not(:disabled) { background: rgba(40,46,58,0.95); }
      .hangar-btn.primary { background: rgba(64,32,16,0.9); border-color: #d06424; color: #ffd6a0; }
      .hangar-btn.primary:hover:not(:disabled) { background: rgba(96,48,24,1); }
      .hangar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }
}
