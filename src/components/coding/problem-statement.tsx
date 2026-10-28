import { Markdown } from "@/components/shared/markdown";

export type StatementProblem = {
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  samples: { input: string; output: string; explanation: string | null }[];
};

function Sample({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <pre className="overflow-x-auto rounded-lg border bg-surface p-3 font-mono text-sm leading-normal">
        {text}
      </pre>
    </div>
  );
}

/** Statement, formats, constraints and sample tests. Shared by practice and mock tests. */
export function ProblemStatement({ problem }: { problem: StatementProblem }) {
  return (
    <div className="space-y-6">
      <Markdown>{problem.statement}</Markdown>
      <section className="space-y-2">
        <h3 className="font-semibold">Input</h3>
        <Markdown className="text-base">{problem.inputFormat}</Markdown>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Output</h3>
        <Markdown className="text-base">{problem.outputFormat}</Markdown>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Constraints</h3>
        <Markdown className="text-base">{problem.constraints}</Markdown>
      </section>
      {problem.samples.map((sample, i) => (
        <section key={i} className="space-y-3">
          <h3 className="font-semibold">Example {problem.samples.length > 1 ? i + 1 : ""}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Sample label="Input" text={sample.input} />
            <Sample label="Output" text={sample.output} />
          </div>
          {sample.explanation ? (
            <div className="text-sm text-muted-foreground">
              <Markdown className="text-sm">{sample.explanation}</Markdown>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
