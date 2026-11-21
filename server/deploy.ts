/**
 * One deploy, in one place.
 *
 * The MCP `deploy` tool and the button at the bottom of Server diagnostics >
 * Logs both call this, so there is one script rather than two copies that
 * drift apart. Jacob asked for the button ("let me run the deploy command at
 * the bottom of the logs tab") because asking an agent for a rebuild and
 * answering "yes" three times is silly ceremony for one command.
 *
 * Nothing here takes arguments, on purpose: fetch, fast-forward the branch we
 * are on, apply the schema, build, then restart. A deploy that can be told to
 * run anything is a remote shell with a friendly name.
 */
import { exec, execFile } from 'child_process';

export type DeployStep = { cmd: string; code: number; tail: string };

export type DeployResult = {
  ok: boolean;
  dir: string;
  branch?: string;
  steps: DeployStep[];
  stoppedAt?: string;
  restart?: string;
  note: string;
};

let deploying = false;

/** True while a deploy is mid-flight, so two people pressing the button is safe. */
export function deployRunning(): boolean {
  return deploying;
}

function deployDir(): string {
  return (process.env.DEPLOY_DIR ?? process.cwd()).trim();
}

function restartCommand(): string {
  return (process.env.DEPLOY_RESTART ?? 'systemctl restart ashtec-crew-hub').trim();
}

/** Run one step for the deploy, never throwing: the exit code is the answer. */
function runStep(cmd: string, argv: string[], cwd: string) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    execFile(cmd, argv, { cwd, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : 1) : 0;
      resolve({ code, out: `${stdout ?? ''}${stderr ?? ''}`.trim() });
    });
  });
}

/** The last few lines of a command's output, which is all anyone reads in a reply. */
function tailLines(out: string, n: number) {
  const lines = out.split('\n').filter((l) => l.trim() !== '');
  return lines.slice(-n).join('\n');
}

export async function runDeploy(): Promise<DeployResult> {
  if (deploying) throw new Error('A deploy is already running. Give it a minute.');
  deploying = true;
  try {
    const dir = deployDir();
    const restart = restartCommand();
    const steps: DeployStep[] = [];
    const stop = (cmd: string): DeployResult => ({
      ok: false,
      dir,
      stoppedAt: cmd,
      steps,
      note: 'Nothing was restarted. Fix the step above and run deploy again.',
    });

    const fetched = await runStep('git', ['fetch', '--all', '--prune'], dir);
    steps.push({ cmd: 'git fetch --all --prune', code: fetched.code, tail: tailLines(fetched.out, 25) });
    if (fetched.code !== 0) return stop('git fetch --all --prune');

    // Merge origin/<the branch we are on> rather than @{u}: a checkout made by
    // hand often has no upstream set, and that is not a reason to refuse.
    const head = await runStep('git', ['rev-parse', '--abbrev-ref', 'HEAD'], dir);
    const branch = head.out.trim();
    if (head.code !== 0 || !branch || branch === 'HEAD') {
      steps.push({ cmd: 'git rev-parse --abbrev-ref HEAD', code: head.code, tail: tailLines(head.out, 25) });
      return stop('git rev-parse --abbrev-ref HEAD');
    }
    // Fetch the branch by name so FETCH_HEAD is set: a clone that only tracks
    // main has no origin/<branch> ref to merge.
    const plan: [string, string[]][] = [
      ['git', ['fetch', 'origin', branch]],
      ['git', ['merge', '--ff-only', 'FETCH_HEAD']],
      ['npm', ['run', 'schema']],
      ['npm', ['run', 'build']],
    ];
    for (const [cmd, argv] of plan) {
      const r = await runStep(cmd, argv, dir);
      steps.push({ cmd: `${cmd} ${argv.join(' ')}`, code: r.code, tail: tailLines(r.out, 25) });
      if (r.code !== 0) return stop(`${cmd} ${argv.join(' ')}`);
    }
    // Answer first, then restart: the restart kills this process, so doing it
    // inline would drop the reply whoever is waiting for it.
    setTimeout(() => {
      exec(restart, { cwd: dir }, () => {});
    }, 1500);
    return {
      ok: true,
      dir,
      branch,
      steps,
      restart: `${restart} in a moment`,
      note: 'Check /healthz in about 20 seconds. The endpoint count should match the build you just made.',
    };
  } finally {
    deploying = false;
  }
}
