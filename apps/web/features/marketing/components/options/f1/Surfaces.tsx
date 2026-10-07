import type { ReactNode } from 'react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agiworkforce/ui';
import type { SurfaceId } from '@/lib/surface-status';
import { SURFACE_TABS, SURFACES_TITLE } from './content';
import {
  ChromeDevice,
  DesktopDevice,
  EditorDevice,
  PhoneDevice,
  TerminalDevice,
  WebDevice,
} from './devices';

const TABLIST_LABEL = 'Surfaces';

const DEVICES: Record<SurfaceId, ReactNode> = {
  web: <WebDevice />,
  desktop: <DesktopDevice />,
  cli: <TerminalDevice />,
  mobile: <PhoneDevice />,
  vscode: <EditorDevice />,
  chrome: <ChromeDevice />,
};

export function Surfaces() {
  const first = SURFACE_TABS[0];
  if (!first) return null;
  return (
    <section className="f1-section" aria-labelledby="f1-surfaces-title">
      <div className="f1-wrap">
        <h2 id="f1-surfaces-title" className="f1-h2">
          {SURFACES_TITLE}
        </h2>
        <Tabs defaultValue={first.id} className="f1-surfaces">
          <TabsList className="f1-tablist" aria-label={TABLIST_LABEL}>
            {SURFACE_TABS.map((surface) => (
              <TabsTrigger key={surface.id} value={surface.id} className="f1-tab">
                <span>{surface.name}</span>
                <span className="f1-tab-status" data-live={surface.live ? 'true' : 'false'}>
                  {surface.status}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {SURFACE_TABS.map((surface) => (
            <TabsContent key={surface.id} value={surface.id} className="f1-tabpanel">
              <div className="f1-surface-copy">
                <h3 className="f1-h3">{surface.name}</h3>
                <p className="f1-surface-kind">{surface.kind}</p>
                <p className="f1-lead">{surface.blurb}</p>
                {surface.live ? (
                  <Link href={surface.action.href} className="f1-btn" data-kind="primary">
                    {surface.action.label}
                  </Link>
                ) : (
                  <Link href={surface.action.href} className="f1-link">
                    {surface.action.label}
                  </Link>
                )}
              </div>
              <div className="f1-surface-visual">{DEVICES[surface.id]}</div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
