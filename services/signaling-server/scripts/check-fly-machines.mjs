import { Buffer } from 'node:buffer';
import process from 'node:process';

try {
  const before = process.argv[2] === '--before';
  if (process.argv.length > (before ? 3 : 2)) throw new Error('Invalid topology check arguments');
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > 2 * 1024 * 1024) throw new Error('Machine inventory exceeds the check limit');
    chunks.push(chunk);
  }
  let machines;
  try {
    machines = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Machine inventory is not valid JSON');
  }
  const states = new Set(['started', 'stopped', 'suspended', 'created', 'destroyed']);
  if (
    !Array.isArray(machines) ||
    !machines.every(
      (machine) =>
        machine !== null &&
        typeof machine === 'object' &&
        typeof machine.id === 'string' &&
        machine.id.length > 0 &&
        states.has(machine.state),
    )
  ) {
    throw new Error('Machine inventory is not a recognized Fly machine list');
  }
  if (new Set(machines.map((machine) => machine.id)).size !== machines.length) {
    throw new Error('Machine inventory contains duplicate identifiers');
  }
  const existing = machines.filter((machine) => machine.state !== 'destroyed');
  if (
    existing.length > 1 ||
    (!before && (existing.length !== 1 || existing[0].state !== 'started'))
  ) {
    throw new Error(
      'The relay requires exactly one serving machine. Reconcile topology before deployment',
    );
  }
  process.stdout.write(`Relay topology verified ${before ? 'before' : 'after'} deployment\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Relay topology check failed'}\n`,
  );
  process.exitCode = 1;
}
