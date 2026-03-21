import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { createThemedStyles } from "../theme";

const logoSource = require("../../assets/splash.png");

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const ONBOARDING_DONE_KEY = "servfix_onboarding_done_v1";

type Slide = {
  key: string;
  title: string;
  subtitle: string;
  accent: string;
  bg: string;
  glyph: string;
};

const SLIDES: Slide[] = [
  {
    key: "find",
    title: "Find trusted\nprofessionals",
    subtitle:
      "Browse verified experts across hundreds of categories — plumbing, cleaning, design, tech, and more.",
    accent: "#15803d",
    bg: "#f0fdf4",
    glyph: "B",
  },
  {
    key: "pay",
    title: "Pay securely\nin escrow",
    subtitle:
      "Your payment is held safely until you're satisfied. Providers get paid only after you approve.",
    accent: "#0369a1",
    bg: "#f0f9ff",
    glyph: "P",
  },
  {
    key: "track",
    title: "Track every\nstep live",
    subtitle:
      "Watch job progress in real-time. Message your provider, review updates, and coordinate easily.",
    accent: "#ea580c",
    bg: "#fff7ed",
    glyph: "T",
  },
  {
    key: "approve",
    title: "Approve &\nrelease payment",
    subtitle:
      "When the job is done to your satisfaction, approve the work. Funds are released instantly.",
    accent: "#7c3aed",
    bg: "#faf5ff",
    glyph: "A",
  },
];

type Props = {
  onDone: (role: "buyer" | "provider") => void;
};

export function OnboardingScreen({ onDone }: Props) {
  const styles = useStyles();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedRole, setSelectedRole] = useState<"buyer" | "provider" | null>(null);
  const listRef = useRef<FlatList<Slide>>(null);
  const isLast = activeIndex === SLIDES.length - 1;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const goNext = () => {
    if (!isLast) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  };

  const finish = async (role: "buyer" | "provider") => {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "1");
    onDone(role);
  };

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index }) => (
          <View style={[styles.slide, { backgroundColor: item.bg, width: SCREEN_WIDTH }]}>
            {index === 0 ? (
              <Image source={logoSource} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={[styles.glyphWrap, { borderColor: item.accent }]}>
                <Text style={[styles.glyph, { color: item.accent }]}>{item.glyph}</Text>
              </View>
            )}
            <Text style={[styles.slideTitle, { color: item.accent }]}>{item.title}</Text>
            <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((slide, index) => (
          <View
            key={slide.key}
            style={[styles.dot, index === activeIndex && styles.dotActive]}
          />
        ))}
      </View>

      {isLast ? (
        <View style={styles.footer}>
          <Text style={styles.roleLabel}>How will you use Servfix?</Text>
          <View style={styles.roleRow}>
            <Pressable
              onPress={() => setSelectedRole("buyer")}
              style={[styles.roleCard, selectedRole === "buyer" && styles.roleCardActive]}
            >
              <Text style={[styles.roleTitle, selectedRole === "buyer" && styles.roleTitleActive]}>
                Buyer
              </Text>
              <Text style={[styles.roleHint, selectedRole === "buyer" && styles.roleHintActive]}>
                I want to hire services
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSelectedRole("provider")}
              style={[styles.roleCard, selectedRole === "provider" && styles.roleCardActive]}
            >
              <Text style={[styles.roleTitle, selectedRole === "provider" && styles.roleTitleActive]}>
                Provider
              </Text>
              <Text style={[styles.roleHint, selectedRole === "provider" && styles.roleHintActive]}>
                I want to offer services
              </Text>
            </Pressable>
          </View>
          <Pressable
            disabled={!selectedRole}
            onPress={() => selectedRole && void finish(selectedRole)}
            style={[styles.primaryButton, !selectedRole && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonText}>Get started</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.footer}>
          <Pressable onPress={goNext} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Next</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "1");
              onDone("buyer");
            }}
            style={styles.skipButton}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  root: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
  slide: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 20,
    gap: 20,
  },
  logo: {
    height: 80,
    width: 220,
  },
  glyphWrap: {
    alignItems: "center",
    borderRadius: 40,
    borderWidth: 3,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  glyph: {
    fontSize: 36,
    fontWeight: "900",
  },
  slideTitle: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0.2,
    lineHeight: 42,
    textAlign: "center",
  },
  slideSubtitle: {
    color: "#374151",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 16,
  },
  dot: {
    backgroundColor: "#d1d5db",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: palette.accentDeep,
    width: 22,
  },
  footer: {
    gap: 12,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  roleLabel: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 4,
    textAlign: "center",
  },
  roleRow: {
    flexDirection: "row",
    gap: 12,
  },
  roleCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 16,
    borderWidth: 2,
    flex: 1,
    gap: 4,
    padding: 16,
  },
  roleCardActive: {
    backgroundColor: "#f0fdf4",
    borderColor: palette.accentDeep,
  },
  roleTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  roleTitleActive: {
    color: palette.accentDeep,
  },
  roleHint: {
    color: palette.slate,
    fontSize: 13,
  },
  roleHintActive: {
    color: palette.accent,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 52,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: 10,
  },
  skipButtonText: {
    color: palette.slate,
    fontSize: 14,
    fontWeight: "700",
  },
}));
