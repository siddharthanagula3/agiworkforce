'use client';

import {
  ChevronDown,
  Code2,
  Globe,
  Key,
  Menu,
  MessageSquare,
  Monitor,
  MonitorSmartphone,
  Plug,
  Scale,
  Server,
  Smartphone,
  Sparkles,
  Terminal,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../services/supabase';
import type { ComponentType, KeyboardEvent as ReactKeyboardEvent, SVGProps } from 'react';

type DropdownId = 'features' | 'platforms' | 'why';

interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  description: string;
}

const featureItems: NavItem[] = [
  {
    name: 'Multi-Model Chat',
    href: '/features/ai-chat',
    icon: MessageSquare,
    description: '10+ providers, switch models mid-conversation',
  },
  {
    name: 'AI Skills',
    href: '/features/ai-skills',
    icon: Users,
    description: '150+ specialists across 23 categories',
  },
  {
    name: 'MCP Plugins',
    href: '/features/plugins',
    icon: Plug,
    description: 'Unlimited MCP servers — stdio, SSE, HTTP',
  },
  {
    name: 'Computer Use',
    href: '/features/tools',
    icon: MonitorSmartphone,
    description: 'Browser, keyboard, screen, files, terminal',
  },
  {
    name: 'Agents',
    href: '/features/agents',
    icon: Sparkles,
    description: 'Parallel autonomous execution',
  },
];

const platformItems: NavItem[] = [
  {
    name: 'Desktop',
    href: '/desktop',
    icon: Monitor,
    description: 'Mac, Windows, Linux. Local or Cloud.',
  },
  {
    name: 'Mobile',
    href: '/mobile',
    icon: Smartphone,
    description: 'iOS + Android. Dispatch to your desktop.',
  },
  {
    name: 'CLI',
    href: '/cli',
    icon: Terminal,
    description: 'Pure Rust. 22 subcommands. 13 providers.',
  },
  {
    name: 'Chrome extension',
    href: '/chrome-extension',
    icon: Globe,
    description: 'Side panel + autofill. MV3 v1.2.0.',
  },
  {
    name: 'VS Code extension',
    href: '/vscode-extension',
    icon: Code2,
    description: '@agi chat participant. 53 commands.',
  },
];

const whyItems: NavItem[] = [
  {
    name: '10+ Providers',
    href: '/providers',
    icon: Sparkles,
    description: 'Anthropic, OpenAI, Google, xAI, Ollama and more.',
  },
  {
    name: 'BYOK',
    href: '/byok',
    icon: Key,
    description: 'Your keys. Your data. No markup.',
  },
  {
    name: 'Local LLM',
    href: '/local',
    icon: Server,
    description: 'Run Ollama or LM Studio. Free forever.',
  },
  {
    name: 'Compare',
    href: '/compare',
    icon: Scale,
    description: 'vs Claude, ChatGPT, Gemini, Perplexity.',
  },
];

const dropdowns: { id: DropdownId; label: string; items: NavItem[] }[] = [
  { id: 'features', label: 'Features', items: featureItems },
  { id: 'platforms', label: 'Platforms', items: platformItems },
  { id: 'why', label: 'Why us', items: whyItems },
];

const navItems = [
  { name: 'Pricing', href: '/pricing' },
  { name: 'Enterprise', href: '/enterprise' },
  { name: 'Docs', href: '/docs' },
  { name: 'About', href: '/about' },
];

