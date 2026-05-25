// Stub module for historical data loading
// Will be replaced with Supabase integration later

export interface DailyPerformance {
  date: string;
  morning: {
    picking: { quantity: number; tos: number };
    packing: { quantity: number; hus: number };
  };
  evening: {
    picking: { quantity: number; tos: number };
    packing: { quantity: number; hus: number };
  };
  total: { picking: number; packing: number };
}

export function loadDailyPerformance(_date: string): DailyPerformance[] {
  return [];
}

export function loadWeeklyPerformance(_weekOffset: number): DailyPerformance[] {
  return [];
}

export function loadMonthlyPerformance(_monthOffset: number): DailyPerformance[] {
  return [];
}
