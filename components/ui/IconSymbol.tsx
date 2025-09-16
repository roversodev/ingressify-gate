// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import React, { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  // existentes
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',

  // usados no app
  envelope: 'email',
  lock: 'lock',
  globe: 'public',
  'exclamationmark.triangle': 'warning',
  'person.2': 'people',
  clock: 'schedule',
  'checkmark.circle': 'check-circle',
  'xmark.circle': 'cancel',
  'arrow.left': 'arrow-back',
  'person.badge.plus': 'person-add',
  'doc.on.doc': 'content-copy',
  trash: 'delete',
  'person.crop.circle.badge.exclamationmark': 'person',
  'list.bullet': 'format-list-bulleted',
  magnifyingglass: 'search',
  'checkmark.circle.fill': 'check-circle',
  'person.3': 'groups',
  'person.circle': 'account-circle',
  xmark: 'close',
  calendar: 'event',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  // fallback seguro para evitar crash se algum name novo escapar do mapeamento
  const materialName = MAPPING[name] ?? 'help';
  return <MaterialIcons color={color} size={size} name={materialName} style={style} />;
}
