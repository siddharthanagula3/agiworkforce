import { Alert } from 'react-native';
import { citationPublisherDomain } from '@agiworkforce/unified-chat/citation-publisher';
import { displaySourceSnippet } from '@agiworkforce/unified-chat/message-sources';
import { stripTrackingParams } from '@agiworkforce/unified-chat/citation-markers';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { hostnameOf, isValidExternalHttpUrl } from './externalUrls';

export function sourcePublisher(source: { url: string; title?: string }): string {
  return citationPublisherDomain(source) ?? hostnameOf(source.url);
}

export function sourceSnippet(source: { snippet?: string }): string {
  return displaySourceSnippet(source.snippet);
}

export function sourceInitial(source: { url: string; title?: string }): string {
  return sourcePublisher(source).charAt(0).toUpperCase() || '?';
}

export function canOpenSource(url: string | undefined): url is string {
  return Boolean(url && isValidExternalHttpUrl(url));
}

export async function openSource(
  url: string,
  failureTitle = 'Could not open source',
): Promise<boolean> {
  if (!canOpenSource(url)) return false;
  const opened = await openUntrustedUrlInAppBrowser(stripTrackingParams(url));
  if (!opened) Alert.alert(failureTitle, 'Check your connection and try again.');
  return opened;
}
