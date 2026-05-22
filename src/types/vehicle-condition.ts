export type VehicleCondition =
  | 'RUNNING'
  | 'NEEDS_JUMP_START'
  | 'NEEDS_WINCH'
  | 'NEEDS_CRANE'
  | 'MISSING_WHEELS';

export interface VehicleConditionOption {
  value: VehicleCondition;
  label: string;
  description: string;
}

export interface VehicleConditionFormValues {
  condition: VehicleCondition | null;
  notes?: string;
}
