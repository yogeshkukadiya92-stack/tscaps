/** MediaPipe 0.10.14 checks `ontouchend in self.document` when reading
 * float masks on Mac. Workers have no document, so supply only the empty
 * feature-detection target. Do not advertise touch support: desktop Mac
 * workers must keep using the single-channel mask readback path.
 */
export class MediaPipeWorkerEnvironment {
  install(): void {
    const scope = self as unknown as { document?: object };
    scope.document ??= {};
  }
}
