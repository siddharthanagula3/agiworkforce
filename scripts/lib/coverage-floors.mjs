const PROJECTS_BLOCK_RE = /projects\s*:\s*\[([\s\S]*?)\]/;
const PROJECT_ENTRY_RE = /['"]([^'"]+)['"]/g;
const LINES_THRESHOLD_RE = /thresholds\s*:\s*\{[^}]*\blines\s*:\s*(\d+(?:\.\d+)?)/;
const ROOT_THRESHOLD_RE = /--coverage\.threshold\.lines=(\d+(?:\.\d+)?)/;

export function parseProjects(rootConfigSource) {
  const block = PROJECTS_BLOCK_RE.exec(rootConfigSource);
  if (!block) return [];
  const projects = [];
  PROJECT_ENTRY_RE.lastIndex = 0;
  let match;
  while ((match = PROJECT_ENTRY_RE.exec(block[1])) !== null) projects.push(match[1]);
  return projects;
}

export function parseLinesFloor(configSource) {
  const match = LINES_THRESHOLD_RE.exec(configSource);
  return match ? Number(match[1]) : null;
}

export function parseRootFloor(rootPackageJsonSource) {
  const match = ROOT_THRESHOLD_RE.exec(rootPackageJsonSource);
  return match ? Number(match[1]) : null;
}

export function collectFloors(projects, readConfig) {
  const floors = {};
  const missingConfigs = [];
  for (const project of projects) {
    const source = readConfig(project);
    if (source === null) {
      missingConfigs.push(project);
      continue;
    }
    floors[project] = parseLinesFloor(source);
  }
  return { floors, missingConfigs };
}

export function checkFloors({ floors, missingConfigs, rootFloor }, recorded) {
  const errors = [];

  for (const project of missingConfigs) {
    errors.push(
      `${project} is in the root vitest projects list but has no vitest config, so it is never ` +
        'measured and its absence of tests cannot be seen',
    );
  }

  if (rootFloor === null) {
    errors.push('the root test:coverage script no longer passes --coverage.threshold.lines');
  } else if (rootFloor < recorded.rootFloor) {
    errors.push(
      `the repository-wide line floor dropped from ${recorded.rootFloor} to ${rootFloor}; a floor ` +
        'that moves down with the code is not a floor',
    );
  }

  for (const [project, floor] of Object.entries(recorded.floors)) {
    if (floor === null) continue;
    if (!(project in floors)) {
      errors.push(
        `${project} declared a line floor of ${floor} and has left the projects list; move the ` +
          'floor with the package or remove it deliberately',
      );
      continue;
    }
    if (floors[project] === null) {
      errors.push(
        `${project} dropped its declared line floor of ${floor}; raise coverage instead of ` +
          'deleting the floor',
      );
    } else if (floors[project] < floor) {
      errors.push(`${project} lowered its line floor from ${floor} to ${floors[project]}`);
    }
  }

  const unfloored = Object.entries(floors)
    .filter(([, floor]) => floor === null)
    .map(([project]) => project);
  const allowed = recorded.maxUnfloored;
  if (typeof allowed !== 'number') {
    errors.push('the record has no maxUnfloored count');
  } else if (unfloored.length > allowed) {
    const fresh = unfloored.filter((project) => !(project in recorded.floors));
    errors.push(
      `${unfloored.length} projects declare no line floor, above the ratchet of ${allowed}` +
        (fresh.length > 0 ? `; new without one: ${fresh.join(', ')}` : ''),
    );
  }

  return errors;
}

export function unflooredProjects(floors) {
  return Object.entries(floors)
    .filter(([, floor]) => floor === null)
    .map(([project]) => project);
}
