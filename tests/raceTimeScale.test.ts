import assert from 'node:assert/strict';
import { RACE_TIME_TUNING, raceTimeScaleForGravity } from '../src/game/racing/raceManager.ts';

const { DEAD_IRON_MIN_TIME_SCALE, DEAD_IRON_TIME_PULL_REF, WEAK_DEAD_IRON_TIME_MULT } = RACE_TIME_TUNING;

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 0.000001, `expected ${actual} to be near ${expected}`);
}

near(raceTimeScaleForGravity(null, DEAD_IRON_TIME_PULL_REF), 1);
near(raceTimeScaleForGravity('ordinary', DEAD_IRON_TIME_PULL_REF), 1);
near(raceTimeScaleForGravity('strong', 0), 1);

const farStrong = raceTimeScaleForGravity('strong', DEAD_IRON_TIME_PULL_REF * 0.25);
const closeStrong = raceTimeScaleForGravity('strong', DEAD_IRON_TIME_PULL_REF);
assert.ok(farStrong < 1, 'strong Dead Iron should slow scored time once pull is present');
assert.ok(closeStrong < farStrong, 'stronger pull should earn a lower scored-time scale');
near(closeStrong, DEAD_IRON_MIN_TIME_SCALE);

const weakAtFullPull = raceTimeScaleForGravity('weak', DEAD_IRON_TIME_PULL_REF);
near(weakAtFullPull, 1 - (1 - DEAD_IRON_MIN_TIME_SCALE) * WEAK_DEAD_IRON_TIME_MULT);
assert.ok(weakAtFullPull > closeStrong, 'weak Dead Iron should reward less time slow than strong Dead Iron');

console.log('race time dilation checks passed');
