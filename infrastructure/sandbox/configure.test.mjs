import { URL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { chromeArtifactParentOrigin, configureSandboxParent } from './configure.mjs';
const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const configuration = JSON.parse(await readFile(new URL('./vercel.json', import.meta.url), 'utf8'));
const extensionId = 'a'.repeat(32);

test('the configured exact extension origin reaches both framing and actual renderer admission', () => {
  const result = configureSandboxParent(html, configuration, extensionId);
  const policy = result.configuration.headers
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy').value;
  assert(policy.includes(`frame-ancestors `));
  assert(policy.includes(result.origin));
  const start = result.html.indexOf('const PRODUCTION_PARENT_ORIGINS');
  const end = result.html.indexOf(
    '\n        //',
    result.html.indexOf('function isAllowedParent', start),
  );
  const context = vm.createContext({
    window: { location: { hostname: 'sandbox.agiworkforce.com' } },
  });
  vm.runInContext(result.html.slice(start, end), context);
  assert.equal(vm.runInContext(`isAllowedParent(${JSON.stringify(result.origin)})`, context), true);
  assert.equal(
    vm.runInContext(`isAllowedParent('chrome-extension://${'b'.repeat(32)}')`, context),
    false,
  );
  assert.equal(vm.runInContext(`isAllowedParent('https://attacker.invalid')`, context), false);
  assert.equal(vm.runInContext(`isAllowedParent('http://localhost:3000')`, context), false);
  assert.equal(vm.runInContext(`isAllowedParent('https://agiworkforce.com')`, context), true);
  assert.equal(
    configuration.headers
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === 'Content-Security-Policy')
      .value.includes(result.origin),
    false,
  );
  assert(result.html.includes('event.source !== window.parent'));
});

test('refuses wildcard, URL, missing and malformed extension identities', () => {
  for (const id of [
    undefined,
    '',
    '*',
    'chrome-extension://' + extensionId,
    'a'.repeat(31),
    'z'.repeat(32),
    extensionId + '/',
  ])
    assert.throws(() => chromeArtifactParentOrigin(id));
});

test('configuration replaces stale extension admission and preserves unrelated isolation headers', () => {
  const first = configureSandboxParent(html, configuration, extensionId);
  const second = configureSandboxParent(first.html, first.configuration, 'b'.repeat(32));
  assert(!second.html.includes(JSON.stringify(first.origin)));
  assert(!JSON.stringify(second.configuration).includes(first.origin));
  for (const original of configuration.headers
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key !== 'Content-Security-Policy'))
    assert.deepEqual(
      second.configuration.headers
        .flatMap((rule) => rule.headers)
        .find((header) => header.key === original.key),
      original,
    );
});

test('fails closed if either policy owner is absent or ambiguous', () => {
  assert.throws(() =>
    configureSandboxParent(
      html.replace('CONFIGURED_EXTENSION_ORIGINS = []', 'MISSING = []'),
      configuration,
      extensionId,
    ),
  );
  assert.throws(() =>
    configureSandboxParent(
      html + 'const CONFIGURED_EXTENSION_ORIGINS = [];',
      configuration,
      extensionId,
    ),
  );
  assert.throws(() => configureSandboxParent(html, { headers: [] }, extensionId));
});

function section(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert(start >= 0 && end > start, `index.html is missing ${from}`);
  return source.slice(start, end);
}

class FakeNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = {};
    this.isConnected = false;
    this.textContent = '';
  }
  set innerHTML(_value) {
    for (const child of this.children) child.isConnected = false;
    this.children = [];
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  appendChild(child) {
    child.isConnected = this.isConnected;
    this.children.push(child);
    return child;
  }
  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }
  fire(type) {
    for (const handler of this.listeners[type] ?? []) handler();
  }
}

function reactRenderer({ transform }) {
  const rootEl = new FakeNode('div');
  rootEl.isConnected = true;
  const reported = [];
  const transforms = [];
  const mounted = [];
  const created = [];
  class Component {
    constructor(props) {
      this.props = props;
    }
  }
  const React = {
    Component,
    createElement(type, props, ...children) {
      return { type, props, children };
    },
  };
  const ReactDOM = {
    createRoot(container) {
      created.push(container);
      return {
        render(element) {
          mounted.push(element);
        },
      };
    },
  };
  const Babel = {
    transform(source, options) {
      transforms.push({ source, options });
      return { code: transform(source) };
    },
  };
  const context = vm.createContext({
    window: { React, ReactDOM, Babel },
    document: { createElement: (tagName) => new FakeNode(tagName) },
    rootEl,
    reportRenderError: (message) => reported.push(message),
    appendPinnedScript: (cfg, parent) => {
      const script = new FakeNode('script');
      script.src = cfg.src;
      script.integrity = cfg.integrity;
      return parent.appendChild(script);
    },
  });
  vm.runInContext(
    section(html, 'const REACT_RUNTIME_SCRIPTS', 'const MERMAID_RUNTIME_SCRIPT') +
      section(html, 'function renderReact(payload)', 'function renderSvg(payload)') +
      ';this.renderReact = renderReact;',
    context,
  );
  return {
    render(code) {
      vm.runInContext(`renderReact(${JSON.stringify({ kind: 'react', code })})`, context);
      const scripts = rootEl.children.filter((child) => child.tagName === 'script');
      return { scripts, reactRoot: rootEl.children[0] };
    },
    loadRuntime(scripts) {
      scripts[scripts.length - 1].fire('load');
    },
    rootEl,
    reported,
    transforms,
    mounted,
    created,
    Component,
  };
}

