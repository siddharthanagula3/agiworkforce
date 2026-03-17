/**
 * Next.js Instrumentation File
 *
 * This file runs once when the Node.js server starts.
 * Perfect for environment validation and initialization tasks.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server-side (Node.js runtime)
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    try {
      // Import validation module (dynamic import to avoid bundling in edge runtime)
      const { validateEnvironment, logValidationResults } = await import('./lib/validate-env');
      const result = validateEnvironment();
      logValidationResults(result);

      if (result.valid) {
        console.log('✅ Server initialization complete - environment validated');
      } else {
        // Log errors but do NOT throw — let the site render.
        // Features that need missing vars will fail gracefully at call time.
        console.error(
          `⚠️ Environment validation found ${result.errors.length} error(s). ` +
            'Some features may not work until env vars are configured.',
        );
      }
    } catch (error) {
      // Even if validation itself crashes, don't take down the site
      console.error('⚠️ Environment validation could not run:', error);
    }
  }
}
