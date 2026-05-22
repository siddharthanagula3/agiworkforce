#!/usr/bin/env node
/**
 * Backward-compatible npm command alias.
 *
 * `agi` is the preferred command. `agiworkforce` stays available for existing
 * installs, shell history, scripts, and docs that have not migrated yet.
 */
import './agi.js';
