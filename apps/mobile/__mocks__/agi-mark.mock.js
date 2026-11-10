/**
 * The brand mark without its reanimated and react-native-svg internals, so a
 * suite that stubs only part of those libraries can still render a spinner.
 */
const React = require('react');
const { View } = require('react-native');

function agiMarkMock() {
  return {
    __esModule: true,
    AgiMark: ({ testID }) => React.createElement(View, { testID, accessible: false }),
  };
}

module.exports = { agiMarkMock };
