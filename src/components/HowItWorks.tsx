import type { HomeContentPayload } from "@/lib/api";
import { defaultHomeContent } from "@/lib/homeDefaults";
import { resolveHomeIcon } from "@/lib/homeIcons";

type HowItWorksProps = {
  content?: HomeContentPayload["howItWorks"];
};

const HowItWorks = ({ content }: HowItWorksProps) => {
  const howItWorks = content ?? defaultHomeContent.howItWorks;

  return (
    <section className="py-20 bg-muted/30" id="how-it-works">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-1.5 bg-secondary/10 text-secondary text-sm font-semibold rounded-full mb-4">
            {howItWorks.badge}
          </span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            {howItWorks.title}
          </h2>
          <p className="text-lg text-muted-foreground">{howItWorks.subtitle}</p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {howItWorks.steps.map((step, index) => {
            const Icon = resolveHomeIcon(step.icon);
            return (
              <div key={step.title} className="relative">
                {/* Connector Line */}
                {index < howItWorks.steps.length - 1 && (
                  <div className="hidden lg:block absolute top-16 left-full w-full h-0.5 bg-gradient-to-r from-border to-transparent -translate-x-8 z-0" />
                )}

                <div className="relative bg-card rounded-2xl p-6 border border-border/50 hover:shadow-lg transition-shadow h-full">
                  {/* Number Badge */}
                  <div className="absolute -top-3 -right-3 w-10 h-10 bg-gradient-gold rounded-full flex items-center justify-center text-primary-foreground font-display font-bold text-sm shadow-gold">
                    {step.number || String(index + 1).padStart(2, "0")}
                  </div>

                  {/* Icon */}
                  <div className={`w-14 h-14 rounded-xl ${step.color} flex items-center justify-center mb-5`}>
                    <Icon className="w-7 h-7" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-display font-bold text-foreground mb-3">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
