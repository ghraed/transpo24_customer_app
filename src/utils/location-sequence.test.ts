import { test, expect } from '@jest/globals';
import { createLocationSequence, newerLocation } from './location-sequence';
test('reconnect replay, duplicated and out-of-order measurements cannot move a trip backward', () => {
 const accept = createLocationSequence();
 const sample = (tripId: string, seconds: number) => ({ tripId, recordedAt: new Date(seconds * 1000).toISOString() });
 expect([30,20,30,40,10,50].map(time => accept(sample('tripA',time)))).toEqual([true,false,false,true,false,true]);
 expect(accept(sample('tripB',10))).toBe(true);
 expect(accept({ tripId:'tripA', recordedAt:'invalid' })).toBe(false);
});
test('an older HTTP snapshot cannot overwrite a more recent socket fix', () => {
 const latest = { recordedAt:'2026-11-04T12:01:00Z', latitude:48 };
 expect(newerLocation(latest,{ recordedAt:'2026-11-04T12:00:00Z',latitude:47 })).toBe(latest);
 expect(newerLocation(latest,null)).toBe(latest);
});
