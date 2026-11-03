export const TEACHER_PLANS = {
  basic: { name: "Essentials", annualAmount: 999900, monthlyLabel: "$833.25", classrooms: 2 },
  unlimited: { name: "Unlimited", annualAmount: 9999900, monthlyLabel: "$8,333.25", classrooms: null },
} as const;
export type TeacherPlan = keyof typeof TEACHER_PLANS;
export function isTeacherPlan(value: unknown): value is TeacherPlan {
  return value === "basic" || value === "unlimited";
}
