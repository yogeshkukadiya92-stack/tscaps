export class UploadSpeedEstimator {
  private samples: { time: number; bytes: number }[] = [];
  private lastMovement = 0;

  reset(): void { this.samples = []; this.lastMovement = 0; }

  sample(bytes: number, now: number): void {
    const previous = this.samples.at(-1);
    if (previous && (bytes < previous.bytes || now - previous.time >= 3000)) this.reset();
    if (!previous || bytes !== previous.bytes) this.lastMovement = now;
    this.samples.push({ time: now, bytes });
    while (this.samples.length > 2 && this.samples[1]!.time < now - 5000) this.samples.shift();
  }

  estimate(total: number, now: number): { speedBps: number | null; remainingSeconds: number | null } {
    const first = this.samples[0]; const last = this.samples.at(-1);
    if (!first || !last || now - this.lastMovement >= 3000) return { speedBps: null, remainingSeconds: null };
    const elapsed = (last.time - first.time) / 1000;
    const speedBps = elapsed >= 0.25 ? (last.bytes - first.bytes) / elapsed : 0;
    return speedBps > 0 ? { speedBps, remainingSeconds: Math.max(0, total - last.bytes) / speedBps }
      : { speedBps: null, remainingSeconds: null };
  }
}
