import { describe, expect, it } from 'vitest';
import { readAiEditPlan } from '@core/creative/AiEditClient';
const plan = { style: 'clean', preset: 'podcast', options: { pauses: true, zooms: false, polish: true, captions: true }, summary: 'Keep a natural pace.', limitations: ['No music added.'] };
describe('AI plan validation', () => {
  it('accepts only supported editable operations', () => expect(readAiEditPlan(plan)).toEqual(plan));
  it.each([null, { ...plan, style: 'invented' }, { ...plan, preset: 'unknown' }, { ...plan, options: { ...plan.options, pauses: 'false' } }, { ...plan, summary: '' }, { ...plan, limitations: ['a'.repeat(301)] }])('rejects invalid plans without editing state', value => expect(() => readAiEditPlan(value)).toThrow('invalid edit plan'));
});
