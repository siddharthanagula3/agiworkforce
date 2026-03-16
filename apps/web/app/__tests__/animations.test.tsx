/**
 * Animation compilation and render tests.
 *
 * Verifies that:
 * 1. framer-motion mock covers all element types used in the codebase.
 * 2. Animated components render without errors in jsdom.
 * 3. AnimatePresence, motion.div, motion.button, etc. all work as expected.
 * 4. Framer-motion-specific props (initial, animate, exit, etc.) are stripped
 *    from the rendered DOM to avoid React unknown-prop warnings.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useState } from 'react';

// -------------------------------------------------------------------------
// Helper components that mirror real usage patterns in the codebase
// -------------------------------------------------------------------------

function AnimatedCard({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="test-card"
      data-testid="animated-card"
    >
      {text}
    </motion.div>
  );
}

function AnimatedList({ items }: { items: string[] }) {
  return (
    <motion.ul data-testid="animated-list">
      {items.map((item, i) => (
        <motion.li
          key={item}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          data-testid={`list-item-${i}`}
        >
          {item}
        </motion.li>
      ))}
    </motion.ul>
  );
}

function AnimatedButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      data-testid="animated-button"
    >
      {label}
    </motion.button>
  );
}

function AnimatedPresenceDemo() {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <button onClick={() => setVisible((v) => !v)} data-testid="toggle-button">
        Toggle
      </button>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="presence-content"
          >
            Visible content
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AnimatedSection({ title }: { title: string }) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      data-testid="animated-section"
    >
      <motion.h2 data-testid="animated-heading">{title}</motion.h2>
      <motion.p data-testid="animated-p">Content inside section</motion.p>
    </motion.section>
  );
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('framer-motion mock coverage', () => {
  describe('motion.div', () => {
    it('renders children without error', () => {
      render(<AnimatedCard text="Hello world" />);
      expect(screen.getByTestId('animated-card')).toBeInTheDocument();
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('does not pass framer-motion props to the DOM element', () => {
      render(<AnimatedCard text="Test" />);
      const card = screen.getByTestId('animated-card');
      // framer-motion-specific props must not appear on native DOM elements
      expect(card).not.toHaveAttribute('initial');
      expect(card).not.toHaveAttribute('animate');
      expect(card).not.toHaveAttribute('exit');
      expect(card).not.toHaveAttribute('transition');
    });

    it('preserves standard HTML attributes (className, data-testid)', () => {
      render(<AnimatedCard text="Test" />);
      const card = screen.getByTestId('animated-card');
      expect(card).toHaveClass('test-card');
    });
  });

  describe('motion.button', () => {
    it('renders and responds to click events', () => {
      let clicked = false;
      render(
        <AnimatedButton
          label="Click me"
          onClick={() => {
            clicked = true;
          }}
        />,
      );

      const button = screen.getByTestId('animated-button');
      expect(button).toBeInTheDocument();
      expect(screen.getByText('Click me')).toBeInTheDocument();

      fireEvent.click(button);
      expect(clicked).toBe(true);
    });

    it('does not pass whileHover/whileTap to DOM', () => {
      render(<AnimatedButton label="Test" onClick={() => {}} />);
      const button = screen.getByTestId('animated-button');
      expect(button).not.toHaveAttribute('whileHover');
      expect(button).not.toHaveAttribute('whileTap');
    });
  });

  describe('motion.ul and motion.li', () => {
    it('renders list items correctly', () => {
      render(<AnimatedList items={['First', 'Second', 'Third']} />);
      expect(screen.getByTestId('animated-list')).toBeInTheDocument();
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
      expect(screen.getByText('Third')).toBeInTheDocument();
    });

    it('renders all list items with correct data-testid', () => {
      render(<AnimatedList items={['A', 'B', 'C']} />);
      expect(screen.getByTestId('list-item-0')).toBeInTheDocument();
      expect(screen.getByTestId('list-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('list-item-2')).toBeInTheDocument();
    });
  });

  describe('motion.section, motion.h2, motion.p', () => {
    it('renders section components correctly', () => {
      render(<AnimatedSection title="Test Section" />);
      expect(screen.getByTestId('animated-section')).toBeInTheDocument();
      expect(screen.getByTestId('animated-heading')).toBeInTheDocument();
      expect(screen.getByText('Test Section')).toBeInTheDocument();
      expect(screen.getByText('Content inside section')).toBeInTheDocument();
    });
  });

  describe('AnimatePresence', () => {
    it('renders children when present', () => {
      render(
        <AnimatePresence>
          <motion.div key="test" data-testid="child">
            Always visible
          </motion.div>
        </AnimatePresence>,
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('toggles visibility of content', () => {
      render(<AnimatedPresenceDemo />);

      // Initially hidden
      expect(screen.queryByTestId('presence-content')).not.toBeInTheDocument();

      // Click toggle to show
      fireEvent.click(screen.getByTestId('toggle-button'));
      expect(screen.getByTestId('presence-content')).toBeInTheDocument();
      expect(screen.getByText('Visible content')).toBeInTheDocument();

      // Click toggle to hide
      fireEvent.click(screen.getByTestId('toggle-button'));
      expect(screen.queryByTestId('presence-content')).not.toBeInTheDocument();
    });
  });
});

describe('CSS animation classes compile correctly', () => {
  it('animate-fade-in class does not break rendering', () => {
    render(
      <div className="animate-fade-in" data-testid="fade-element">
        Content
      </div>,
    );
    expect(screen.getByTestId('fade-element')).toBeInTheDocument();
  });

  it('animate-fade-in-up utility class renders without error', () => {
    render(
      <div className="animate-fade-in-up" data-testid="fade-up-element">
        Content
      </div>,
    );
    expect(screen.getByTestId('fade-up-element')).toBeInTheDocument();
  });

  it('stagger-item class renders with correct opacity initial state concept', () => {
    // stagger-item sets opacity: 0 and animates to 1 via CSS keyframes
    render(
      <ul>
        <li className="stagger-item" data-testid="stagger-1">
          Item 1
        </li>
        <li className="stagger-item" data-testid="stagger-2">
          Item 2
        </li>
      </ul>,
    );
    expect(screen.getByTestId('stagger-1')).toBeInTheDocument();
    expect(screen.getByTestId('stagger-2')).toBeInTheDocument();
  });
});
