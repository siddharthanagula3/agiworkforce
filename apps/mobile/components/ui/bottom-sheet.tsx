import { forwardRef, useCallback, useMemo } from 'react';
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetProps as GorhomProps,
} from '@gorhom/bottom-sheet';
import { useThemeColors } from '@/src/ui/theme';

interface BottomSheetProps extends Partial<GorhomProps> {
  children: React.ReactNode;
  snapPoints?: (string | number)[];
}

export const BottomSheet = forwardRef<GorhomBottomSheet, BottomSheetProps>(
  ({ children, snapPoints: snapPointsProp, ...props }, ref) => {
    const colors = useThemeColors();
    const snapPoints = useMemo(() => snapPointsProp ?? ['50%', '90%'], [snapPointsProp]);

    const renderBackdrop = useCallback(
      (backdropProps: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...backdropProps}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      [],
    );

    return (
      <GorhomBottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        // v5 defaults `enableDynamicSizing` to true, which injects a
        // content-height snap point into the array the caller passed and
        // renumbers the indices — `snapToIndex(0)` would then target the
        // measured content rather than the caller's first snap point. Explicit
        // snapPoints and dynamic sizing are two different contracts; a caller
        // that wants the dynamic one can still re-enable it via `props` below.
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surfaceElevated }}
        handleIndicatorStyle={{ backgroundColor: colors.neutralBorder, width: 36 }}
        {...props}
      >
        {children}
      </GorhomBottomSheet>
    );
  },
);

BottomSheet.displayName = 'BottomSheet';

export { default as GorhomBottomSheet } from '@gorhom/bottom-sheet';
