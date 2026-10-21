import { complianceConfig } from '@synoikia/core/testing/compliance';
import { mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

// Core's compliance suite certifies the plugin from test/compliance.yaml. test/unit holds unit tests.
const pluginDir = import.meta.dirname;
const unit = { extends: true, test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } };

export default mergeConfig(
  mergeConfig(shared, complianceConfig({ pluginDir, features: ['../../features/grafana-adaptive/*.feature'] })),
  { test: { projects: [unit] } },
);
