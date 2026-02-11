import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchStaticPage } from "@/lib/api";

const About = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["page", "about"],
    queryFn: () => fetchStaticPage("about"),
  });
  const staff = data?.staff ?? [];

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part.trim()[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="min-h-screen bg-[#f4ece7]">
      <Header />
      <main className="container mx-auto px-4 py-12 space-y-10">
        <section className="text-center space-y-3">
          <h1 className="text-3xl font-display font-semibold text-foreground">
            {data?.title ?? "Meet Our Team"}
          </h1>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading content...</p>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load this page."}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground max-w-3xl mx-auto whitespace-pre-wrap">
              {data?.body ??
                "And because we are constantly crushing for our clients, we want you to crush with us too. Meet the team that will be responsible for taking your business to the next level."}
            </p>
          )}
        </section>

        {staff.length === 0 ? (
          <Card className="border-dashed border-border/60 bg-white/70">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Team profiles will be shared here soon.
            </CardContent>
          </Card>
        ) : (
          <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {staff.map((member, index) => {
              const photo = member.photoSignedUrl ?? member.photoUrl ?? "";
              return (
                <Card
                  key={`${member.name}-${index}`}
                  className="border-border/30 bg-white shadow-sm"
                >
                  <CardContent className="p-6 text-center space-y-4">
                    <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-white ring-4 ring-white shadow">
                      <Avatar className="h-36 w-36">
                        {photo ? <AvatarImage src={photo} alt={member.name} /> : null}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-foreground">{member.name}</p>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        {member.role}
                      </p>
                    </div>
                    {member.bio ? (
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {member.bio}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default About;
