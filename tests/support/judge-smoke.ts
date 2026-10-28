// Manual smoke test for the local judge: `npx tsx tests/support/judge-smoke.ts`
import { createLocalJudge } from "@/server/integrations/judge/local";

const programs = {
  c: '#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}',
  cpp: '#include <bits/stdc++.h>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
  java: "import java.util.*;\npublic class Main{public static void main(String[] x){Scanner s=new Scanner(System.in);System.out.println(s.nextLong()+s.nextLong());}}",
  python: "a, b = map(int, input().split())\nprint(a + b)",
  javascript:
    "const [a,b]=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);console.log(a+b);",
} as const;

async function main() {
  const judge = createLocalJudge();
  const limits = { timeLimitMs: 1000, memoryLimitMb: 256 };
  for (const [language, code] of Object.entries(programs)) {
    const compiled = await judge.compile(language as keyof typeof programs, code, limits);
    if (!compiled.ok) {
      console.log(language, "COMPILE FAILED", compiled.error);
      continue;
    }
    const result = await compiled.program.run("2 40\n");
    console.log(
      language.padEnd(11),
      result.status,
      JSON.stringify(result.stdout),
      `${result.timeMs}ms`,
    );
    await compiled.program.dispose();
  }

  const broken = await judge.compile("cpp", "int main( { return 0; }", limits);
  console.log("compile error detected:", !broken.ok);
  const loop = await judge.compile("python", "while True: pass", limits);
  if (loop.ok) {
    console.log("infinite loop:", (await loop.program.run("")).status);
    await loop.program.dispose();
  }
  const crash = await judge.compile("python", "raise SystemExit(3)", limits);
  if (crash.ok) {
    console.log("crash:", (await crash.program.run("")).status);
    await crash.program.dispose();
  }
}

void main();
