import { forwardRef, useCallback, useMemo } from 'react';
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetProps as GorhomProps,
} from '@gorhom/bottom-sheet';
import { colors } from '@/lib/theme';

interface BottomSheetProps extends Partial<GorhomProps> {
  children: React.ReactNode;
  snapPoints?: (string | number)[];
}

export const BottomSheet = forwardRef<GorhomBottomSheet, BottomSheetProps>(
  ({ children, snapPoints: snapPointsProp, ...props }, ref) => {
    const snapPoints = useMemo(() => snapPointsProp ?? ['50%', '90%'], [snapPointsProp]);

    const renderBackdrop = useCallback(
      (backdropProps: any) => (
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
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surfaceElevated }}
        handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)', width: 36 }}
        {...props}
      >
        {children}
      </GorhomBottomSheet>
    );
  },
);

BottomSheet.displayName = 'BottomSheet';

export { default as GorhomBottomSheet } from '@gorhom/bottom-sheet';
