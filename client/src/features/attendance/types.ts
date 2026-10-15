export type AttendanceStatus =
  | 'checked_in'
  | 'checked_out'
  | 'missing_checkout'
  | 'corrected'
  | 'on_leave'
  | 'holiday'
  | 'absent';

export interface DayHeatmapData {
  date: string;
  totalMinutes: number;
  totalHours: number;
  activeEmployees: number;
  checkedInCount: number;
  missingCheckoutCount: number;
  workLogCount: number;
  level: 0 | 1 | 2 | 3 | 4;
  checkInAt?: string;
  checkOutAt?: string;
  status?: AttendanceStatus;
  workLog?: {
    notes?: string;
    customTasks?: string[];
    selectedTasks?: { title: string; task?: string }[];
    submittedAt?: string;
  };
  notes?: string;
  recordId?: string;
}

export interface HeatmapSummary {
  totalLoggedMinutes: number;
  totalLoggedHours: number;
  activeWorkingDays: number;
  averageHoursPerDay: number;
  missingCheckouts: number;
  presentToday: number;
  currentlyCheckedIn?: number;
  activeEmployeesCount: number;
  attendanceRate: number;
  monthlyStats: {
    month: string;
    monthIndex: number;
    minutes: number;
    hours: number;
    days: number;
  }[];
}

export interface HeatmapResponse {
  year: number;
  days: Record<string, DayHeatmapData>;
  summary: HeatmapSummary;
}

export interface SparklineDay {
  date: string;
  minutes: number;
  level: number;
  status: string;
}

export interface EmployeeDirectoryItem {
  user: {
    _id: string;
    name: string;
    email: string;
    role: string;
    department?: string;
    designation?: string;
    avatar?: string;
    employeeId?: string;
  };
  todayStatus: AttendanceStatus;
  todayMinutes: number;
  todayCheckIn?: string;
  todayCheckOut?: string;
  periodMinutes: number;
  periodHours: number;
  activeDays: number;
  missingCheckouts: number;
  attendanceRate: number;
  recentSparkline: SparklineDay[];
}

export interface DayDetailRecord {
  _id: string;
  user: {
    _id: string;
    name: string;
    email: string;
    role: string;
    department?: string;
    designation?: string;
    avatar?: string;
    employeeId?: string;
  };
  date: string;
  checkInAt?: string;
  checkOutAt?: string;
  durationMinutes: number;
  status: AttendanceStatus;
  workLog?: {
    notes?: string;
    customTasks?: string[];
    selectedTasks?: { title: string; task?: string }[];
    submittedAt?: string;
  };
  notes?: string;
  corrections?: {
    by: { name?: string };
    at: string;
    reason: string;
  }[];
}
