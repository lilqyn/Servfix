import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "react-router-dom";
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
  const baseUrl = import.meta.env.BASE_URL;
  const heroImage = `${baseUrl}hero-ghana-marketplace.png`;

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
    <section className="relative overflow-hidden bg-background">
      <div className="absolute inset-0 hero-grid opacity-60" aria-hidden="true" />

      <div className="container relative mx-auto px-4 pt-12 pb-20 md:pt-16 md:pb-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="space-y-7">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-secondary/20 bg-secondary/10">
              <span className="w-2 h-2 bg-secondary rounded-full" />
              <span className="text-sm font-medium text-secondary">{hero.badge}</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight text-foreground">
              {hero.headline.prefix}{" "}
              <span className="text-primary">{hero.headline.highlight}</span>{" "}
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
                "green",
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
            <div className="flex flex-wrap items-center gap-6 pt-2">
              {hero.trustIndicators.map((indicator, index) => {
                const Icon = resolveHomeIcon(indicator.icon);
                const tone = indicatorTones[index % indicatorTones.length];
                return (
                  <div key={indicator.title} className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${tone}`}>
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

          {/* Right Content */}
          <div className="relative">
            <div className="relative mx-auto w-full max-w-[560px]">
              <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-lg">
                <img
                  src={heroImage}
                  alt="Service providers collaborating"
                  className="w-full h-auto object-cover object-top"
                />
              </div>

              {/* Floating Card - Active Users */}
              <div className="absolute left-5 top-24 rounded-2xl border border-white/60 bg-white/90 shadow-md px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center border-2 border-white">
                      A
                    </div>
                    <div className="w-7 h-7 rounded-full bg-secondary text-secondary-foreground text-xs font-bold flex items-center justify-center border-2 border-white">
                      K
                    </div>
                    <div className="w-7 h-7 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center border-2 border-white">
                      E
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{hero.floatingCards.onlineTitle}</p>
                    <p className="text-xs text-muted-foreground">{hero.floatingCards.onlineSubtitle}</p>
                  </div>
                </div>
              </div>

              {/* Floating Card - Recent Transaction */}
              <div className="absolute right-5 bottom-10 rounded-2xl border border-white/60 bg-white/90 shadow-md px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-secondary/10 rounded-xl">
                    {(() => {
                      const Icon = resolveHomeIcon(hero.floatingCards.escrowIcon);
                      return <Icon className="w-5 h-5 text-secondary" />;
                    })()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{hero.floatingCards.escrowTitle}</p>
                    <p className="text-xs text-muted-foreground">{hero.floatingCards.escrowSubtitle}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
