import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { storage } from '@/lib/mmkv';
import {
  browseConnectorListings,
  connectorListingIconUrl,
  fetchConnectorDirectory,
  type ConnectorListing,
} from '@/services/connectors';
import { ConnectorLogo } from '@/src/features/settings/cloud-connectors/ConnectorLogo';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const SUGGESTION_LIMIT = 3;
const CONNECTED_ENOUGH = 3;
const DISMISSED_KEY = 'dismissedNewChatConnectorSuggestions';

async function loadSuggestions(): Promise<ConnectorListing[]> {
  const [directory, page] = await Promise.all([
    fetchConnectorDirectory(),
    browseConnectorListings({}),
  ]);
  const connected = new Set(directory.connectors.map((connection) => connection.connectorId));
  if (connected.size >= CONNECTED_ENOUGH) return [];
  const available = new Set(directory.available);
  const candidates = page.entries.filter(
    (listing) => !connected.has(listing.id) && (available.size === 0 || available.has(listing.id)),
  );
  return [
    ...candidates.filter((listing) => listing.featured),
    ...candidates.filter((listing) => !listing.featured),
  ].slice(0, SUGGESTION_LIMIT);
}

export function NewChatConnectorSuggestions() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation('common');
  const [suggestions, setSuggestions] = useState<ConnectorListing[]>([]);
  const [dismissed, setDismissed] = useState(() => storage.getString(DISMISSED_KEY) === 'true');

  useEffect(() => {
    if (dismissed) return undefined;
    let cancelled = false;
    loadSuggestions()
      .then((next) => {
        if (!cancelled) setSuggestions(next);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const dismiss = useCallback(() => {
    storage.set(DISMISSED_KEY, 'true');
    setDismissed(true);
  }, []);

  if (dismissed || suggestions.length === 0) return null;

  const chipStyle = {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  };

  return (
    <View
      testID="new-chat-connector-suggestions"
      style={{
        marginTop: 20,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: typeScale.subhead }}>
        {t('newChat.connectors.label')}
      </Text>
      {suggestions.map((listing) => (
        <Pressable
          key={listing.id}
          onPress={() =>
            router.push({ pathname: '/(app)/connectors/[id]', params: { id: listing.id } })
          }
          accessibilityRole="button"
          accessibilityLabel={t('newChat.connectors.open', { name: listing.name })}
          style={chipStyle}
        >
          <ConnectorLogo
            id={listing.id}
            name={listing.name}
            iconUrl={connectorListingIconUrl(listing)}
            size={24}
          />
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
            {listing.name}
          </Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => router.push('/(app)/connectors')}
        accessibilityRole="button"
        style={chipStyle}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
          {t('newChat.connectors.seeAll')}
        </Text>
      </Pressable>
      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={t('newChat.connectors.dismiss')}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
