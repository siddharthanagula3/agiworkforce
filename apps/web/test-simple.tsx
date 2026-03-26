/* eslint-disable no-console */
import { render } from '@testing-library/react';

export function SimpleTest() {
  return <div>Test</div>;
}

const { container } = render(<SimpleTest />);
console.log('Rendered:', container.innerHTML);
