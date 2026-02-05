import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface CartItem {
  id: string;
  tierId?: string;
  name: string;
  category: string;
  location: string;
  rating: number;
  image: string;
  verified: boolean;
  packageType: "basic" | "standard" | "premium";
  packageName: string;
  price: number;
  pricingType?: "flat" | "per_unit";
  unitLabel?: string | null;
  quantity?: number;
  eventDate?: string;
  guestCount?: number;
  notes?: string;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string) => void;
  updateCartItem: (id: string, updates: Partial<CartItem>) => void;
  isInCart: (id: string) => boolean;
  clearCart: () => void;
  getLineTotal: (item: CartItem) => number;
  getCartTotal: () => number;
  getEscrowAmount: () => number;
  getPlatformFee: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const PLATFORM_FEE_PERCENT = 5; // 5% platform fee
const ESCROW_HOLD_PERCENT = 100; // Hold 100% until service completion
const CART_KEY = "servfix-cart";
const LEGACY_CART_KEY = "serveghana-cart";

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem(CART_KEY) ?? localStorage.getItem(LEGACY_CART_KEY);
    if (!saved) {
      return [];
    }

    if (!localStorage.getItem(CART_KEY)) {
      localStorage.setItem(CART_KEY, saved);
      localStorage.removeItem(LEGACY_CART_KEY);
    }

    const parsed = JSON.parse(saved) as CartItem[];
    return parsed.map((item) => ({
      ...item,
      id: String(item.id),
      pricingType: item.pricingType ?? "flat",
      quantity:
        item.pricingType === "per_unit"
          ? Math.max(1, item.quantity ?? item.guestCount ?? 1)
          : undefined,
    }));
  });

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    localStorage.removeItem(LEGACY_CART_KEY);
  }, [cart]);

  const addToCart = (item: CartItem) => {
    const normalizedItem = {
      ...item,
      id: String(item.id),
      pricingType: item.pricingType ?? "flat",
      quantity:
        item.pricingType === "per_unit"
          ? Math.max(1, item.quantity ?? item.guestCount ?? 1)
          : undefined,
    };
    setCart((prev) => {
      // Replace if same service already in cart
      const filtered = prev.filter((i) => i.id !== normalizedItem.id);
      return [...filtered, normalizedItem];
    });
  };

  const removeFromCart = (id: string) => {
    const normalizedId = String(id);
    setCart((prev) => prev.filter((item) => item.id !== normalizedId));
  };

  const updateCartItem = (id: string, updates: Partial<CartItem>) => {
    const normalizedId = String(id);
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== normalizedId) {
          return item;
        }
        const next = { ...item, ...updates };
        if ((next.pricingType ?? "flat") === "per_unit") {
          const desiredQuantity = next.quantity ?? next.guestCount ?? 1;
          next.quantity = Math.max(1, Number.isFinite(desiredQuantity) ? Number(desiredQuantity) : 1);
        } else {
          next.quantity = undefined;
        }
        return next;
      })
    );
  };

  const isInCart = (id: string) => {
    const normalizedId = String(id);
    return cart.some((item) => item.id === normalizedId);
  };

  const clearCart = () => {
    setCart([]);
  };

  const getLineTotal = (item: CartItem) => {
    if (item.pricingType === "per_unit") {
      const quantity = Math.max(1, item.quantity ?? item.guestCount ?? 1);
      return item.price * quantity;
    }
    return item.price;
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + getLineTotal(item), 0);
  };

  const getPlatformFee = () => {
    return (getCartTotal() * PLATFORM_FEE_PERCENT) / 100;
  };

  const getEscrowAmount = () => {
    return (getCartTotal() * ESCROW_HOLD_PERCENT) / 100;
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateCartItem,
        isInCart,
        clearCart,
        getLineTotal,
        getCartTotal,
        getEscrowAmount,
        getPlatformFee,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
