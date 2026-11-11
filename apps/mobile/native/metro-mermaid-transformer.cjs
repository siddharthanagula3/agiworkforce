const fs = require('fs');
const path = require('path');

const MERMAID_SOURCE_MODULE = 'mermaid-source-module-1';

function mermaidSourceModule(source) {
  return `module.exports = ${JSON.stringify(source)};`;
}

// Metro classifies a file by its resolved extension, so Mermaid's browser build
// cannot ride along as an asset; it is handed to the app as a string instead.
function createMermaidSourceTransformer({ upstream, mermaidBuild }) {
  function isMermaidBuild(filename, projectRoot) {
    try {
      return fs.realpathSync(path.resolve(projectRoot, filename)) === mermaidBuild;
    } catch {
      return false;
    }
  }

  return {
    isMermaidBuild,
    transform(props) {
      if (isMermaidBuild(props.filename, props.options.projectRoot)) {
        return upstream.transform({ ...props, src: mermaidSourceModule(props.src) });
      }
      return upstream.transform(props);
    },
    getCacheKey(...args) {
      const upstreamKey = upstream.getCacheKey ? upstream.getCacheKey(...args) : '';
      return `${upstreamKey}:${MERMAID_SOURCE_MODULE}`;
    },
  };
}

const expoRoot = path.dirname(require.resolve('expo/package.json'));

module.exports = {
  ...createMermaidSourceTransformer({
    upstream: require(
      require.resolve('@expo/metro-config/build/babel-transformer', { paths: [expoRoot] }),
    ),
    mermaidBuild: fs.realpathSync(require.resolve('mermaid/dist/mermaid.min.js')),
  }),
  createMermaidSourceTransformer,
  mermaidSourceModule,
};
