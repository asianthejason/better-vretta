export const TEACHER_PLANS = {
  basic: { name: "Essentials", annualAmount: 6000, monthlyLabel: "$5", classrooms: 2 },
  unlimited: { name: "Unlimited", annualAmount: 10000, monthlyLabel: "$8.33", classrooms: null },
} as const;
export type TeacherPlan = keyof typeof TEACHER_PLANS;
export function isTeacherPlan(value: unknown): value is TeacherPlan {
  return value === "basic" || value === "unlimited";
}
