import { teacherQuote } from "@/lib/teacherPricing";

export async function POST(request: Request) {
  try {
    const { couponCode = "", plan = "basic" } = await request.json();
    return Response.json(teacherQuote(couponCode, plan), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "That coupon code is not valid." }, { status: 400 });
  }
}
