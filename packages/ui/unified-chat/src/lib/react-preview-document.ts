export interface PinnedPreviewScript {
  readonly src: string;
  readonly integrity: string;
}

export const REACT_PREVIEW_SCRIPTS: readonly PinnedPreviewScript[] = [
  {
    src: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
    integrity: 'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z',
  },
  {
    src: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
    integrity: 'sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1',
  },
  {
    src: 'https://unpkg.com/@babel/standalone@8.0.4/babel.min.js',
    integrity: 'sha384-bdF7m0Y1IFKt9Q6xC8X9qkXn0OBriQWKyWwZKYsN05zF6P/g9OakjjL0G2Sd4pB4',
  },
];

export const REACT_PREVIEW_TRANSFORM = {
  filename: 'Component.tsx',
  sourceType: 'module',
  presets: [['react', { runtime: 'classic' }], 'typescript'],
  plugins: ['transform-modules-commonjs'],
} as const;

export function escapeForInlineScript(source: string): string {
  return source.replace(/<\/(script)/gi, '<\\/$1').replace(/\x3c!--/g, '<\\!--');
}

function pinnedScriptTag(script: PinnedPreviewScript): string {
  return `<script src="${script.src}" integrity="${script.integrity}" crossorigin="anonymous"></script>`;
}

// Babel standalone 8 defaults the React preset to the automatic runtime, whose
// `react/jsx-runtime` import cannot load here, so the transform is run by this
// script with the classic runtime. Errors are re-dispatched with their own
// message because the browser reports an error thrown inside a CDN script as
// "Script error." to the page's listeners.
const PREVIEW_RUNNER_BODY = `
  function fail(error) {
    var message = error && error.message ? error.message : String(error);
    if (window.console && console.error) console.error(error);
    window.dispatchEvent(new ErrorEvent('error', { message: message, error: error }));
  }
  function isComponent(value) {
    return typeof value === 'function' || Boolean(value && typeof value === 'object' && value.$$typeof);
  }
  var selfRendered = false;
  var previewReactDOM;
  var module = { exports: {} };
  function require(name) {
    if (name === 'react') return React;
    if (name === 'react-dom' || name === 'react-dom/client') return previewReactDOM;
    throw new Error('The preview cannot load "' + name + '". Only React and ReactDOM are available.');
  }
  var component;
  try {
    previewReactDOM = Object.create(ReactDOM);
    ['createRoot', 'hydrateRoot', 'render'].forEach(function (name) {
      if (typeof ReactDOM[name] !== 'function') return;
      previewReactDOM[name] = function () {
        selfRendered = true;
        return ReactDOM[name].apply(ReactDOM, arguments);
      };
    });
    var code = Babel.transform(source, transform).code;
    /* llm-guardrail-allow: runs the artifact's own component source, only inside the sandboxed preview document */
    component = new Function(
      'React', 'ReactDOM', 'require', 'module', 'exports',
      code + "\\n;return (module.exports && module.exports.default) || (typeof App !== 'undefined' && App) || (typeof Component !== 'undefined' && Component) || null;"
    )(React, previewReactDOM, require, module, module.exports);
  } catch (error) {
    fail(error);
    return;
  }
  if (selfRendered) return;
  if (!isComponent(component) && module.exports && typeof module.exports === 'object') {
    var exported = Object.keys(module.exports).sort(function (first, second) {
      return Number(/^[A-Z]/.test(second)) - Number(/^[A-Z]/.test(first));
    });
    component = exported.map(function (key) { return module.exports[key]; }).filter(isComponent)[0];
  }
  if (!isComponent(component)) {
    fail(new Error('The preview needs a default export or a component named App.'));
    return;
  }
  function Boundary(props) {
    React.Component.call(this, props);
    this.state = { failed: false };
  }
  Boundary.prototype = Object.create(React.Component.prototype);
  Boundary.prototype.constructor = Boundary;
  Boundary.getDerivedStateFromError = function () { return { failed: true }; };
  Boundary.prototype.componentDidCatch = function (error) { fail(error); };
  Boundary.prototype.render = function () { return this.state.failed ? null : this.props.children; };
  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(Boundary, null, React.createElement(component))
  );
})();`;

export function buildReactPreviewDocument(source: string, cspMeta: string): string {
  const scripts = REACT_PREVIEW_SCRIPTS.map(pinnedScriptTag).join('\n    ');
  const runner = [
    '(function () {',
    `  var source = ${JSON.stringify(source)};`,
    `  var transform = ${JSON.stringify(REACT_PREVIEW_TRANSFORM)};`,
    PREVIEW_RUNNER_BODY,
  ].join('\n');
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${cspMeta}
    ${scripts}
  </head>
  <body>
    <div id="root"></div>
    <script>
${escapeForInlineScript(runner)}
    </script>
  </body>
</html>`;
}