// Shared nav label classes: mono uppercase, quiet ink, amber underline on hover
const navLabelCls =
  'font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-fg-paper-quiet)] ' +
  'hover:text-[var(--color-ink)] border-b border-transparent hover:border-[var(--color-rule)] ' +
  'transition-colors pb-px';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownId | null>(null);
  const [openMobileGroup, setOpenMobileGroup] = useState<DropdownId | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [focusedItemIndex, setFocusedItemIndex] = useState<number>(-1);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<Map<DropdownId, (HTMLAnchorElement | null)[]>>(new Map());
  const dropdownRefs = useRef<Map<DropdownId, HTMLDivElement | null>>(new Map());

  const setItemRef = useCallback((id: DropdownId, index: number, el: HTMLAnchorElement | null) => {
    let arr = itemRefs.current.get(id);
    if (!arr) {
      arr = [];
      itemRefs.current.set(id, arr);
    }
    arr[index] = el;
  }, []);

  const handleMouseEnter = useCallback((id: DropdownId) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpenDropdown(id);
  }, []);

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
      setFocusedItemIndex(-1);
    }, 150);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpenDropdown(null);
    setFocusedItemIndex(-1);
  }, []);

  const handleTriggerKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, id: DropdownId) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpenDropdown(id);
        setFocusedItemIndex(0);
        requestAnimationFrame(() => {
          itemRefs.current.get(id)?.[0]?.focus();
        });
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    },
    [closeDropdown],
  );

  const handleMenuItemKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLAnchorElement>, id: DropdownId, index: number) => {
      const items = itemRefs.current.get(id) ?? [];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(index + 1, items.length - 1);
        setFocusedItemIndex(next);
        items[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (index === 0) {
          closeDropdown();
          (
            dropdownRefs.current.get(id)?.querySelector('button') as HTMLButtonElement | null
          )?.focus();
        } else {
          const prev = index - 1;
          setFocusedItemIndex(prev);
          items[prev]?.focus();
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
        (
          dropdownRefs.current.get(id)?.querySelector('button') as HTMLButtonElement | null
        )?.focus();
      } else if (e.key === 'Tab') {
        closeDropdown();
      }
    },
    [closeDropdown],
  );

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
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: MouseEvent) => {
      const refEl = dropdownRefs.current.get(openDropdown);
      if (refEl && !refEl.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdown, closeDropdown]);

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <header className="fixed top-0 w-full bg-[var(--color-paper)] border-b border-[var(--color-rule)] z-50">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Masthead wordmark */}
        <Link href="/" className="flex items-center gap-3">
          <span className="font-display italic font-bold tracking-tight text-[var(--color-ink)] text-xl leading-none">
            AGI Workforce
          </span>
          <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--color-fg-paper-quiet)] hidden sm:inline">
            EST. 2026
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-5 lg:gap-6 items-center">
          {dropdowns.map(({ id, label, items }) => {
            const isOpen = openDropdown === id;
            return (
              <div
                key={id}
                ref={(el) => {
                  dropdownRefs.current.set(id, el);
                }}
                className="relative"
                onMouseEnter={() => handleMouseEnter(id)}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  className={`flex items-center gap-1 ${navLabelCls}`}
                  onClick={() => setOpenDropdown((prev) => (prev === id ? null : id))}
                  onKeyDown={(e) => handleTriggerKeyDown(e, id)}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  aria-controls={`${id}-dropdown`}
                >
                  {label}
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isOpen && (
                  <div
                    id={`${id}-dropdown`}
                    role="menu"
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[420px] bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-none p-4 shadow-lg"
                  >
                    <div className="grid gap-1">
                      {items.map((item, index) => (
                        <Link
                          key={item.name}
                          href={item.href}
                          role="menuitem"
                          ref={(el) => setItemRef(id, index, el)}
                          tabIndex={focusedItemIndex === index && isOpen ? 0 : -1}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--color-paper-2,oklch(97%_0.005_80))] transition-colors group focus:outline-none focus:bg-[var(--color-paper-2,oklch(97%_0.005_80))]"
                          onClick={() => {
                            if (closeTimeoutRef.current) {
                              clearTimeout(closeTimeoutRef.current);
                              closeTimeoutRef.current = null;
                            }
                            closeDropdown();
                          }}
                          onKeyDown={(e) => handleMenuItemKeyDown(e, id, index)}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--color-rule)]/10">
                            <item.icon className="h-4 w-4 text-[var(--color-rule)]" />
                          </div>
                          <div>
                            <div className="font-display italic font-medium text-sm text-[var(--color-ink)]">
                              {item.name}
                            </div>
                            <div className="font-mono text-[10px] tracking-[0.06em] text-[var(--color-fg-muted)]">
                              {item.description}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {navItems.map((item) => (
            <Link key={item.name} href={item.href} className={navLabelCls}>
              {item.name}
            </Link>
          ))}
          {userEmail && (
            <Link href="/chat" className={navLabelCls}>
              Chat
            </Link>
          )}
        </nav>

        {/* Right cluster */}
        <div className="hidden md:flex items-center gap-4">
          {userEmail ? (
            <div className="flex items-center gap-4">
              <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--color-fg-paper-quiet)] hidden lg:block">
                {userEmail}
              </span>
              <button onClick={handleSignOut} className={navLabelCls}>
                Sign Out
              </button>
              <Link
                href="/chat"
                className="font-mono text-xs tracking-[0.18em] uppercase bg-[var(--color-ink)] text-[var(--color-paper)] px-4 py-2 hover:opacity-80 transition-opacity"
              >
                [ chat ]
              </Link>
            </div>
          ) : (
            <>
              <Link href="/login" className={navLabelCls}>
                Sign In
              </Link>
              <Link
                href="/download"
                className="font-mono text-xs tracking-[0.18em] uppercase bg-[var(--color-ink)] text-[var(--color-paper)] px-4 py-2 hover:opacity-80 transition-opacity"
              >
                [ ./install ]
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden text-[var(--color-ink)] hover:opacity-70 transition-opacity"
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
        <div
          id="mobile-menu"
          className="md:hidden border-t border-[var(--color-rule)] bg-[var(--color-paper)] p-4"
        >
          <nav className="flex flex-col gap-4">
            {dropdowns.map(({ id, label, items }) => {
              const isMobileOpen = openMobileGroup === id;
              return (
                <div key={id}>
                  <button
                    className={`flex items-center gap-1 w-full text-left ${navLabelCls}`}
                    onClick={() => setOpenMobileGroup((prev) => (prev === id ? null : id))}
                    aria-expanded={isMobileOpen}
                    aria-controls={`mobile-${id}-menu`}
                  >
                    {label}
                    <ChevronDown
                      className={`h-3 w-3 transition-transform duration-200 ${isMobileOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isMobileOpen && (
                    <div
                      id={`mobile-${id}-menu`}
                      className="mt-2 ml-4 flex flex-col gap-2 border-l border-[var(--color-rule)] pl-3"
                    >
                      {items.map((item) => (
                        <Link
                          key={item.name}
                          href={item.href}
                          className="flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-fg-muted)] hover:text-[var(--color-ink)] transition-colors py-1"
                          onClick={() => {
                            setIsMenuOpen(false);
                            setOpenMobileGroup(null);
                          }}
                        >
                          <item.icon className="h-3.5 w-3.5 text-[var(--color-rule)]" />
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={navLabelCls}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            {userEmail && (
              <Link href="/chat" className={navLabelCls} onClick={() => setIsMenuOpen(false)}>
                Chat
              </Link>
            )}

            <hr className="border-[var(--color-rule-soft,rgba(200,137,42,0.22))] my-2" />

            {userEmail ? (
              <>
                <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--color-fg-paper-quiet)]">
                  {userEmail}
                </span>
                <button onClick={handleSignOut} className={`text-left ${navLabelCls}`}>
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={navLabelCls} onClick={() => setIsMenuOpen(false)}>
                  Sign In
                </Link>
                <Link
                  href="/download"
                  className="font-mono text-xs tracking-[0.18em] uppercase bg-[var(--color-ink)] text-[var(--color-paper)] px-4 py-2 hover:opacity-80 transition-opacity inline-block w-fit"
                  onClick={() => setIsMenuOpen(false)}
                >
                  [ ./install ]
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
