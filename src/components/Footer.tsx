import { Link } from "react-router-dom";
import { Facebook, Twitter, Instagram, Youtube, Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublicSettings } from "@/hooks/usePublicSettings";

const Footer = () => {
  const { data: publicSettings } = usePublicSettings();
  const communityEnabled = publicSettings?.featureFlags.community ?? true;
  const baseUrl = import.meta.env.BASE_URL;
  const logoUrl = `${baseUrl}servfix-logo.png`;
  const iconUrl = `${baseUrl}servfix-icon.png`;

  return (
    <footer className="bg-foreground text-background">
      {/* CTA Section */}
      <div className="border-b border-background/10">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-lg text-background/70 mb-8 max-w-2xl mx-auto">
              Join thousands of Ghanaians already using SERVFIX to find and offer services. 
              Whether you're a client or a service provider, we've got you covered.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button variant="gold" size="xl" asChild>
                <Link to="/browse">Find Services</Link>
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="border-background/30 text-background hover:bg-background/10 hover:text-background"
                asChild
              >
                <Link to="/sign-up">Become a Provider</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-3 mb-4" aria-label="SERVFIX home">
              <img
                src={iconUrl}
                alt="SERVFIX icon"
                className="h-12 w-12 rounded-2xl shadow-md"
              />
              <img
                src={logoUrl}
                alt="SERVFIX"
                className="h-8 w-auto"
              />
            </Link>
            <p className="text-background/70 mb-6 max-w-md">
              Connecting skilled service providers with clients across Ghana. 
              Secure payments, verified professionals, and a trusted community.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="p-2 bg-background/10 rounded-lg hover:bg-background/20 transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="p-2 bg-background/10 rounded-lg hover:bg-background/20 transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="p-2 bg-background/10 rounded-lg hover:bg-background/20 transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="p-2 bg-background/10 rounded-lg hover:bg-background/20 transition-colors">
                <Youtube className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-3 text-background/70">
              <li><Link to="/browse" className="hover:text-primary transition-colors">Browse Services</Link></li>
              <li><Link to="/browse" className="hover:text-primary transition-colors">Find Providers</Link></li>
              {communityEnabled && (
                <li>
                  <Link to="/community" className="hover:text-primary transition-colors">
                    Community Feed
                  </Link>
                </li>
              )}
              <li><Link to="/" className="hover:text-primary transition-colors">About Us</Link></li>
              <li>
                <a href="mailto:hello@servfix.com" className="hover:text-primary transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* For Providers */}
          <div>
            <h4 className="font-semibold mb-4">For Providers</h4>
            <ul className="space-y-3 text-background/70">
              <li><Link to="/" className="hover:text-primary transition-colors">How It Works</Link></li>
              <li><Link to="/browse" className="hover:text-primary transition-colors">Pricing</Link></li>
              {communityEnabled && (
                <li>
                  <Link to="/community" className="hover:text-primary transition-colors">
                    Success Stories
                  </Link>
                </li>
              )}
              <li><Link to="/dashboard" className="hover:text-primary transition-colors">Provider Resources</Link></li>
              <li><Link to="/sign-up" className="hover:text-primary transition-colors">Join as Provider</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-4">Contact Us</h4>
            <ul className="space-y-3 text-background/70">
              <li>
                <a
                  href="https://maps.google.com/?q=Accra%2C%20Ghana"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 hover:text-background transition-colors"
                >
                  <MapPin className="w-4 h-4 text-primary" />
                  <span>Accra, Ghana</span>
                </a>
              </li>
              <li>
                <a href="tel:+233201234567" className="flex items-center gap-2 hover:text-background transition-colors">
                  <Phone className="w-4 h-4 text-primary" />
                  <span>+233 20 123 4567</span>
                </a>
              </li>
              <li>
                <a href="mailto:hello@servfix.com" className="flex items-center gap-2 hover:text-background transition-colors">
                  <Mail className="w-4 h-4 text-primary" />
                  <span>hello@servfix.com</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-background/10 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-background/50">
          <p>© 2024 SERVFIX. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-background transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-background transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-background transition-colors">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;


