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
 * footer and collapsed-rail triggers alike: the single place its contents and
 * order are decided.
 *
 * The three legal-reachability links are unconditional: a signed-in user never
 * sees the marketing footer, and the DPDP grievance route has to be reachable
 * from the page that made someone want to use it. They sit one level down
 * under Learn more, as Claude and ChatGPT place theirs.
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
      {/* Hidden once there is nothing left to buy. */}
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
