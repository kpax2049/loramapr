# Frontend

## E2E Smoke + Screenshots (Playwright)

Run from repo root:

```bash
npm --prefix frontend run test:e2e
```

Optional:

```bash
npm --prefix frontend run test:e2e:ui
npm --prefix frontend run test:e2e:report
```

Outputs:

- Deterministic screenshots: `frontend/tests/e2e/screenshots/*.png`
- HTML report: `frontend/playwright-report/index.html`
- Raw Playwright artifacts: `frontend/test-results/`
