import { describe, expect, it } from 'vitest';
import { UploadSpeedEstimator } from '@core/projects/services/UploadSpeedEstimator';

describe('UploadSpeedEstimator', () => {
  it('uses recent transferred bytes to estimate speed and remaining time', () => {
    const speed = new UploadSpeedEstimator();
    speed.sample(1000, 0);
    speed.sample(3000, 1000);
    expect(speed.estimate(11000, 1000)).toEqual({ speedBps: 2000, remainingSeconds: 4 });
  });
  it('hides estimates before enough samples and when a connection stalls', () => {
    const speed = new UploadSpeedEstimator();
    speed.sample(0, 0);
    expect(speed.estimate(10000, 0).speedBps).toBeNull();
    speed.sample(1000, 1000);
    expect(speed.estimate(10000, 4000)).toEqual({ speedBps: null, remainingSeconds: null });
    speed.sample(3000, 10000);
    expect(speed.estimate(10000, 10000).speedBps).toBeNull();
    speed.sample(5000, 11000);
    expect(speed.estimate(10000, 11000)).toEqual({ speedBps: 2000, remainingSeconds: 2.5 });
  });
  it('does not count old progress or offline time as transfer speed after Resume', () => {
    const speed = new UploadSpeedEstimator();
    speed.sample(1000, 0); speed.sample(3000, 1000);
    speed.reset();
    speed.sample(3000, 100000);
    expect(speed.estimate(10000, 100000).speedBps).toBeNull();
    speed.sample(4000, 101000);
    expect(speed.estimate(10000, 101000)).toEqual({ speedBps: 1000, remainingSeconds: 6 });
    speed.sample(2000, 102000);
    expect(speed.estimate(10000, 102000).speedBps).toBeNull();
  });
});
