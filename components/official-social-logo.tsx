import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

export type SocialNetwork = "instagram" | "facebook" | "youtube" | "whatsapp";

/** Símbolos vetoriais coloridos das marcas, sem depender de fonte de ícones. */
export function OfficialSocialLogo({ network, size = 24 }: { network: SocialNetwork; size?: number }) {
  if (network === "instagram") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Instagram">
        <Defs>
          <LinearGradient id="instagramGradient" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFB800" />
            <Stop offset="0.48" stopColor="#F04B67" />
            <Stop offset="1" stopColor="#8A3AB9" />
          </LinearGradient>
        </Defs>
        <Rect x="1" y="1" width="22" height="22" rx="6.5" fill="url(#instagramGradient)" />
        <Rect x="5.4" y="5.4" width="13.2" height="13.2" rx="4" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
        <Circle cx="12" cy="12" r="3.25" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
        <Circle cx="17.15" cy="6.95" r="1.1" fill="#FFFFFF" />
      </Svg>
    );
  }

  if (network === "facebook") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Facebook">
        <Rect x="1" y="1" width="22" height="22" rx="5.5" fill="#0866FF" />
        <Path d="M13.55 21v-8.15h2.74l.41-3.18h-3.15V7.64c0-.92.26-1.55 1.58-1.55h1.69V3.25A22.5 22.5 0 0 0 14.36 3c-2.44 0-4.11 1.49-4.11 4.24v2.43H7.5v3.18h2.75V21h3.3Z" fill="#FFFFFF" />
      </Svg>
    );
  }

  if (network === "youtube") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="YouTube">
        <Rect x="1.25" y="4.25" width="21.5" height="15.5" rx="4.3" fill="#FF0033" />
        <Path d="M10 8.25v7.5l6.3-3.75L10 8.25Z" fill="#FFFFFF" />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="WhatsApp">
      <Path d="M12 1.2a10.55 10.55 0 0 0-9.08 15.93L1.5 22.5l5.51-1.39A10.58 10.58 0 1 0 12 1.2Z" fill="#25D366" />
      <Path d="M16.55 13.63c-.25-.13-1.5-.74-1.74-.82-.23-.09-.4-.13-.57.13-.17.25-.65.82-.8.99-.15.17-.3.19-.56.07-.25-.13-1.07-.4-2.04-1.27-.75-.67-1.26-1.5-1.41-1.75-.15-.26-.02-.4.11-.53.12-.11.25-.3.38-.45.13-.15.17-.25.26-.42.08-.17.04-.32-.02-.45-.06-.13-.57-1.38-.78-1.88-.2-.5-.41-.43-.57-.44H8.32c-.18 0-.46.07-.69.32-.23.25-.89.87-.89 2.12s.91 2.46 1.04 2.63c.13.17 1.79 2.73 4.33 3.83.61.26 1.09.42 1.46.54.61.19 1.17.16 1.61.1.49-.07 1.5-.61 1.71-1.2.21-.59.21-1.1.15-1.2-.06-.1-.23-.17-.49-.3Z" fill="#FFFFFF" />
    </Svg>
  );
}
