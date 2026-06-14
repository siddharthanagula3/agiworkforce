import { useState, useCallback } from 'react';
import { View, Pressable, StyleSheet, Alert, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageIcon, Camera } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ImageWithQuestion } from '@/src/features/image/components/ImageWithQuestion';
import { useThemeColors } from '@/src/ui/theme';
import { pickImageAssetsFromLibrary } from '@/src/features/media/photo-picker';

/**
 * ImageScreen — entry point for the image-with-question flow.
 *
 * On load: immediately shows pick-or-shoot chooser.
 * Once an image is selected: renders ImageWithQuestion full-screen.
 */
export default function ImageScreen() {
  const router = useRouter();
  const c = useThemeColors();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const pickFromLibrary = useCallback(async () => {
    setIsPicking(true);
    try {
      const assets = await pickImageAssetsFromLibrary();
      if (assets.length > 0) {
        setImageUri(assets[0].uri);
      }
    } catch {
      Alert.alert('Photos', 'Could not open Photos. Please try again.');
    } finally {
      setIsPicking(false);
    }
  }, []);

  const shootWithCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Access', 'Allow camera access to take a photo for analysis.', [
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    setIsPicking(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
        exif: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } finally {
      setIsPicking(false);
    }
  }, []);

  const handleImageClose = useCallback(() => {
    setImageUri(null);
  }, []);

  // If an image is selected, show the full-screen vision flow
  if (imageUri) {
    return <ImageWithQuestion imageUri={imageUri} onClose={handleImageClose} />;
  }

  // Picker chooser
  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: c.surfaceBase }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        <Text variant="subheading" style={{ color: c.textPrimary }}>
          Image
        </Text>
        <Pressable
          onPress={handleClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={{ color: c.textMuted, fontSize: 15 }}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: c.textMuted }]}>
          Select an image to analyse with on-device AI
        </Text>

        {isPicking ? (
          <ActivityIndicator color={c.teal} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.options}>
            <Pressable
              testID="image-picker-library-btn"
              onPress={pickFromLibrary}
              style={({ pressed }) => [
                styles.optionCard,
                {
                  backgroundColor: pressed ? c.surfaceHover : c.surfaceElevated,
                  borderColor: c.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Choose from photo library"
            >
              <View style={[styles.optionIcon, { backgroundColor: `${c.teal}22` }]}>
                <ImageIcon size={28} color={c.teal} />
              </View>
              <Text style={[styles.optionLabel, { color: c.textPrimary }]}>Photo Library</Text>
              <Text style={[styles.optionHint, { color: c.textMuted }]}>
                Pick an existing photo
              </Text>
            </Pressable>

            <Pressable
              onPress={shootWithCamera}
              style={({ pressed }) => [
                styles.optionCard,
                {
                  backgroundColor: pressed ? c.surfaceHover : c.surfaceElevated,
                  borderColor: c.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Take a photo with camera"
            >
              <View style={[styles.optionIcon, { backgroundColor: `${c.teal}22` }]}>
                <Camera size={28} color={c.teal} />
              </View>
              <Text style={[styles.optionLabel, { color: c.textPrimary }]}>Camera</Text>
              <Text style={[styles.optionHint, { color: c.textMuted }]}>Take a new photo</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  eyebrow: {
    fontSize: 13,
    marginBottom: 24,
  },
  options: {
    gap: 16,
  },
  optionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  optionHint: {
    fontSize: 13,
  },
});
