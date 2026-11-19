import { useState, type ReactNode } from 'react';
import { PixelRatio, View } from 'react-native';
import {
  imageTitle,
  markdownImageSource,
  readableImageAlt,
} from '@agiworkforce/unified-chat/markdown-image-sources';
import { Image } from 'expo-image';
import { Image as ImageIcon, ImageOff } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { chatTypography, radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';
import { MAX_INLINE_IMAGE_HEIGHT } from '@/src/features/image/inlineImageFrame';
import { GeneratedImage } from './GeneratedImage';
import { ImageFullScreen } from './ImageFullScreen';

const PLACEHOLDER_HEIGHT = 160;
const approvedImageUrls = new Set<string>();
const knownImageRatios = new Map<string, number>();

type RemoteImageSource =
  { kind: 'embedded'; src: string } | { kind: 'remote'; src: string; host: string; key: string };

function remoteImageSource(value: string): RemoteImageSource | null {
  const src = value.trim();
  if (/^data:image\/[a-z+.-]+;base64,/i.test(src)) return { kind: 'embedded', src };
  const parsed = markdownImageSource(src);
  return parsed?.kind === 'cross-origin'
    ? { kind: 'remote', src: parsed.src, host: parsed.host, key: parsed.key }
    : null;
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
  title,
  colors,
  trustedImageKeys,
}: {
  source: RemoteImageSource;
  alt: string;
  title?: string;
  colors: ColorScheme;
  trustedImageKeys?: ReadonlySet<string>;
}) {
  const [approved, setApproved] = useState(
    () =>
      source.kind === 'embedded' ||
      approvedImageUrls.has(source.src) ||
      trustedImageKeys?.has(source.key) === true,
  );
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<number | null>(
    () => knownImageRatios.get(source.src) ?? null,
  );

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
      {...(title ? { accessibilityHint: title } : {})}
      contentFit="contain"
      onLoad={(event) => {
        const { width, height } = event.source;
        if (width > 0 && height > 0) {
          knownImageRatios.set(source.src, width / height);
          setAspectRatio(width / height);
        }
        setStatus('loaded');
      }}
      onError={() => setStatus('error')}
      style={{
        width: '100%',
        ...(aspectRatio ? { aspectRatio } : { height: PLACEHOLDER_HEIGHT }),
        maxHeight: MAX_INLINE_IMAGE_HEIGHT,
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
      accessibilityHint={
        title ? `${title}. Opens the image in the browser` : 'Opens the image in the browser'
      }
      onPress={() => void openUntrustedUrlInAppBrowser(source.src)}
    >
      {picture}
    </Pressable>
  );
}

function StoredImage({ src, alt }: { src: string; alt: string }) {
  const [viewing, setViewing] = useState(false);
  return (
    <>
      <GeneratedImage
        imageUrl={src}
        revisedPrompt={alt || undefined}
        onPress={() => setViewing(true)}
      />
      <ImageFullScreen
        imageUrl={src}
        prompt={alt || undefined}
        visible={viewing}
        onClose={() => setViewing(false)}
      />
    </>
  );
}

export function MarkdownImage({
  src,
  alt,
  title,
  colors,
  trustedImageKeys,
}: {
  src: string;
  alt: string;
  title?: string;
  colors: ColorScheme;
  trustedImageKeys?: ReadonlySet<string>;
}) {
  const shownAlt = readableImageAlt(alt);
  const candidateTitle = imageTitle(title, alt);
  const shownTitle = candidateTitle && candidateTitle !== shownAlt ? candidateTitle : undefined;
  if (resolveGeneratedImageUri(src)) {
    return <StoredImage src={src} alt={shownAlt} />;
  }
  const source = remoteImageSource(src);
  if (!source) {
    return <ImageNotice colors={colors} failed alt={shownAlt} detail="Image is unavailable" />;
  }
  return (
    <RemoteImage
      key={source.src}
      source={source}
      alt={shownAlt}
      {...(shownTitle ? { title: shownTitle } : {})}
      colors={colors}
      trustedImageKeys={trustedImageKeys}
    />
  );
}

export interface InlineImageConsent {
  host: string;
  load: () => void;
}

const INLINE_IMAGE_TOUCH_TARGET = 44;

function InlinePicture({
  source,
  alt,
  title,
  trustedImageKeys,
  link,
}: {
  source: RemoteImageSource;
  alt: string;
  title?: string;
  trustedImageKeys: ReadonlySet<string>;
  link: (consent: InlineImageConsent | null) => ReactNode;
}) {
  const [approved, setApproved] = useState(
    () =>
      source.kind === 'embedded' ||
      approvedImageUrls.has(source.src) ||
      trustedImageKeys.has(source.key),
  );
  const [failed, setFailed] = useState(false);

  if (source.kind === 'remote' && !approved) {
    return (
      <>
        {link({
          host: source.host,
          load: () => {
            approvedImageUrls.add(source.src);
            setApproved(true);
          },
        })}
      </>
    );
  }
  if (failed) return <>{link(null)}</>;

  const size = Math.round(chatTypography.body.lineHeight * PixelRatio.getFontScale());
  const picture = (
    <Image
      source={{ uri: source.src }}
      accessibilityLabel={alt || 'Image'}
      {...(title ? { accessibilityHint: title } : {})}
      contentFit="contain"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: radii.sm }}
    />
  );
  if (source.kind === 'embedded') return picture;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={alt || 'Image'}
      accessibilityHint={
        title ? `${title}. Opens the image in the browser` : 'Opens the image in the browser'
      }
      hitSlop={Math.max(0, Math.ceil((INLINE_IMAGE_TOUCH_TARGET - size) / 2))}
      onPress={() => void openUntrustedUrlInAppBrowser(source.src)}
    >
      {picture}
    </Pressable>
  );
}

export function InlineMarkdownImage({
  src,
  alt,
  title,
  trustedImageKeys,
  link,
}: {
  src: string;
  alt: string;
  title?: string;
  trustedImageKeys: ReadonlySet<string>;
  link: (consent: InlineImageConsent | null) => ReactNode;
}) {
  const source = resolveGeneratedImageUri(src) ? null : remoteImageSource(src);
  if (!source) return <>{link(null)}</>;
  return (
    <InlinePicture
      key={source.src}
      source={source}
      alt={readableImageAlt(alt)}
      {...(title ? { title } : {})}
      trustedImageKeys={trustedImageKeys}
      link={link}
    />
  );
}
