import { runPlugin } from '@synoikia/plugin-sdk';
import { createHomeAssistantPlugin } from './plugin.js';

// Behavior follows home-server-mcps docs/reference/homeassistant-mcp-design.md, mapped onto the plugin hooks in
// The plugin contract: core ADR-0011 and ADR-0012.
runPlugin(createHomeAssistantPlugin());
