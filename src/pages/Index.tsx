import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import ServiceCategories from "@/components/ServiceCategories";
import FeaturedProviders from "@/components/FeaturedProviders";
import SocialFeed from "@/components/SocialFeed";
import HowItWorks from "@/components/HowItWorks";
import Footer from "@/components/Footer";
import { useHomeContent } from "@/hooks/useHomeContent";

const Index = () => {
  const { data: homeContent } = useHomeContent();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection content={homeContent?.hero} />
        <ServiceCategories content={homeContent?.categories} />
        <FeaturedProviders />
        <HowItWorks content={homeContent?.howItWorks} />
        <SocialFeed />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
