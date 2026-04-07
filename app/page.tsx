import { Header } from "@/components/layout/header";
import { AnalysisForm } from "@/components/analysis/AnalysisForm";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 py-16">
        <div className="flex flex-col items-center gap-4 text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">
            Analyze your landing page against competitors
          </h1>
          <p className="max-w-lg text-lg text-muted-foreground">
            Paste your SaaS landing page URL and get instant, evidence-based
            competitive design intelligence.
          </p>
        </div>
        <AnalysisForm />
      </main>
    </>
  );
}
