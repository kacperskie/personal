import { Bot, LockKeyhole, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const promptExamples = [
  "What changed this month?",
  "Can I afford a GBP 300 purchase this weekend?",
  "Which subscriptions should I review first?",
  "Why is eating out ahead of pace?",
];

export default function AiCoachPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mock coach"
        title="AI Coach"
        description="Phase 1 placeholder for grounded explanations. No OpenAI API calls are made yet."
      />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.62fr)_minmax(320px,0.38fr)]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-semibold text-ink">Money coach preview</h2>
              <p className="text-sm text-ink/60">Uses mock data and fixed example responses.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="max-w-2xl rounded-lg bg-paper p-4">
              <p className="text-sm font-semibold text-ink">User</p>
              <p className="mt-1 text-sm text-ink/70">What changed this month?</p>
            </div>
            <div className="ml-auto max-w-3xl rounded-lg border border-teal/20 bg-teal/5 p-4">
              <p className="text-sm font-semibold text-teal">AI coach mock response</p>
              <p className="mt-2 text-sm leading-6 text-ink/75">
                Cash remains above the minimum buffer after upcoming bills and planned
                savings. The main change is flexible spending: eating out and personal
                purchases are ahead of pace. The safest next action is to review recent
                discretionary transactions before changing any budget.
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <input
              aria-label="Ask AI coach"
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-3 text-sm outline-none"
              placeholder="Ask a finance question"
              disabled
            />
            <button
              className="rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled
            >
              Ask
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
            <Sparkles className="h-5 w-5 text-saffron" aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-ink">Example prompts</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {promptExamples.map((prompt) => (
                <span
                  key={prompt}
                  className="rounded-full border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink/70"
                >
                  {prompt}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
            <LockKeyhole className="h-5 w-5 text-moss" aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-ink">Phase 1 boundaries</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              The live AI integration, tool gateway, audit logging, and approval flows are
              intentionally not implemented in this phase.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
