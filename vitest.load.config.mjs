// Load test (6.10): the integration setup (disposable *_test database), one long-running file.
// Run with `npm run test:load`; see tests/load/load.test.ts.

import integration from "./vitest.integration.config.mts";

const config = {
  ...integration,
  test: { ...integration.test, include: ["tests/load/**/*.test.ts"], testTimeout: 900_000 },
};

export default config;
