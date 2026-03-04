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
    // Import validation module (dynamic import to avoid bundling in edge runtime)
    const { validateEnvironmentOrThrow } = await import('./lib/validate-env');

    try {
      // Run comprehensive environment validation
      validateEnvironmentOrThrow();

      console.log('✅ Server initialization complete - environment validated');
    } catch (error) {
      console.error('❌ Server initialization failed - environment validation error');
      console.error(error);

      // In production, fail fast to prevent deployment with invalid config
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }

      // In development, warn but allow server to start (for easier debugging)
      console.warn('⚠️  Continuing in development mode despite validation errors');
    }
  }
}
