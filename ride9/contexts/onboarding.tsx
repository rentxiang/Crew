import { createContext, useContext } from "react";

export const ONBOARDING_KEY = "@crew/onboarding_seen";

export const OnboardingContext = createContext<{ markSeen: () => void }>({
  markSeen: () => {},
});

export const useOnboarding = () => useContext(OnboardingContext);
