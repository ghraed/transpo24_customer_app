import { RequestProgress } from './request-progress';

export function MotorcycleProgress({ current }: { current: 1 | 2 | 3 | 4 | 5 | 6 }) {
  return <RequestProgress current={current} total={6} />;
}
