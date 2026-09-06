'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  HelpCircle,
  Keyboard,
  CreditCard,
  Download,
  ShieldCheck,
  FileText,
  Scale,
  LogOut,
} from '@agiworkforce/icons';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  shortcutLabel,
} from '@agiworkforce/ui';
import { MessageSquareText } from 'lucide-react';
import { CANONICAL_POLICY_ROUTES } from '@/lib/legal-constants';
import { WorkspaceMenuItems } from '@/features/workspaces/components/WorkspaceMenuItems';

export interface AccountMenuItemsProps {
  email?: string | null;
  onManageWorkspace: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenFeedback: () => void;
  onOpenKeyboardShortcuts: () => void;
  showUpgrade: boolean;
  onUpgrade: () => void;
  onDownloadApps: () => void;
  onLogout: () => void;
}

/**
 * The one account menu, shared by WebChatPage's and WebAppShell's expanded
 * footer and collapsed-rail triggers alike. A product has one account menu.
 * this is the single place its contents and order are decided, so the two
 * shells cannot drift into different menus again.
 *
 * The three legal-reachability links are unconditional: an audit found the
 * signed-in shell rendered no route to any policy (every legal link lived on
 * the marketing footer, which a signed-in user never sees), and the DPDP
 * grievance route in particular has to be reachable from the page that made
 * someone want to use it. They stay on every surface this menu renders on.
 */
export function AccountMenuItems({
  email,
  onManageWorkspace,
  onOpenSettings,
  onOpenHelp,
  onOpenFeedback,
  onOpenKeyboardShortcuts,
  showUpgrade,
  onUpgrade,
  onDownloadApps,
  onLogout,
}: AccountMenuItemsProps) {
  const { t } = useTranslation('common');

  return (
    <>
      {email && (
        <>
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
        </>
      )}
      <WorkspaceMenuItems onManage={onManageWorkspace} />
      {/* CRIT-008: open in place; /settings/general only bounces to /chat. */}
      <DropdownMenuItem onClick={onOpenSettings}>
        <Settings className="mr-2 h-4 w-4" />
        {t('common:settings')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onOpenHelp}>
        <HelpCircle className="mr-2 h-4 w-4" />
        {t('common:navGetHelp')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onOpenFeedback}>
        <MessageSquareText className="mr-2 h-4 w-4" />
        {t('common:navSendFeedback')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onOpenKeyboardShortcuts}>
        <Keyboard className="mr-2 h-4 w-4" />
        {t('common:navKeyboardShortcuts')}
        <span className="ml-auto text-[12px] text-muted-foreground">{shortcutLabel('/')}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {/* Hidden once there is nothing left to buy: this menu offered
          "Upgrade" to max_15x accounts, which reads as a billing error next
          to the plan badge in the same sidebar. */}
      {showUpgrade ? (
        <DropdownMenuItem onClick={onUpgrade}>
          <CreditCard className="mr-2 h-4 w-4" />
          {t('common:navUpgrade')}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onClick={onDownloadApps}>
        <Download className="mr-2 h-4 w-4" />
        {t('common:navGetApps')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href={CANONICAL_POLICY_ROUTES.dataUse} target="_blank" rel="noopener noreferrer">
          <ShieldCheck className="mr-2 h-4 w-4" />
          How we use your data
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href={CANONICAL_POLICY_ROUTES.dataRights} target="_blank" rel="noopener noreferrer">
          <FileText className="mr-2 h-4 w-4" />
          Privacy &amp; your data rights
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href={CANONICAL_POLICY_ROUTES.legalIndex} target="_blank" rel="noopener noreferrer">
          <Scale className="mr-2 h-4 w-4" />
          Terms &amp; policies
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onLogout} className="text-danger focus:text-danger">
        <LogOut className="mr-2 h-4 w-4" />
        {t('common:navLogOut')}
      </DropdownMenuItem>
    </>
  );
}
