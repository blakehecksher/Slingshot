import * as THREE from 'three';
import type { RaceCourse, RaceGate } from '../game/racing/courses';

const MIN_SAMPLES = 80;
const SAMPLES_PER_LEG = 36;
const ASTEROID_GUIDE_CLEARANCE = 72;
const ASTEROID_GUIDE_RADIUS_FRAC = 0.52;
const ASTEROID_GUIDE_MAX_RADIUS_FRAC = 0.78;
const ASTEROID_GUIDE_SHOULDER_FRAC = 0.28;
const EPSILON = 0.0001;

export class CourseGuideLine {
  private line: THREE.Line;
  private material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    // Flowing energy ribbon: a dash pattern scrolls along the racing line
    // toward the next gate, giving the player a living "this way" cue instead
    // of a static thread. Additive + bloom makes it glow.
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x56e0c7) },
        uBase: { value: 0.16 },
      },
      vertexShader: /* glsl */ `
        attribute float aProgress;
        varying float vProgress;
        void main() {
          vProgress = aProgress;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uBase;
        varying float vProgress;
        void main() {
          // Repeating pulses sliding forward along the route.
          float flow = fract(vProgress * 26.0 - uTime * 0.9);
          float pulse = smoothstep(0.0, 0.12, flow) * smoothstep(1.0, 0.55, flow);
          float alpha = uBase + pulse * 0.7;
          gl_FragColor = vec4(uColor * (0.7 + pulse * 1.6), alpha);
        }
      `,
    });

    this.line = new THREE.Line(new THREE.BufferGeometry(), this.material);
    this.line.frustumCulled = false;
    this.line.renderOrder = 1;
    scene.add(this.line);
  }

  setCourse(course: RaceCourse): void {
    const points = buildGuidePoints(course);
    if (points.length < 2) {
      this.line.geometry.setDrawRange(0, 0);
      return;
    }

    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
    const sampleCount = Math.max(MIN_SAMPLES, (points.length - 1) * SAMPLES_PER_LEG);
    const sampled = curve.getPoints(sampleCount);
    const geometry = new THREE.BufferGeometry().setFromPoints(sampled);

    // Per-vertex arc fraction (0 at start, 1 at finish) drives the flow.
    const progress = new Float32Array(sampled.length);
    for (let i = 0; i < sampled.length; i++) progress[i] = i / (sampled.length - 1);
    geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));

    this.line.geometry.dispose();
    this.line.geometry = geometry;
    this.line.geometry.computeBoundingSphere();
  }

  update(dt: number): void {
    this.material.uniforms.uTime.value += dt;
  }

  setVisible(visible: boolean): void {
    this.line.visible = visible;
  }
}

function buildGuidePoints(course: RaceCourse): THREE.Vector3[] {
  const routePoints = [course.startPosition, ...course.gates.map((gate) => gate.position)];
  const points = [course.startPosition.clone()];

  course.gates.forEach((gate, index) => {
    if (gate.kind !== 'asteroid') {
      points.push(gate.position.clone());
      return;
    }

    const previous = routePoints[index];
    const next = routePoints[index + 2] ?? gate.position;
    points.push(...asteroidFlybyPoints(gate, previous, next));
  });

  return points;
}

function asteroidFlybyPoints(gate: RaceGate, previous: THREE.Vector3, next: THREE.Vector3): THREE.Vector3[] {
  const offsetDirection = flybyOffsetDirection(gate.position, previous, next);
  const passDistance = asteroidPassDistance(gate);
  const passPoint = gate.position.clone().addScaledVector(offsetDirection, passDistance);
  const tangent = flybyTangent(gate.position, previous, next, offsetDirection);
  const shoulder = Math.min(gate.radius * ASTEROID_GUIDE_SHOULDER_FRAC, passDistance * 0.55);

  return [
    passPoint.clone().addScaledVector(tangent, -shoulder),
    passPoint,
    passPoint.clone().addScaledVector(tangent, shoulder),
  ];
}

function asteroidPassDistance(gate: RaceGate): number {
  const preferred = Math.max(
    (gate.asteroidRadius ?? 0) + ASTEROID_GUIDE_CLEARANCE,
    gate.radius * ASTEROID_GUIDE_RADIUS_FRAC,
  );
  return Math.min(preferred, gate.radius * ASTEROID_GUIDE_MAX_RADIUS_FRAC);
}

function flybyOffsetDirection(center: THREE.Vector3, previous: THREE.Vector3, next: THREE.Vector3): THREE.Vector3 {
  const incoming = center.clone().sub(previous);
  const outgoing = next.clone().sub(center);
  if (incoming.lengthSq() <= EPSILON || outgoing.lengthSq() <= EPSILON) {
    return fallbackOffsetDirection(center, incoming);
  }

  incoming.normalize();
  outgoing.normalize();

  const desiredDeflection = outgoing.clone().sub(incoming);
  const lateral = desiredDeflection.addScaledVector(incoming, -desiredDeflection.dot(incoming));
  if (lateral.lengthSq() > EPSILON) return lateral.normalize().negate();

  return fallbackOffsetDirection(center, incoming);
}

function fallbackOffsetDirection(center: THREE.Vector3, incoming: THREE.Vector3): THREE.Vector3 {
  const travel = incoming.lengthSq() > EPSILON ? incoming.clone().normalize() : new THREE.Vector3(0, 0, -1);
  const radial = center.clone().addScaledVector(travel, -center.dot(travel));
  if (radial.lengthSq() > EPSILON) return radial.normalize();

  const reference = Math.abs(travel.dot(new THREE.Vector3(0, 1, 0))) > 0.92
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  return reference.cross(travel).normalize();
}

function flybyTangent(center: THREE.Vector3, previous: THREE.Vector3, next: THREE.Vector3, offsetDirection: THREE.Vector3): THREE.Vector3 {
  const tangent = next.clone().sub(previous);
  tangent.addScaledVector(offsetDirection, -tangent.dot(offsetDirection));
  if (tangent.lengthSq() > EPSILON) return tangent.normalize();

  const incoming = center.clone().sub(previous);
  incoming.addScaledVector(offsetDirection, -incoming.dot(offsetDirection));
  if (incoming.lengthSq() > EPSILON) return incoming.normalize();

  return fallbackOffsetDirection(center, offsetDirection).cross(offsetDirection).normalize();
}
