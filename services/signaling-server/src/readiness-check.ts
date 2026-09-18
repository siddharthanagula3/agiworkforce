import 'dotenv/config';

import { checkReadiness, formatReadinessReport } from './readiness.js';
import { probeEndpoints } from './release.js';

const endpoints = probeEndpoints();

if (endpoints.length === 0) {
  process.stderr.write(
    'readiness-check: no endpoint configured. Set SIGNALING_CANONICAL_URL (and SIGNALING_FAILOVER_URLS for each deploy target).\n',
  );
  process.exit(2);
}

const report = await checkReadiness(endpoints);
process.stdout.write(`${formatReadinessReport(report)}\n`);
process.exit(report.ready ? 0 : 1);
