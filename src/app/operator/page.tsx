import { OperatorPanel } from "@/features/ops/operator-panel";
export default function OperatorPage() {
  return (
    <main className="market-page mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="market-page-title">Operator tools</h1>
        <p className="text-sm text-muted-foreground">
          Authorized operators only. An access token is required for every action.
        </p>
      </div>
      <OperatorPanel />
    </main>
  );
}
