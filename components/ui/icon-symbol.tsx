// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "wrench.and.screwdriver.fill": "build",
  "lightbulb.fill": "lightbulb",
  "megaphone.fill": "campaign",
  "person.3.fill": "groups",
  "tray.fill": "inbox",
  "arrow.triangle.2.circlepath": "autorenew",
  "checkmark.circle.fill": "check-circle",
  "person.crop.circle.fill": "account-circle",
  "link": "link",
  "bell.fill": "notifications",
  "list.bullet.rectangle.fill": "list-alt",
  "gearshape.fill": "settings",
  "drop.fill": "water-drop",
  "clock.fill": "history",
  "lock.fill": "lock",
  "externaldrive.fill": "backup",
  "textformat.size": "format-size",
  "newspaper.fill": "article",
  "bubble.left.and.bubble.right.fill": "forum",
  "doc.text.fill": "description",
  "chart.bar.fill": "bar-chart",
  "book.fill": "menu-book",
  "calendar": "event",
  "building.2.fill": "apartment",
  "mappin.and.ellipse": "place",
  "phone.fill": "call",
  "plus": "add",
  "fingerprint": "fingerprint",
  "shield.fill": "shield",
  "globe": "public",
  "exclamationmark.triangle.fill": "warning",
  "arrow.right": "arrow-forward",
  "magnifyingglass": "search",
  "sparkles": "auto-awesome",
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
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
