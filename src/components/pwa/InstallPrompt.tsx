import { useEffect, useMemo, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

const DISMISS_KEY = "servfix.pwa.install.dismissed.v1";

const isRunningStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

const InstallPrompt = () => {
  const isMobile = useIsMobile();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) {
      return;
    }

    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    setIsInstalled(isRunningStandalone());

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|android/.test(ua);
    setIsIosSafari(isIos && isSafari);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      localStorage.removeItem(DISMISS_KEY);
    };

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => {
      setIsInstalled(isRunningStandalone());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleInstalled);
    mediaQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleInstalled);
      mediaQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const showIosInstructions = useMemo(
    () => isIosSafari && !isInstalled && !deferredPrompt,
    [deferredPrompt, isInstalled, isIosSafari],
  );

  const shouldShow = import.meta.env.PROD && isMobile && !dismissed && !isInstalled && (deferredPrompt || showIosInstructions);

  if (!shouldShow) {
    return null;
  }

  const dismissPrompt = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const installApp = async () => {
    if (!deferredPrompt) {
      return;
    }

    try {
      setIsInstalling(true);
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-3 z-[60] px-3 sm:bottom-4 sm:px-4">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-primary/20 bg-background/95 p-4 shadow-lg backdrop-blur-md">
        <button
          type="button"
          aria-label="Dismiss install prompt"
          className="absolute right-5 top-5 text-muted-foreground transition-colors hover:text-foreground"
          onClick={dismissPrompt}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="pr-8">
          <p className="text-sm font-semibold text-foreground">Install SERVFIX</p>
          {deferredPrompt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Add SERVFIX to your home screen for faster access and an app-like experience.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Tap <Share2 className="mx-0.5 inline h-3.5 w-3.5" /> then choose <strong>Add to Home Screen</strong>.
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {deferredPrompt ? (
            <Button type="button" size="sm" variant="gold" className="flex-1" onClick={installApp} disabled={isInstalling}>
              <Download className="h-4 w-4" />
              {isInstalling ? "Installing..." : "Install app"}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline-gold" className="flex-1" onClick={dismissPrompt}>
              Got it
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={dismissPrompt}>
            Later
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
