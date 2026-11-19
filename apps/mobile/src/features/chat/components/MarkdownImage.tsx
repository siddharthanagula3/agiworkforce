import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Image as ImageIcon, ImageOff } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';
import { GeneratedImage } from './GeneratedImage';

const MAX_IMAGE_HEIGHT = 512;
const PLACEHOLDER_HEIGHT = 160;
const REMOTE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const approvedImageUrls = new Set<string>();

type RemoteImageSource =
  { kind: 'embedded'; src: string } | { kind: 'remote'; src: string; host: string };

function remoteImageSource(value: string): RemoteImageSource | null {
  const src = value.trim();
  if (/^data:image\/[a-z+.-]+;base64,/i.test(src)) return { kind: 'embedded', src };
  try {
    const url = new URL(src);
    return REMOTE_PROTOCOLS.has(url.protocol)
      ? { kind: 'remote', src: url.href, host: url.host }
      : null;
  } catch {
    return null;
  }
}

function ImageNotice({
  colors,
  failed,
  alt,
  detail,
  children,
}: {
  colors: ColorScheme;
  failed: boolean;
  alt: string;
  detail: string;
  children?: React.ReactNode;
}) {
  const Icon = failed ? ImageOff : ImageIcon;
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceBase,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon size={16} color={colors.textSecondary} />
        <Text
          style={{ flex: 1, color: colors.textSecondary, fontSize: typeScale.footnote }}
          numberOfLines={2}
        >
          {alt ? (
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
              {`${alt}  `}
            </Text>
          ) : null}
          {detail}
        </Text>
      </View>
      {children ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>
      ) : null}
    </View>
  );
}

function RemoteImage({
  source,
  alt,
  colors,
}: {
  source: RemoteImageSource;
  alt: string;
  colors: ColorScheme;
}) {
  const [approved, setApproved] = useState(
    () => source.kind === 'embedded' || approvedImageUrls.has(source.src),
  );
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  if (source.kind === 'remote' && !approved) {
    return (
      <ImageNotice colors={colors} failed={false} alt={alt} detail={`Image from ${source.host}`}>
        <Button
          title="Load image"
          variant="outline"
          size="md"
          accessibilityLabel={`Load image from ${source.host}`}
          onPress={() => {
            approvedImageUrls.add(source.src);
            setApproved(true);
          }}
        />
      </ImageNotice>
    );
  }

  if (status === 'error') {
    return (
      <ImageNotice colors={colors} failed alt={alt} detail="Image failed to load">
        {attempt === 0 ? (
          <Button
            title="Retry"
            variant="outline"
            size="md"
            onPress={() => {
              setAttempt(1);
              setStatus('loading');
            }}
          />
        ) : null}
        {source.kind === 'remote' ? (
          <Button
            title="Open image"
            variant="outline"
            size="md"
            onPress={() => void openUntrustedUrlInAppBrowser(source.src)}
          />
        ) : null}
      </ImageNotice>
    );
  }

  const picture = (
    <Image
      key={attempt}
      source={{ uri: source.src }}
      accessibilityLabel={alt || 'Image'}
      contentFit="contain"
      onLoad={(event) => {
        const { width, height } = event.source;
        if (width > 0 && height > 0) setAspectRatio(width / height);
        setStatus('loaded');
      }}
      onError={() => setStatus('error')}
      style={{
        width: '100%',
        ...(aspectRatio ? { aspectRatio } : { height: PLACEHOLDER_HEIGHT }),
        maxHeight: MAX_IMAGE_HEIGHT,
        borderRadius: radii.md,
        backgroundColor: status === 'loading' ? colors.surfaceBase : 'transparent',
      }}
    />
  );

  if (source.kind === 'embedded') return picture;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={alt || 'Image'}
      accessibilityHint="Opens the image in the browser"
      onPress={() => void openUntrustedUrlInAppBrowser(source.src)}
    >
      {picture}
    </Pressable>
  );
}

export function MarkdownImage({
  src,
  alt,
  colors,
}: {
  src: string;
  alt: string;
  colors: ColorScheme;
}) {
  if (resolveGeneratedImageUri(src)) {
    return <GeneratedImage imageUrl={src} revisedPrompt={alt || undefined} />;
  }
  const source = remoteImageSource(src);
  if (!source) {
    return <ImageNotice colors={colors} failed alt={alt} detail="Image is unavailable" />;
  }
  return <RemoteImage key={source.src} source={source} alt={alt} colors={colors} />;
}
