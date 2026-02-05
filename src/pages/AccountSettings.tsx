import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AccountSettingsContent from "@/components/settings/AccountSettingsContent";

const AccountSettings = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <AccountSettingsContent />
      </main>
      <Footer />
    </div>
  );
};

export default AccountSettings;
