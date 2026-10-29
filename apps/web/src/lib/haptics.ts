import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNative } from './platform';

/** A light tap on check-ins and completions in the Android app; a no-op on the web. */
export function tap() {
  if (isNative) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

export function success() {
  if (isNative) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
}