test('the React renderer transforms with the classic runtime and mounts the default export', () => {
  const renderer = reactRenderer({
    transform: () =>
      '"use strict";Object.defineProperty(exports,"__esModule",{value:true});exports.default=Counter;' +
      'var _react=require("react");function Counter(){return React.createElement("p",null,"Hi");}',
  });
  const { scripts, reactRoot } = renderer.render(
    "import React from 'react';\nexport default function Counter(): JSX.Element { return <p>Hi</p>; }",
  );
  assert.deepEqual(
    scripts.map((script) => script.src),
    [
      'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
      'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
      'https://unpkg.com/@babel/standalone@8.0.4/babel.min.js',
    ],
  );
  for (const script of scripts) assert.match(script.integrity, /^sha384-/u);
  assert(!html.includes('text/babel'));
  assert(!html.includes('data-presets'));
  assert.equal(renderer.transforms.length, 0);

  renderer.loadRuntime(scripts);

  assert.equal(renderer.transforms.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(renderer.transforms[0].options)), {
    filename: 'Component.tsx',
    sourceType: 'module',
    presets: [['react', { runtime: 'classic' }], 'typescript'],
    plugins: ['transform-modules-commonjs'],
  });
  assert.deepEqual(renderer.reported, []);
  assert.deepEqual(renderer.created, [reactRoot]);
  assert.equal(renderer.mounted.length, 1);
  const [boundary] = renderer.mounted;
  assert.equal(Object.getPrototypeOf(boundary.type.prototype), renderer.Component.prototype);
  assert.equal(boundary.children[0].type.name, 'Counter');
});

test('the React renderer mounts App, Component or the first named component export', () => {
  for (const [code, name] of [
    ['function App(){return null;}', 'App'],
    ['function Component(){return null;}', 'Component'],
    [
      'exports.formatCount=function(n){return n;};exports.Chart=function Chart(){return null;};',
      'Chart',
    ],
  ]) {
    const renderer = reactRenderer({ transform: () => code });
    const { scripts } = renderer.render('source');
    renderer.loadRuntime(scripts);
    assert.deepEqual(renderer.reported, [], name);
    assert.equal(renderer.mounted[0].children[0].type.name, name);
  }
});

test('the React renderer reports transform, import and missing-component errors with their own message', () => {
  const syntax = reactRenderer({
    transform: () => {
      throw new SyntaxError('Unexpected token (1:31)');
    },
  });
  syntax.loadRuntime(syntax.render('function App() { return <p>Hi</p> ').scripts);
  assert.deepEqual(syntax.reported, ['Unexpected token (1:31)']);
  assert.equal(syntax.mounted.length, 0);

  const imported = reactRenderer({ transform: () => 'var chart = require("recharts");' });
  imported.loadRuntime(imported.render('import "recharts";').scripts);
  assert.deepEqual(imported.reported, [
    'The preview cannot load "recharts". Only React and ReactDOM are available.',
  ]);

  const empty = reactRenderer({ transform: () => 'function Widget(){return null;}' });
  empty.loadRuntime(empty.render('function Widget() {}').scripts);
  assert.deepEqual(empty.reported, [
    'The preview needs a default export or a component named App.',
  ]);
  assert.equal(empty.mounted.length, 0);
});

test('the React renderer mounts a self-rendering source once and clears the loading text', () => {
  for (const code of [
    'function App(){return null;}require("react-dom/client").createRoot(ownRoot).render(React.createElement(App));',
    'function Widget(){return null;}ReactDOM.createRoot(ownRoot).render(React.createElement(Widget));',
  ]) {
    const renderer = reactRenderer({ transform: () => `var ownRoot = { id: "root" };${code}` });
    const { scripts, reactRoot } = renderer.render('source');
    assert.equal(reactRoot.textContent, 'Loading React…');
    renderer.loadRuntime(scripts);
    assert.deepEqual(renderer.reported, [], code);
    assert.equal(renderer.created.length, 1, code);
    assert.notEqual(renderer.created[0], reactRoot, code);
    assert.equal(renderer.mounted.length, 1, code);
    assert.equal(reactRoot.textContent, '', code);
  }
});

test('the React renderer leaves a replaced render alone when its runtime finishes loading', () => {
  const renderer = reactRenderer({ transform: () => 'function App(){return null;}' });
  const first = renderer.render('function App() {}');
  renderer.rootEl.innerHTML = '';
  renderer.loadRuntime(first.scripts);
  assert.equal(renderer.transforms.length, 0);
  assert.equal(renderer.mounted.length, 0);
});
