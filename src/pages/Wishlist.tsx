import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCart } from "@/contexts/CartContext";
import { Heart, ShoppingCart, Star, MapPin, Trash2, BadgeCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const Wishlist = () => {
  const { wishlist, removeFromWishlist, clearWishlist } = useWishlist();
  const { addToCart } = useCart();

  const handleAddToCart = (item: typeof wishlist[0]) => {
    addToCart({
      id: item.id,
      name: item.name,
      category: item.category,
      location: item.location,
      rating: item.rating,
      image: item.image,
      verified: item.verified,
      packageType: "standard",
      packageName: "Standard Package",
      price: 1500, // Default price, in real app would come from service data
    });
    toast.success(`${item.name} added to cart!`);
  };

  const handleAddAllToCart = () => {
    wishlist.forEach((item) => {
      addToCart({
        id: item.id,
        name: item.name,
        category: item.category,
        location: item.location,
        rating: item.rating,
        image: item.image,
        verified: item.verified,
        packageType: "standard",
        packageName: "Standard Package",
        price: 1500,
      });
    });
    toast.success("All items added to cart!");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-10 pb-16">
        <div className="container mx-auto px-4">
          {/* Page Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">
                My Wishlist
              </h1>
              <p className="text-muted-foreground">
                {wishlist.length} {wishlist.length === 1 ? "service" : "services"} saved
              </p>
            </div>
            
            {wishlist.length > 0 && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={clearWishlist}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
                <Button variant="gold" onClick={handleAddAllToCart}>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add All to Cart
                </Button>
              </div>
            )}
          </div>

          {/* Empty State */}
          {wishlist.length === 0 ? (
            <div className="text-center py-20 bg-muted/30 rounded-2xl">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Heart className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-3">
                Your wishlist is empty
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Start exploring services and save your favorites to build your wishlist
              </p>
              <Button variant="gold" asChild>
                <Link to="/">
                  Browse Services
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          ) : (
            /* Wishlist Grid */
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {wishlist.map((item) => (
                <div
                  key={item.id}
                  className="group bg-card rounded-2xl overflow-hidden border border-border/50 service-card"
                >
                  {/* Image */}
                  <div className="relative h-48 overflow-hidden">
                    <Link to={`/service/${item.id}`}>
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </Link>
                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex gap-2">
                      {item.verified && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full">
                          <BadgeCheck className="w-3 h-3" />
                          Verified
                        </span>
                      )}
                      {item.topRated && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-gradient-gold text-primary-foreground text-xs font-medium rounded-full">
                          <Star className="w-3 h-3" />
                          Top Rated
                        </span>
                      )}
                    </div>
                    {/* Remove from wishlist */}
                    <button
                      onClick={() => removeFromWishlist(item.id)}
                      className="absolute top-3 right-3 p-2 bg-card/80 backdrop-blur-sm rounded-full hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <Heart className="w-4 h-4 fill-destructive text-destructive" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <Link to={`/service/${item.id}`}>
                      <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors mb-1">
                        {item.name}
                      </h3>
                    </Link>
                    <p className="text-sm text-muted-foreground mb-3">{item.category}</p>

                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-primary text-primary" />
                        <span className="font-semibold text-foreground">{item.rating}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {item.location}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <span className="font-semibold text-primary">{item.price}</span>
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={() => handleAddToCart(item)}
                      >
                        <ShoppingCart className="w-4 h-4 mr-1" />
                        Add to Cart
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Wishlist;
