try {
  process.loadEnvFile('.env')
} catch {
  // Environment already populated (CI).
}

// Integration tests need a database; unit tests do not. Both need the module-level
// validation in `lib/env.ts` to pass.
process.env.AUTH_SECRET ??= 'test-secret-that-is-at-least-32-characters-long'
