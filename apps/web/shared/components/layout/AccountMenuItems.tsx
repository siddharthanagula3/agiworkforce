'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  HelpCircle,
  Keyboard,
  CreditCard,
  ShieldCheck,
  FileText,
  Scale,
  LogOut,
  Mail,
  MessageSquareText,
  BookOpen,
  LayoutList,
} from '@agiworkforce/icons';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  shortcutLabel,
} from '@agiworkforce/ui';
import { CANONICAL_POLICY_ROUTES, contactMailto } from '@/lib/legal-constants';
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
 * someone want to use it. They stay on every surface this menu renders on,
 * one level down under Learn more, as Claude and ChatGPT place theirs.
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
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <LayoutList className="me-2 h-4 w-4" />
          {t('common:navWorkspaceSection')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-64">
          <WorkspaceMenuItems onManage={onManageWorkspace} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {/* CRIT-008: open in place; /settings/general only bounces to /chat. */}
      <DropdownMenuItem onClick={onOpenSettings}>
        <Settings className="me-2 h-4 w-4" />
        {t('common:settings')}
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <HelpCircle className="me-2 h-4 w-4" />
          {t('common:navGetHelp')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-56">
          <DropdownMenuItem onClick={onOpenHelp}>
            <HelpCircle className="me-2 h-4 w-4" />
            {t('common:navGetHelp')}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={contactMailto()}>
              <Mail className="me-2 h-4 w-4" />
              {t('common:navEmailSupport')}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenFeedback}>
            <MessageSquareText className="me-2 h-4 w-4" />
            {t('common:navSendFeedback')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenKeyboardShortcuts}>
            <Keyboard className="me-2 h-4 w-4" />
            {t('common:navKeyboardShortcuts')}{' '}
            <span className="ms-auto text-caption text-muted-foreground">{shortcutLabel('/')}</span>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      {/* Hidden once there is nothing left to buy: this menu offered
          "Upgrade" to max_15x accounts, which reads as a billing error next
          to the plan badge in the same sidebar. */}
      {showUpgrade ? (
        <DropdownMenuItem onClick={onUpgrade}>
          <CreditCard className="me-2 h-4 w-4" />
          {t('common:navUpgrade')}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <BookOpen className="me-2 h-4 w-4" />
          {t('common:navLearnMore')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-60">
          <DropdownMenuItem asChild>
            <Link href={CANONICAL_POLICY_ROUTES.dataUse} target="_blank" rel="noopener noreferrer">
              <ShieldCheck className="me-2 h-4 w-4" />
              {t('common:navDataUse')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={CANONICAL_POLICY_ROUTES.dataRights}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="me-2 h-4 w-4" />
              {t('common:navDataRights')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={CANONICAL_POLICY_ROUTES.legalIndex}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Scale className="me-2 h-4 w-4" />
              {t('common:navTermsPolicies')}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onLogout} className="text-danger focus:text-danger">
        <LogOut className="me-2 h-4 w-4" />
        {t('common:navLogOut')}
      </DropdownMenuItem>
    </>
  );
}
