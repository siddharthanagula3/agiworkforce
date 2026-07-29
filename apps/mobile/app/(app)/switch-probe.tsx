/**
 * TEMPORARY diagnostic screen — delete once the Switch bug is resolved.
 *
 * Isolates why no toggle in the app responds. Both switches below use LOCAL
 * state, so any store/persistence layer is out of the picture: if the bare
 * react-native Switch flips and the shared wrapper does not, the fault is in
 * the wrapper; if NEITHER flips, the fault is global (NativeWind cssInterop
 * over core components on RN 0.83 / New Architecture is the lead suspect).
 */
import { createElement, useState } from 'react';
import { View, Text, Switch as BareSwitch, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Switch as SharedSwitch } from '@/components/ui/switch';

export default function SwitchProbeScreen() {
  const [bare, setBare] = useState(false);
  const [shared, setShared] = useState(false);
  const [raw, setRaw] = useState(false);
  const [pressable, setPressable] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, padding: 24, gap: 32 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Switch probe</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Text style={{ fontSize: 16, width: 150 }}>Bare RN: {String(bare)}</Text>
        <BareSwitch
          value={bare}
          onValueChange={(v) => {
            console.log('[probe] bare RN Switch fired ->', v);
            setBare(v);
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Text style={{ fontSize: 16, width: 150 }}>Shared: {String(shared)}</Text>
        <SharedSwitch
          value={shared}
          onValueChange={(v) => {
            console.log('[probe] shared Switch fired ->', v);
            setShared(v);
          }}
          accessibilityLabel="probe shared switch"
        />
      </View>

      {/* babel.config.js sets jsxImportSource: 'nativewind', so even a
          react-native Switch written as JSX goes through NativeWind's jsx
          runtime and gets cssInterop-wrapped. createElement bypasses the JSX
          transform entirely -- this is the only genuinely un-wrapped Switch. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Text style={{ fontSize: 16, width: 150 }}>createElement: {String(raw)}</Text>
        {createElement(BareSwitch, {
          value: raw,
          onValueChange: (v: boolean) => {
            console.log('[probe] createElement Switch fired ->', v);
            setRaw(v);
          },
        })}
      </View>

      {/* Control: proves plain touch on this screen works at all. */}
      <Pressable
        onPress={() => {
          console.log('[probe] Pressable fired');
          setPressable((v) => !v);
        }}
        style={{ padding: 16, backgroundColor: '#ddd', borderRadius: 8 }}
      >
        <Text style={{ fontSize: 16 }}>Pressable control: {String(pressable)}</Text>
      </Pressable>
    </SafeAreaView>
  );
}
