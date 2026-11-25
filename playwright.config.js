import { defineConfig, devices } from '@playwright/test';

// WebKit needs system libraries that this machine does not have, so the iPhone profile runs on Chromium.
// The final Safari check is on the real iPhone.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8091/', serviceWorkers: 'block', trace: 'retain-on-failure' },
  webServer: {
    command: 'python3 -m http.server 8091 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8091/index.html',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
