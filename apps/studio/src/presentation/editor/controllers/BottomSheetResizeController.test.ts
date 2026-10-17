import { describe, expect, it, vi } from 'vitest';
import { BottomSheetResizeController } from '@presentation/editor/controllers/BottomSheetResizeController';

describe('keyboard resizing of the mobile editor panel', () => {
  it('resizes by a small keyboard step without snapping back to the same stop', () => {
    const controller = new BottomSheetResizeController();
    controller.resizeTo(controller.pct + 0.05);
    expect(controller.pct).toBeCloseTo(0.65);
    expect(controller.isDragging).toBe(false);
  });

  it('keeps keyboard resizing within the current video-aware bounds', () => {
    const controller = new BottomSheetResizeController();
    controller.setMinPctFloor(0.7);
    controller.resizeTo(0);
    expect(controller.pct).toBe(0.7);
    controller.resizeTo(1);
    expect(controller.pct).toBe(controller.maxPct);
  });

  it('announces a changed minimum even when the current panel size still fits', () => {
    const controller = new BottomSheetResizeController();
    const change = vi.fn();
    controller.addEventListener('change', change);
    controller.setMinPctFloor(0.4);
    expect(change).toHaveBeenCalledOnce();
    expect(controller.minPct).toBe(0.4);
    expect(controller.pct).toBe(0.6);
  });
});
