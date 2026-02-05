import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface WishlistItem {
  id: string;
  name: string;
  category: string;
  location: string;
  rating: number;
  reviews: number;
  price: string;
  image: string;
  verified: boolean;
  topRated: boolean;
}

interface WishlistContextType {
  wishlist: WishlistItem[];
  addToWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (id: string) => void;
  isInWishlist: (id: string) => boolean;
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);
const WISHLIST_KEY = "servfix-wishlist";
const LEGACY_WISHLIST_KEY = "serveghana-wishlist";

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const [wishlist, setWishlist] = useState<WishlistItem[]>(() => {
    const saved = localStorage.getItem(WISHLIST_KEY) ?? localStorage.getItem(LEGACY_WISHLIST_KEY);
    if (!saved) {
      return [];
    }

    if (!localStorage.getItem(WISHLIST_KEY)) {
      localStorage.setItem(WISHLIST_KEY, saved);
      localStorage.removeItem(LEGACY_WISHLIST_KEY);
    }

    const parsed = JSON.parse(saved) as WishlistItem[];
    return parsed.map((item) => ({ ...item, id: String(item.id) }));
  });

  useEffect(() => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    localStorage.removeItem(LEGACY_WISHLIST_KEY);
  }, [wishlist]);

  const addToWishlist = (item: WishlistItem) => {
    const normalizedItem = { ...item, id: String(item.id) };
    setWishlist((prev) => {
      if (prev.find((i) => i.id === normalizedItem.id)) return prev;
      return [...prev, normalizedItem];
    });
  };

  const removeFromWishlist = (id: string) => {
    const normalizedId = String(id);
    setWishlist((prev) => prev.filter((item) => item.id !== normalizedId));
  };

  const isInWishlist = (id: string) => {
    const normalizedId = String(id);
    return wishlist.some((item) => item.id === normalizedId);
  };

  const clearWishlist = () => {
    setWishlist([]);
  };

  return (
    <WishlistContext.Provider
      value={{ wishlist, addToWishlist, removeFromWishlist, isInWishlist, clearWishlist }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (context === undefined) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return context;
};
