import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-marketplace.jpg";
import type { HomeContentPayload } from "@/lib/api";
import { defaultHomeContent } from "@/lib/homeDefaults";
import { resolveHomeIcon } from "@/lib/homeIcons";

type HeroSectionProps = {
  content?: HomeContentPayload["hero"];
};

const isExternalLink = (href: string) => href.startsWith("http://") || href.startsWith("https://");

const HeroSection = ({ content }: HeroSectionProps) => {
  const hero = content ?? defaultHomeContent.hero;
  const primaryCta = hero.primaryCta;
  const secondaryCta = hero.secondaryCta;
  const indicatorTones = ["bg-primary/10 text-primary", "bg-secondary/10 text-secondary", "bg-accent/10 text-accent"];

  const renderCta = (
    cta: typeof primaryCta,
    variant: "gold" | "outline-gold",
    icon?: JSX.Element,
    iconPosition: "before" | "after" = "after",
  ) => {
    if (!cta?.label) return null;
    const href = cta.href || "/";
    const isExternal = isExternalLink(href) || href.startsWith("#");
    const linkProps = isExternal
      ? { href, target: href.startsWith("http") ? "_blank" : undefined, rel: "noreferrer" }
      : { to: href };

    return (
      <Button variant={variant} size="xl" className="group" asChild>
        {isExternal ? (
          <a {...linkProps}>
            {icon && iconPosition === "before" ? icon : null}
            {cta.label}
            {icon && iconPosition === "after" ? icon : null}
          </a>
        ) : (
          <Link {...(linkProps as { to: string })}>
            {icon && iconPosition === "before" ? icon : null}
            {cta.label}
            {icon && iconPosition === "after" ? icon : null}
          </Link>
        )}
      </Button>
    );
  };

  return (
    <section className="relative min-h-screen pt-20 overflow-hidden bg-gradient-hero">
      {/* Kente pattern overlay */}
      <div className="absolute inset-0 kente-pattern opacity-50" />

      {/* Floating decorative elements */}
      <div className="absolute top-32 left-10 w-20 h-20 bg-primary/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-32 right-20 w-32 h-32 bg-secondary/20 rounded-full blur-3xl animate-float delay-300" />
      <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-accent/20 rounded-full blur-2xl animate-float delay-500" />

      <div className="container mx-auto px-4 py-12 md:py-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="relative z-10 space-y-8 animate-slide-up">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-secondary/10 border border-secondary/30 rounded-full">
              <span className="w-2 h-2 bg-secondary rounded-full animate-pulse" />
              <span className="text-sm font-medium text-secondary">{hero.badge}</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight">
              {hero.headline.prefix}{" "}
              <span className="text-gradient-gold">{hero.headline.highlight}</span>{" "}
              {hero.headline.suffix}
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
              {hero.subheadline}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              {renderCta(
                primaryCta,
                "gold",
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />,
              )}
              {renderCta(
                secondaryCta,
                "outline-gold",
                <Play className="w-5 h-5" />,
                "before",
              )}
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center gap-8 pt-4">
              {hero.trustIndicators.map((indicator, index) => {
                const Icon = resolveHomeIcon(indicator.icon);
                const tone = indicatorTones[index % indicatorTones.length];
                return (
                  <div key={indicator.title} className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${tone}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{indicator.title}</p>
                      <p className="text-xs text-muted-foreground">{indicator.subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Content - Hero Image */}
          <div className="relative z-10 animate-slide-up delay-200">
            <div className="relative">
              {/* Main Image */}
              <div className="relative rounded-2xl overflow-hidden shadow-lg gold-glow">
                <img
                  src={heroImage}
                  alt="Service providers collaborating"
                  className="w-full h-auto object-cover"
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent" />
              </div>

              {/* Floating Card - Active Users */}
              <div className="absolute -left-4 md:-left-8 top-1/4 glass-card p-4 rounded-xl animate-float">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-gold border-2 border-card flex items-center justify-center text-xs font-bold text-primary-foreground">
                      A
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-green border-2 border-card flex items-center justify-center text-xs font-bold text-secondary-foreground">
                      K
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-warm border-2 border-card flex items-center justify-center text-xs font-bold text-secondary-foreground">
                      E
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{hero.floatingCards.onlineTitle}</p>
                    <p className="text-xs text-muted-foreground">{hero.floatingCards.onlineSubtitle}</p>
                  </div>
                </div>
              </div>

              {/* Floating Card - Recent Transaction */}
              <div className="absolute -right-4 md:-right-8 bottom-1/4 glass-card p-4 rounded-xl animate-float delay-500">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-secondary/20 rounded-lg">
                    {(() => {
                      const Icon = resolveHomeIcon(hero.floatingCards.escrowIcon);
                      return <Icon className="w-6 h-6 text-secondary" />;
                    })()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{hero.floatingCards.escrowTitle}</p>
                    <p className="text-xs text-muted-foreground">{hero.floatingCards.escrowSubtitle}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M0 50L48 45.8C96 41.7 192 33.3 288 33.3C384 33.3 480 41.7 576 50C672 58.3 768 66.7 864 66.7C960 66.7 1056 58.3 1152 50C1248 41.7 1344 33.3 1392 29.2L1440 25V100H1392C1344 100 1248 100 1152 100C1056 100 960 100 864 100C768 100 672 100 576 100C480 100 384 100 288 100C192 100 96 100 48 100H0V50Z"
            className="fill-background"
          />
        </svg>
      </div>
    </section>
  );
};

export default HeroSection;
