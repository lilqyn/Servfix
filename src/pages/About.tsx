import { useQuery } from "@tanstack/react-query";
import { Quote } from "lucide-react";
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
        {/* Full-width hero image with overlay */}
        <section className="relative h-[340px] overflow-hidden md:h-[420px]">
          <img
            src={heroImage}
            alt="SERVFIX community"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
          <div className="absolute inset-0 flex items-end">
            <div className="mx-auto w-full max-w-4xl px-6 pb-10 md:pb-14">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/70">
                Our Story
              </p>
              <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl">
                Building trust,{" "}
                <span className="text-primary">one service at a time</span>
              </h1>
            </div>
          </div>
        </section>

        {/* The Story */}
        <section className="mx-auto max-w-3xl px-6 py-14 md:py-20">
          <div className="prose prose-lg max-w-none">
            <p className="text-lg leading-relaxed text-muted-foreground">
              In Ghana, finding a reliable service provider has always been a
              challenge. You ask friends, scroll through social media, or take a
              chance on someone you've never met. Sometimes it works out.
              Sometimes it doesn't. And when it doesn't, there's no safety net.
            </p>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                SERVFIX was built to change that.
              </span>{" "}
              We created a marketplace where every provider is verified, every
              payment is protected, and every review comes from a real completed
              job. No guesswork. No risk.
            </p>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Whether you need a plumber at midnight or a hairstylist for your
              wedding — SERVFIX connects you with someone you can trust, backed
              by a system designed to keep both sides safe.
            </p>
          </div>
        </section>

        {/* Mission, Vision, Values — timeline style */}
        <section className="border-t border-border/40 bg-muted/30">
          <div className="mx-auto max-w-3xl px-6 py-14 md:py-20">
            <div className="space-y-12">
              {[
                {
                  label: "Mission",
                  text:
                    aboutConfig.missionBody ??
                    "To empower every Ghanaian by making the hiring of skilled professionals safe, secure, and trustworthy.",
                },
                {
                  label: "Vision",
                  text:
                    aboutConfig.visionLeft ??
                    "To be Ghana's premier digital bridge for service delivery.",
                },
                {
                  label: "Values",
                  text: "Trust, transparency, and fairness. We believe every provider deserves access to customers, and every customer deserves reliable service. We don't take sides — we build systems that make both succeed.",
                },
              ].map((item, i) => (
                <div key={item.label} className="flex gap-6">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {i + 1}
                    </div>
                    {i < 2 && (
                      <div className="mt-2 h-full w-px bg-border" />
                    )}
                  </div>
                  <div className="pb-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                      {item.label}
                    </p>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground md:text-lg">
                      {item.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quote / Founder message */}
        <section className="border-t border-border/40">
          <div className="mx-auto max-w-3xl px-6 py-14 md:py-20">
            <div className="rounded-2xl border border-border/50 bg-card p-8 shadow-sm md:p-10">
              <Quote className="mb-4 h-8 w-8 text-primary/30" />
              <blockquote className="text-lg font-medium leading-relaxed italic md:text-xl">
                "We didn't build SERVFIX to be just another app. We built it
                because every skilled worker in Ghana deserves a fair shot at
                earning a living, and every household deserves to hire someone
                they can trust."
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <p className="text-sm font-medium text-muted-foreground">
                  The SERVFIX Team
                </p>
                <div className="h-px flex-1 bg-border" />
              </div>
            </div>
          </div>
        </section>

        {/* What makes us different */}
        <section className="border-t border-border/40 bg-muted/30">
          <div className="mx-auto max-w-4xl px-6 py-14 md:py-20">
            <h2 className="mb-10 text-center text-2xl font-bold">
              What Makes SERVFIX Different
            </h2>

            <div className="grid gap-px overflow-hidden rounded-xl border border-border/50 bg-border/50 sm:grid-cols-2">
              {[
                {
                  title: "Verified Providers",
                  desc: "Every provider goes through identity verification. You always know who you're hiring.",
                },
                {
                  title: "Payment Protection",
                  desc: "Your money is held securely until the job is done. No upfront risk.",
                },
                {
                  title: "Real Reviews Only",
                  desc: "Every review comes from a verified completed order. No fakes, no paid reviews.",
                },
                {
                  title: "Built-in Dispute Resolution",
                  desc: "If something goes wrong, our team reviews evidence from both sides and mediates fairly.",
                },
                {
                  title: "Private Communication",
                  desc: "Chat and call providers through the app. Your personal number is never shared.",
                },
                {
                  title: "Made for Ghana",
                  desc: "Mobile Money payments, local categories, and support tailored to how Ghanaians work and hire.",
                },
              ].map((item) => (
                <div key={item.title} className="bg-card p-6">
                  <h3 className="mb-1.5 font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
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
            <div className="mx-auto max-w-4xl px-6 py-14 md:py-20">
              <div className="mb-10 text-center">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  The people behind SERVFIX
                </p>
                <h2 className="text-2xl font-bold">Our Team</h2>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {staff.map((member, index) => {
                  const photo =
                    member.photoSignedUrl ?? member.photoUrl ?? "";
                  return (
                    <article
                      key={`${member.name}-${index}`}
                      className="flex items-start gap-4 rounded-xl border border-border/50 bg-card p-5 shadow-sm"
                    >
                      <Avatar className="h-14 w-14 shrink-0 ring-2 ring-border/60">
                        {photo ? (
                          <AvatarImage src={photo} alt={member.name} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold leading-tight">
                          {member.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.role}
                        </p>
                        {member.bio ? (
                          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground line-clamp-3">
                            {member.bio}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* CTA — different from home page */}
        <section className="border-t border-border/40">
          <div className="mx-auto max-w-3xl px-6 py-14 text-center md:py-20">
            <h2 className="text-2xl font-bold">Join the SERVFIX Community</h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              Whether you're looking for a trusted provider or ready to grow
              your service business — there's a place for you on SERVFIX.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="/#/browse"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Find a Provider
              </a>
              <a
                href="/#/sign-up"
                className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                List Your Services
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
