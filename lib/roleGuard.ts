import { supabase } from "@/lib/supabaseClient";
import { clearPendingSignup, savePendingSignup } from "@/lib/pendingSignup";

export type AccountRole = "teacher" | "student";

export async function requireAccountRole(requiredRole: AccountRole) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.replace("/login");
    return null;
  }

  if (!user.email_confirmed_at) {
    const signupRole: AccountRole = user.user_metadata?.signup_intent === "teacher" ? "teacher" : "student";
    savePendingSignup({ role: signupRole, email: user.email || "your email" });
    window.location.replace(signupRole === "teacher" ? "/teacher" : "/student/dashboard");
    return null;
  }
  clearPendingSignup();

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
