# DataCanvas Deterministic Engine

This build includes a no-paid-LLM, deterministic dashboard generation engine.

## Pipeline
1. Sanitizer: normalizes headers, duplicate names, common null markers, and mixed numeric values.
2. Profiler: infers types, cardinality, semantic roles, confidence, and date topology.
3. Metric synthesizer: creates safe metric definitions and dependency metadata.
4. Granularity guard: flags potentially unsafe aggregation patterns.
5. Chart matrix: selects a bounded set of visual types from field roles and metric availability.
6. Layout engine: produces 12-column desktop/tablet/mobile grid coordinates and component overflow policies.
7. Theme customizer: creates design tokens without a remote service.
8. Interaction planner: emits scoped event subscriptions and cycle-protection metadata.
9. Blueprint output: stores the generated blueprint on the dashboard and returns it to the client.

## Test and build
From the project root, run `npm run install:all`, then `npm test`.

The engine tests are deterministic unit tests and do not require MongoDB or an API key. Running the whole app requires a reachable MongoDB instance.
