import { PageHeader } from "@/components/page-header";
import { MoneyCoachChat } from "@/components/ai/money-coach-chat";
import { buildMoneyCoachContext } from "@/lib/ai/context-builder";
import { buildDeterministicMoneyCoachFallback } from "@/lib/ai/money-coach";

export default async function AiCoachPage() {
  const context = await buildMoneyCoachContext({
    mode: "monthly_review",
    question: "What changed this month?",
  });
  const fallback = buildDeterministicMoneyCoachFallback(context, "monthly_review");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI money coach"
        title="AI Coach"
        description="Ask grounded finance questions. OpenAI is server-side only and receives redacted summaries from deterministic app calculations."
      />

      <MoneyCoachChat fallback={fallback} />
    </div>
  );
}
