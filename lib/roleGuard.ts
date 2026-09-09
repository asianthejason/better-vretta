import { supabase } from "@/lib/supabaseClient";

export type AccountRole = "teacher" | "student";

export async function requireAccountRole(requiredRole: AccountRole) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.replace("/login");
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    await supabase.auth.signOut();
    window.location.replace("/login");
    return null;
  }

  if (profile.role !== requiredRole) {
    window.location.replace(profile.role === "teacher" ? "/teacher" : "/student/dashboard");
    return null;
  }

  if (requiredRole === "teacher") {
    const { data: plan, error: planError } = await supabase.rpc("teacher_plan_status");
    if (planError || !plan?.active) {
      window.location.replace("/teacher/billing");
      return null;
    }
  }
  return user;
}
