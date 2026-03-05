import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type AboutFontOption, fetchStaticPage } from "@/lib/api";
import { DEFAULT_PAGES } from "@/lib/pageDefaults";

const fontFamilyMap: Record<AboutFontOption, string> = {
  space_grotesk: '"Space Grotesk", system-ui, sans-serif',
  plus_jakarta_sans: '"Plus Jakarta Sans", system-ui, sans-serif',
  georgia_serif: 'Georgia, Cambria, "Times New Roman", serif',
  times_serif: '"Times New Roman", Times, serif',
  system_sans:
    '"Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
  mono: '"Courier New", Courier, ui-monospace, SFMono-Regular, Menlo, monospace',
};

const fallbackConfig = DEFAULT_PAGES.about.aboutConfig ?? {
  introLabel: "About Me",
  heroImageUrl: "/hero-ghana-marketplace.png",
  missionTitle: "Our Mission",
  missionBody:
    "To empower every Ghanaian by making the hiring of skilled professionals safe, secure, and trustworthy.",
  missionBullets: ["To offer transparent access to professionals across Ghana."],
  whatWeDoTitle: "What We Do",
  whatWeDoLeft: [
    "Trusted, seamless, and reliable services.",
    "Veteran professionals providing quality service.",
    "Verified professionals ensuring quality access across Ghana.",
    "Qualified processes.",
    "Offer reliable access and an easy-rated skill platform.",
  ],
  whatWeDoRight: [
    "Transparent payments.",
    "User-friendly technology empowering residents in and around Ghana.",
  ],
  visionTitle: "Our SERVFIX",
  visionLeft:
    "To be Ghana's premier digital bridge, open and mindful of community participation and payment security.",
  visionRight: [
    "To be secure with service experience, fair opportunities and exposure.",
    "To be a valuable pivot, implementing experience designed for trustworthiness, accessibility, and innovation.",
  ],
  headingFont: "space_grotesk" as AboutFontOption,
  bodyFont: "plus_jakarta_sans" as AboutFontOption,
};

const About = () => {
  const { data } = useQuery({
    queryKey: ["page", "about"],
    queryFn: () => fetchStaticPage("about"),
  });

  const staff = data?.staff ?? [];
  const aboutConfig = data?.aboutConfig ?? fallbackConfig;
  const heroImage =
    aboutConfig.heroImageSignedUrl ??
    aboutConfig.heroImageUrl ??
    "/hero-ghana-marketplace.png";
  const headingFontFamily = fontFamilyMap[aboutConfig.headingFont] ?? fontFamilyMap.space_grotesk;
  const bodyFontFamily =
    fontFamilyMap[aboutConfig.bodyFont] ?? fontFamilyMap.plus_jakarta_sans;

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part.trim()[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="min-h-screen bg-[#f5ede0] text-[#3f2a1e]" style={{ fontFamily: bodyFontFamily }}>
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 py-10 md:py-14">
        <section className="rounded-2xl border border-[#e8dccb] bg-[#f8f2e8] px-5 py-9 shadow-[0_12px_28px_rgba(79,55,33,0.08)] md:px-10 md:py-12">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xl font-medium text-[#c7922e]">{aboutConfig.introLabel}</p>
          </div>

          <div className="mt-10 border-[14px] border-[#bec49e] bg-[#bec49e]">
            <img
              src={heroImage}
              alt="Servfix community members greeting one another"
              className="h-72 w-full object-cover md:h-[430px]"
              loading="lazy"
            />
          </div>

          <section className="mt-12 grid gap-8 md:grid-cols-2 md:gap-12">
            <div className="space-y-5">
              <h2 className="text-5xl font-bold text-[#3d281d]" style={{ fontFamily: headingFontFamily }}>
                {aboutConfig.missionTitle}
              </h2>
              <p className="max-w-md text-2xl leading-relaxed text-[#453124]">
                {aboutConfig.missionBody}
              </p>

              <h3
                className="pt-2 text-4xl font-semibold text-[#3d281d]"
                style={{ fontFamily: headingFontFamily }}
              >
                {aboutConfig.whatWeDoTitle}
              </h3>
              <div className="space-y-3 pt-1">
                {aboutConfig.whatWeDoLeft.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <Check className="mt-1 h-7 w-7 flex-shrink-0 text-[#c7922e]" />
                    <p className="text-xl leading-relaxed text-[#453124]">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8 md:pt-20">
              <div className="space-y-3">
                {aboutConfig.missionBullets.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <Check className="mt-1 h-7 w-7 flex-shrink-0 text-[#c7922e]" />
                    <p className="text-[1.9rem] leading-tight text-[#453124]">{item}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-5">
                {aboutConfig.whatWeDoRight.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <Check className="mt-1 h-7 w-7 flex-shrink-0 text-[#c7922e]" />
                    <p className="text-xl leading-relaxed text-[#453124]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-12 border border-[#e2d8c8] bg-[#e8e3d6] p-6 md:p-10">
            <h2 className="text-5xl font-bold text-[#3d281d]" style={{ fontFamily: headingFontFamily }}>
              {aboutConfig.visionTitle}
            </h2>
            <div className="mt-8 grid gap-8 md:grid-cols-2 md:gap-10">
              <p className="text-3xl leading-relaxed text-[#453124]">{aboutConfig.visionLeft}</p>
              <div className="space-y-6">
                {aboutConfig.visionRight.map((item) => (
                  <p key={item} className="text-2xl leading-relaxed text-[#453124]">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </section>

          {staff.length > 0 ? (
            <section className="mt-12">
              <h2
                className="text-center text-4xl font-semibold text-[#3d281d]"
                style={{ fontFamily: headingFontFamily }}
              >
                Team
              </h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {staff.map((member, index) => {
                  const photo = member.photoSignedUrl ?? member.photoUrl ?? "";
                  return (
                    <article
                      key={`${member.name}-${index}`}
                      className="rounded-xl border border-[#dfd1bf] bg-[#f4ecdf] p-5 text-center shadow-sm"
                    >
                      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#f8f2e8] ring-4 ring-[#ece2d2]">
                        <Avatar className="h-20 w-20">
                          {photo ? <AvatarImage src={photo} alt={member.name} /> : null}
                          <AvatarFallback className="bg-[#e8dcc6] text-[#5d4537] font-semibold">
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <p className="mt-4 text-lg font-semibold text-[#3d281d]">{member.name}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-[#7d6554]">
                        {member.role}
                      </p>
                      {member.bio ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#5a4537]">
                          {member.bio}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
