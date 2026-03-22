'use client';

import {
  Bot,
  ChevronDown,
  KanbanSquare,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Plug,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../services/supabase';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const featureItems = [
  {
    name: 'AI Chat',
    href: '/features/ai-chat',
    icon: MessageSquare,
    description: 'Multi-model conversations with streaming',
  },
  {
    name: 'AI Skills',
    href: '/features/ai-skills',
    icon: Users,
    description: '140+ specialized AI employees',
  },
  {
    name: 'Plugins & MCP',
    href: '/features/plugins',
    icon: Plug,
    description: 'Unlimited tool integrations',
  },
  {
    name: 'Desktop Tools',
    href: '/features/tools',
    icon: Wrench,
    description: 'Screen, keyboard & app automation',
  },
  {
    name: 'AI Agents',
    href: '/features/agents',
    icon: Bot,
    description: 'Autonomous task execution',
  },
  {
    name: 'Dashboards',
    href: '/features/ai-dashboards',
    icon: LayoutDashboard,
    description: 'Real-time analytics & insights',
  },
  {
    name: 'Project Manager',
    href: '/features/ai-project-manager',
    icon: KanbanSquare,
    description: 'AI-powered project workflows',
  },
];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);
  const [isMobileFeaturesOpen, setIsMobileFeaturesOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [focusedItemIndex, setFocusedItemIndex] = useState<number>(-1);
  const featuresTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuItemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const handleFeaturesMouseEnter = useCallback(() => {
    if (featuresTimeoutRef.current) {
      clearTimeout(featuresTimeoutRef.current);
      featuresTimeoutRef.current = null;
    }
    setIsFeaturesOpen(true);
  }, []);

  const handleFeaturesMouseLeave = useCallback(() => {
    featuresTimeoutRef.current = setTimeout(() => {
      setIsFeaturesOpen(false);
    }, 150);
  }, []);

  const closeFeaturesDropdown = useCallback(() => {
    setIsFeaturesOpen(false);
    setFocusedItemIndex(-1);
  }, []);

  const handleTriggerKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsFeaturesOpen(true);
        setFocusedItemIndex(0);
        // Focus the first item after state update
        requestAnimationFrame(() => {
          menuItemRefs.current[0]?.focus();
        });
      } else if (e.key === 'Escape') {
        closeFeaturesDropdown();
      }
    },
    [closeFeaturesDropdown],
  );

  const handleMenuItemKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLAnchorElement>, index: number) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(index + 1, featureItems.length - 1);
        setFocusedItemIndex(next);
        menuItemRefs.current[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (index === 0) {
          // Return focus to trigger button
          closeFeaturesDropdown();
          (featuresRef.current?.querySelector('button') as HTMLButtonElement | null)?.focus();
        } else {
          const prev = index - 1;
          setFocusedItemIndex(prev);
          menuItemRefs.current[prev]?.focus();
        }
      } else if (e.key === 'Escape') {
        closeFeaturesDropdown();
        (featuresRef.current?.querySelector('button') as HTMLButtonElement | null)?.focus();
      } else if (e.key === 'Tab') {
        closeFeaturesDropdown();
      }
    },
    [closeFeaturesDropdown],
  );

  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    async function getUser() {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (mounted) {
        setUserEmail(session?.user?.email || null);
      }
    }
    getUser();

    return () => {
      mounted = false;
      if (featuresTimeoutRef.current) {
        clearTimeout(featuresTimeoutRef.current);
      }
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isFeaturesOpen) return;
    const handler = (e: MouseEvent) => {
      if (featuresRef.current && !featuresRef.current.contains(e.target as Node)) {
        closeFeaturesDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isFeaturesOpen, closeFeaturesDropdown]);

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const navItems = [
    { name: 'Security', href: '/security' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'About', href: '/about' },
    { name: 'FAQ', href: '/faq' },
    { name: 'Contact', href: '/contact' },
  ];

  return (
    <header className="fixed top-0 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl z-50">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tighter">
          <Bot className="h-6 w-6 text-blue-500" />
          <span>AGI Workforce</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-6 text-sm font-medium text-zinc-400">
          {/* Features dropdown */}
          <div
            ref={featuresRef}
            className="relative"
            onMouseEnter={handleFeaturesMouseEnter}
            onMouseLeave={handleFeaturesMouseLeave}
          >
            <button
              className="flex items-center gap-1 hover:text-white transition-colors"
              onClick={() => setIsFeaturesOpen((prev) => !prev)}
              onKeyDown={handleTriggerKeyDown}
              aria-haspopup="menu"
              aria-expanded={isFeaturesOpen}
              aria-controls="features-dropdown"
            >
              Features
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${isFeaturesOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isFeaturesOpen && (
              <div
                id="features-dropdown"
                role="menu"
                className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[420px] rounded-xl border border-zinc-800 bg-black/90 p-4 shadow-2xl backdrop-blur-xl"
              >
                <div className="grid gap-1">
                  {featureItems.map((item, index) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      role="menuitem"
                      ref={(el) => {
                        menuItemRefs.current[index] = el;
                      }}
                      tabIndex={focusedItemIndex === index ? 0 : -1}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-800/50 transition-colors group focus:outline-none focus:bg-zinc-800/50"
                      onClick={() => {
                        if (featuresTimeoutRef.current) {
                          clearTimeout(featuresTimeoutRef.current);
                          featuresTimeoutRef.current = null;
                        }
                        closeFeaturesDropdown();
                      }}
                      onKeyDown={(e) => handleMenuItemKeyDown(e, index)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                        <item.icon className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{item.name}</div>
                        <div className="text-xs text-zinc-400">{item.description}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {navItems.map((item) => (
            <Link key={item.name} href={item.href} className="hover:text-white transition-colors">
              {item.name}
            </Link>
          ))}
          {userEmail && (
            <Link href="/chat" className="hover:text-white transition-colors">
              Dashboard
            </Link>
          )}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          {userEmail ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-zinc-400 hidden lg:block">{userEmail}</span>
              <button
                onClick={handleSignOut}
                className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Sign Out
              </button>
              <Link
                href="/chat"
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Dashboard
              </Link>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/download"
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 transition-colors"
              >
                Download Free
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden text-zinc-400 hover:text-white"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-white/10 bg-black p-4">
          <nav className="flex flex-col gap-4 text-sm font-medium text-zinc-400">
            {/* Mobile features expandable */}
            <div>
              <button
                className="flex items-center gap-1 hover:text-white transition-colors w-full text-left"
                onClick={() => setIsMobileFeaturesOpen((prev) => !prev)}
                aria-expanded={isMobileFeaturesOpen}
                aria-controls="mobile-features-menu"
              >
                Features
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${isMobileFeaturesOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isMobileFeaturesOpen && (
                <div id="mobile-features-menu" className="mt-2 ml-4 flex flex-col gap-2">
                  {featureItems.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors py-1"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsMobileFeaturesOpen(false);
                      }}
                    >
                      <item.icon className="h-3.5 w-3.5 text-blue-400" />
                      {item.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="hover:text-white transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            {userEmail && (
              <Link
                href="/chat"
                className="hover:text-white transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Dashboard
              </Link>
            )}
            <hr className="border-white/10 my-2" />
            {userEmail ? (
              <>
                <span className="text-zinc-500">{userEmail}</span>
                <button
                  onClick={handleSignOut}
                  className="text-left hover:text-white transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hover:text-white transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/download"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Download Free
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
