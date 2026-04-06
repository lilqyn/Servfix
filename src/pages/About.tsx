import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  Users,
  Star,
  MapPin,
  CheckCircle,
  Target,
  Eye,
  Heart,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchStaticPage } from "@/lib/api";
import { DEFAULT_PAGES } from "@/lib/pageDefaults";

const About = () => {
  const { data } = useQuery({
    queryKey: ["page", "about"],
    queryFn: () => fetchStaticPage("about"),
  });

  const staff = data?.staff ?? [];
  const aboutConfig = data?.aboutConfig ?? DEFAULT_PAGES.about.aboutConfig!;
  const heroImage =
    aboutConfig.heroImageSignedUrl ??
    aboutConfig.heroImageUrl ??
    "/hero-ghana-marketplace.png";

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part.trim()[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 md:pb-24 md:pt-16">
            <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  {aboutConfig.introLabel ?? "About SERVFIX"}
                </p>
                <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  Ghana's Trusted{" "}
                  <span className="text-primary">Service Marketplace</span>
                </h1>
                <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground">
                  {aboutConfig.missionBody ??
                    "To empower every Ghanaian by making the hiring of skilled professionals safe, secure, and trustworthy."}
                </p>
                <div className="mt-8 flex flex-wrap gap-6">
                  {[
                    { icon: Users, label: "2,000+", sub: "Providers" },
                    { icon: Star, label: "4.9/5", sub: "Rating" },
                    { icon: MapPin, label: "10+", sub: "Cities" },
                  ].map((stat) => (
                    <div key={stat.sub} className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <stat.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-lg font-bold leading-none">{stat.label}</p>
                        <p className="text-xs text-muted-foreground">{stat.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-border/40">
                <img
                  src={heroImage}
                  alt="SERVFIX community"
                  className="h-64 w-full object-cover md:h-[380px]"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Mission & Values */}
        <section className="border-t border-border/40 bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <div className="mb-12 text-center">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Why SERVFIX
              </p>
              <h2 className="text-2xl font-bold sm:text-3xl">
                {aboutConfig.missionTitle ?? "Our Mission"}
              </h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Target,
                  title: "Our Mission",
                  body: aboutConfig.missionBody ??
                    "To empower every Ghanaian by making the hiring of skilled professionals safe, secure, and trustworthy.",
                },
                {
                  icon: Eye,
                  title: "Our Vision",
                  body: aboutConfig.visionLeft ??
                    "To be Ghana's premier digital bridge for service delivery.",
                },
                {
                  icon: Heart,
                  title: "Our Values",
                  body: "Trust, transparency, and fairness in every interaction. We put both buyers and providers first.",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-border/50 bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                    <card.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What We Do */}
        <section className="border-t border-border/40">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  What we do
                </p>
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {aboutConfig.whatWeDoTitle ?? "What We Do"}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  SERVFIX connects buyers with verified service providers across Ghana.
                  We handle the trust, payments, and communication — so both sides can
                  focus on what matters.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  ...aboutConfig.whatWeDoLeft,
                  ...aboutConfig.whatWeDoRight,
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-lg border border-border/40 bg-card p-3.5 shadow-sm"
                  >
                    <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                    <p className="text-sm leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Trust & Safety */}
        <section className="border-t border-border/40 bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <div className="mb-10 text-center">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Built for trust
              </p>
              <h2 className="text-2xl font-bold sm:text-3xl">
                How We Protect You
              </h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Shield,
                  title: "Payment Protection",
                  desc: "Your payment is held securely until the job is done and you're satisfied.",
                },
                {
                  icon: Users,
                  title: "Verified Providers",
                  desc: "Every provider completes identity verification before they can receive payouts.",
                },
                {
                  icon: Star,
                  title: "Real Reviews",
                  desc: "All ratings come from verified completed orders. No fake reviews.",
                },
                {
                  icon: CheckCircle,
                  title: "Dispute Resolution",
                  desc: "If something goes wrong, our team reviews both sides and mediates fairly.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border/50 bg-card p-5 text-center shadow-sm"
                >
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-1.5 text-sm font-semibold">{item.title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Team */}
        {staff.length > 0 && (
          <section className="border-t border-border/40">
            <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
              <div className="mb-10 text-center">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  The people behind SERVFIX
                </p>
                <h2 className="text-2xl font-bold sm:text-3xl">Our Team</h2>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {staff.map((member, index) => {
                  const photo = member.photoSignedUrl ?? member.photoUrl ?? "";
                  return (
                    <article
                      key={`${member.name}-${index}`}
                      className="rounded-xl border border-border/50 bg-card p-6 text-center shadow-sm transition-shadow hover:shadow-md"
                    >
                      <Avatar className="mx-auto h-20 w-20 ring-2 ring-border/60">
                        {photo ? (
                          <AvatarImage src={photo} alt={member.name} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="mt-4 font-semibold">{member.name}</p>
                      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                        {member.role}
                      </p>
                      {member.bio ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {member.bio}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="border-t border-border/40 bg-primary/5">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Ready to Get Started?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Whether you need a service or offer one — SERVFIX is for you.
              Join Ghana's fastest-growing service marketplace.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="/#/browse"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Browse Services
              </a>
              <a
                href="/#/sign-up"
                className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                Become a Provider
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
