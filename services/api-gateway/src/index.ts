import { validateStartupEnv } from './env';
import { logger } from './lib/logger';
import { warnIfMultiInstanceWithoutRedis } from './middleware/rateLimit';
import { createGatewayRuntime, installSignalHandlers } from './server';

try {
  validateStartupEnv();
} catch (err) {
  logger.fatal({ err }, (err as Error).message);
  process.exit(1);
}

warnIfMultiInstanceWithoutRedis();

const runtime = createGatewayRuntime();
installSignalHandlers(runtime);

runtime.start().catch((err) => {
  logger.fatal({ err }, 'API Gateway failed to start');
  process.exit(1);
});
