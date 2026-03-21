import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart, Star, Truck, Shield, Search, SlidersHorizontal, X, Plus, Minus, CreditCard, Package, Loader2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

interface MerchItem {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  category: string;
  badge?: string;
  rating: number;
  reviews: number;
  sizes?: string[];
  colors?: { name: string; hex: string }[];
  inStock: boolean;
}

interface CartItem {
  item: MerchItem;
  quantity: number;
  size: string;
  color: string;
}

const MERCH_ITEMS: MerchItem[] = [
  {
    id: "bf-basketball-1",
    name: "BetFans Pro Basketball",
    description: "Official size & weight indoor/outdoor basketball with BetFans branding. Premium composite leather grip.",
    price: 49.99,
    originalPrice: 64.99,
    image: "https://images.unsplash.com/photo-1519861531473-9200262188bf?w=600&h=600&fit=crop",
    category: "Basketballs",
    badge: "Best Seller",
    rating: 4.9,
    reviews: 412,
    sizes: ["Official (29.5\")", "Youth (27.5\")"],
    colors: [
      { name: "Classic Orange", hex: "#e87614" },
      { name: "BetFans Green", hex: "#22c55e" },
    ],
    inStock: true,
  },
  {
    id: "bf-football-1",
    name: "Spider AI Game Football",
    description: "Premium composite football with Spider AI logo. Official size with enhanced grip texture for all-weather play.",
    price: 44.99,
    image: "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=600&h=600&fit=crop",
    category: "Footballs",
    badge: "New",
    rating: 4.7,
    reviews: 198,
    sizes: ["Official", "Junior"],
    colors: [
      { name: "Classic Brown", hex: "#8B4513" },
      { name: "BetFans Green", hex: "#22c55e" },
    ],
    inStock: true,
  },
  {
    id: "bf-soccer-1",
    name: "BetFans Match Soccer Ball",
    description: "FIFA-quality match soccer ball with BetFans crest. Thermally bonded panels for consistent flight.",
    price: 39.99,
    image: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=600&h=600&fit=crop",
    category: "Soccer",
    rating: 4.8,
    reviews: 267,
    sizes: ["Size 5 (Adult)", "Size 4 (Youth)"],
    colors: [
      { name: "White/Green", hex: "#22c55e" },
      { name: "Black/Green", hex: "#0a0f1e" },
    ],
    inStock: true,
  },
  {
    id: "bf-jersey-1",
    name: "Legend Tier Basketball Jersey",
    description: "Exclusive mesh basketball jersey for Legend members. Breathable, moisture-wicking with custom #1 numbering.",
    price: 89.99,
    image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600&h=600&fit=crop",
    category: "Jerseys",
    badge: "Legend Exclusive",
    rating: 5.0,
    reviews: 87,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    colors: [
      { name: "Midnight Navy", hex: "#0a0f1e" },
      { name: "Electric Green", hex: "#22c55e" },
    ],
    inStock: true,
  },
  {
    id: "bf-hockey-1",
    name: "BetFans Ice Hockey Puck Set",
    description: "Official weight regulation hockey pucks (6-pack) with laser-etched BetFans logo. Vulcanized rubber.",
    price: 29.99,
    image: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&h=600&fit=crop",
    category: "Hockey",
    rating: 4.6,
    reviews: 143,
    sizes: ["Standard (6-pack)"],
    colors: [
      { name: "Classic Black", hex: "#1a1a2e" },
    ],
    inStock: true,
  },
  {
    id: "bf-baseball-1",
    name: "Spider AI Training Baseball Set",
    description: "Premium leather baseballs (3-pack) with raised red stitching and Spider AI branding. Regulation size and weight.",
    price: 24.99,
    image: "https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=600&h=600&fit=crop",
    category: "Baseball",
    rating: 4.5,
    reviews: 176,
    sizes: ["Regulation (3-pack)"],
    colors: [
      { name: "Classic White", hex: "#ffffff" },
    ],
    inStock: true,
  },
  {
    id: "bf-sportsbag-1",
    name: "Gameday Sports Duffle",
    description: "Oversized sports duffle with ventilated shoe compartment, ball pocket, and BetFans embroidered logo.",
    price: 59.99,
    originalPrice: 74.99,
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=600&fit=crop",
    category: "Gear",
    rating: 4.7,
    reviews: 94,
    sizes: ["One Size"],
    colors: [
      { name: "Midnight Navy", hex: "#0a0f1e" },
      { name: "Shadow Black", hex: "#1a1a2e" },
    ],
    inStock: true,
  },
  {
    id: "bf-stadium-1",
    name: "BetFans Stadium Blanket",
    description: "Waterproof-backed fleece stadium blanket with BetFans logo. Perfect for game day in the stands.",
    price: 34.99,
    image: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=600&h=600&fit=crop",
    category: "Gear",
    badge: "Fan Favorite",
    rating: 4.8,
    reviews: 231,
    sizes: ["50x60\"", "60x80\""],
    colors: [
      { name: "Midnight Navy", hex: "#0a0f1e" },
      { name: "Electric Green", hex: "#22c55e" },
      { name: "Storm Grey", hex: "#2d3748" },
    ],
    inStock: true,
  },
  {
    id: "bf-training-1",
    name: "Pro Picks Training Gear Kit",
    description: "Complete training kit with resistance bands, agility cones, and jump rope. BetFans branded carry bag included.",
    price: 54.99,
    image: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=600&h=600&fit=crop",
    category: "Gear",
    badge: "New",
    rating: 4.6,
    reviews: 67,
    sizes: ["One Size"],
    colors: [
      { name: "BetFans Green", hex: "#22c55e" },
      { name: "Shadow Black", hex: "#1a1a2e" },
    ],
    inStock: true,
  },
  {
    id: "bf-waterbottle-1",
    name: "BetFans Hydro Sports Bottle",
    description: "32oz insulated stainless steel sports bottle with BetFans logo. Keeps drinks cold 24hrs, hot 12hrs.",
    price: 29.99,
    image: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=600&h=600&fit=crop",
    category: "Gear",
    rating: 4.4,
    reviews: 189,
    sizes: ["32oz", "24oz"],
    colors: [
      { name: "Midnight Navy", hex: "#0a0f1e" },
      { name: "Electric Green", hex: "#22c55e" },
      { name: "White", hex: "#ffffff" },
    ],
    inStock: true,
  },
];

const CATEGORIES = ["All", "Basketballs", "Footballs", "Soccer", "Baseball", "Hockey", "Jerseys", "Gear"];

function BetFansLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`}>
      <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10 shadow-lg">
        <span className="font-display font-black text-sm tracking-wider">
          <span className="text-[#22c55e]">BET</span>
          <span className="text-white">FANS</span>
        </span>
      </div>
    </div>
  );
}

export default function Merch() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("featured");
  const [selectedItem, setSelectedItem] = useState<MerchItem | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [shippingInfo, setShippingInfo] = useState({ name: "", address: "", city: "", state: "", zip: "", country: "US", email: "", phone: "" });

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ["/api/merch/orders"],
    queryFn: async () => {
      const res = await fetch("/api/merch/orders", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const cartTotal = cart.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);
  const cartCount = cart.reduce((sum, ci) => sum + ci.quantity, 0);
  const freeShipping = cartTotal >= 75;
  const shippingCost = freeShipping ? 0 : 7.99;

  const filteredItems = MERCH_ITEMS.filter((item) => {
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const matchesSearch =
      searchQuery === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  }).sort((a, b) => {
    switch (sortBy) {
      case "price-low": return a.price - b.price;
      case "price-high": return b.price - a.price;
      case "rating": return b.rating - a.rating;
      case "newest": return (a.badge === "New" ? 0 : 1) - (b.badge === "New" ? 0 : 1);
      default: return 0;
    }
  });

  const addToCart = (item: MerchItem, size: string, color: string) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id && ci.size === size && ci.color === color);
      if (existing) {
        return prev.map((ci) => ci === existing ? { ...ci, quantity: ci.quantity + 1 } : ci);
      }
      return [...prev, { item, quantity: 1, size, color }];
    });
    toast({ title: `${item.name} added to cart!` });
  };

  const updateCartQuantity = (index: number, delta: number) => {
    setCart((prev) => prev.map((ci, i) => {
      if (i !== index) return ci;
      const newQty = ci.quantity + delta;
      return newQty <= 0 ? ci : { ...ci, quantity: newQty };
    }).filter((ci) => ci.quantity > 0));
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      toast({ title: "Please sign in to checkout", variant: "destructive" });
      return;
    }
    if (!shippingInfo.name || !shippingInfo.address || !shippingInfo.city || !shippingInfo.state || !shippingInfo.zip) {
      toast({ title: "Please fill in all shipping fields", variant: "destructive" });
      return;
    }

    setCheckingOut(true);
    try {
      const res = await fetch("/api/merch/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: cart.map((ci) => ({ id: ci.item.id, quantity: ci.quantity, size: ci.size, color: ci.color })),
          shipping: shippingInfo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (error: any) {
      toast({ title: error.message || "Checkout failed", variant: "destructive" });
    } finally {
      setCheckingOut(false);
    }
  };

  const openProductModal = (item: MerchItem) => {
    setSelectedItem(item);
    setSelectedSize(item.sizes?.[0] || "");
    setSelectedColor(item.colors?.[0]?.name || "");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-20">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <Badge variant="outline" className="border-primary/50 text-primary mb-4">
            <Truck size={14} className="mr-1" /> Free Shipping on Orders $75+
          </Badge>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4" data-testid="text-merch-heading">
            BetFans <span className="text-primary">Merch</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Rep the brand. Premium sports gear for the sharpest predictors in the game.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search merch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card/30 border-white/10"
              data-testid="input-search-merch"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            )}
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full md:w-[200px] bg-card/30 border-white/10" data-testid="select-sort">
              <SlidersHorizontal size={16} className="mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
              <SelectItem value="rating">Highest Rated</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="relative border-white/10 gap-2"
            onClick={() => setShowCart(true)}
            data-testid="button-open-cart"
          >
            <ShoppingCart size={18} />
            Cart
            {cartCount > 0 && (
              <Badge className="absolute -top-2 -right-2 bg-primary text-primary-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">
                {cartCount}
              </Badge>
            )}
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap mb-8">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className={selectedCategory === cat
                ? "bg-primary text-primary-foreground"
                : "border-white/10 hover:bg-primary/10 hover:text-primary hover:border-primary/30"
              }
              data-testid={`button-category-${cat.toLowerCase()}`}
            >
              {cat}
            </Button>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">No items found</p>
            <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(""); setSelectedCategory("All"); }}>
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map((item) => (
              <Card
                key={item.id}
                className="bg-card/30 border-white/5 overflow-hidden group cursor-pointer hover:border-primary/30 transition-all duration-300"
                onClick={() => openProductModal(item)}
                data-testid={`card-product-${item.id}`}
              >
                <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-card to-background">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <BetFansLogo className="absolute bottom-3 right-3" />
                  {item.badge && (
                    <Badge
                      className={`absolute top-3 left-3 ${
                        item.badge === "Best Seller" ? "bg-primary text-primary-foreground" :
                        item.badge === "New" ? "bg-blue-500" :
                        item.badge === "Limited Edition" ? "bg-yellow-600" :
                        item.badge === "Legend Exclusive" ? "bg-purple-600" :
                        item.badge === "Fan Favorite" ? "bg-orange-500" :
                        "bg-primary"
                      }`}
                      data-testid={`badge-product-${item.id}`}
                    >
                      {item.badge}
                    </Badge>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                    <Button size="sm" className="w-full gap-2 shadow-lg">
                      <ShoppingCart size={14} /> Quick View
                    </Button>
                  </div>
                </div>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{item.category}</p>
                  <h3 className="font-display font-bold text-lg mb-1 group-hover:text-primary transition-colors" data-testid={`text-product-name-${item.id}`}>
                    {item.name}
                  </h3>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-1">
                      <Star size={12} fill="hsl(var(--primary))" className="text-primary" />
                      <span className="text-xs font-medium">{item.rating}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">({item.reviews})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg font-display" data-testid={`text-product-price-${item.id}`}>
                      ${item.price.toFixed(2)}
                    </span>
                    {item.originalPrice && (
                      <span className="text-sm text-muted-foreground line-through">${item.originalPrice.toFixed(2)}</span>
                    )}
                    {item.originalPrice && (
                      <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                        -{Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)}%
                      </Badge>
                    )}
                  </div>
                  {item.colors && (
                    <div className="flex items-center gap-1.5 mt-3">
                      {item.colors.map((color) => (
                        <div
                          key={color.name}
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: color.hex }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-16 grid md:grid-cols-3 gap-6">
          <div className="bg-card/20 border border-white/5 rounded-xl p-6 text-center">
            <Truck size={32} className="mx-auto mb-3 text-primary" />
            <h3 className="font-display font-bold mb-1">Free Shipping</h3>
            <p className="text-sm text-muted-foreground">On all orders over $75. Ships within 3-5 business days.</p>
          </div>
          <div className="bg-card/20 border border-white/5 rounded-xl p-6 text-center">
            <Shield size={32} className="mx-auto mb-3 text-primary" />
            <h3 className="font-display font-bold mb-1">Quality Guarantee</h3>
            <p className="text-sm text-muted-foreground">Premium materials. 30-day hassle-free returns.</p>
          </div>
          <div className="bg-card/20 border border-white/5 rounded-xl p-6 text-center">
            <Star size={32} className="mx-auto mb-3 text-primary" />
            <h3 className="font-display font-bold mb-1">Member Discount</h3>
            <p className="text-sm text-muted-foreground">Pro & Legend members get 15% off every order.</p>
          </div>
        </div>

        {isAuthenticated && orders.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display font-bold text-2xl mb-6 flex items-center gap-2">
              <Package size={22} className="text-primary" /> Your Orders
            </h2>
            <div className="space-y-3">
              {orders.map((order: any) => {
                const items = JSON.parse(order.items);
                return (
                  <Card key={order.id} className="bg-card/30 border-white/5" data-testid={`order-${order.id}`}>
                    <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <p className="font-display font-bold">Order #BF-{order.id}</p>
                        <p className="text-sm text-muted-foreground">
                          {items.map((i: any) => `${i.name} x${i.quantity}`).join(", ")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold">${order.totalCharged.toFixed(2)}</span>
                        <Badge className={
                          order.fulfillmentStatus === "shipped" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                          order.fulfillmentStatus === "delivered" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                          order.fulfillmentStatus === "processing" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                          "bg-muted text-muted-foreground"
                        }>
                          {order.fulfillmentStatus === "unfulfilled" ? "Processing" : order.fulfillmentStatus}
                        </Badge>
                        {order.trackingNumber && (
                          <a href={order.trackingUrl || "#"} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                            Track
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        {selectedItem && (
          <DialogContent className="sm:max-w-2xl bg-card border-white/10">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">{selectedItem.name}</DialogTitle>
              <DialogDescription>{selectedItem.description}</DialogDescription>
            </DialogHeader>

            <div className="grid md:grid-cols-2 gap-6 py-4">
              <div className="aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-card to-background relative">
                <img src={selectedItem.image} alt={selectedItem.name} className="w-full h-full object-cover" />
                <BetFansLogo className="absolute bottom-3 right-3" />
              </div>

              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl font-bold font-display" data-testid="text-modal-price">
                      ${selectedItem.price.toFixed(2)}
                    </span>
                    {selectedItem.originalPrice && (
                      <span className="text-lg text-muted-foreground line-through">${selectedItem.originalPrice.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={14}
                          className={i < Math.floor(selectedItem.rating) ? "text-primary fill-primary" : "text-muted-foreground"}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">{selectedItem.rating} ({selectedItem.reviews} reviews)</span>
                  </div>
                </div>

                {selectedItem.colors && selectedItem.colors.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Color: <span className="text-muted-foreground">{selectedColor}</span></p>
                    <div className="flex gap-2">
                      {selectedItem.colors.map((color) => (
                        <button
                          key={color.name}
                          onClick={() => setSelectedColor(color.name)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            selectedColor === color.name ? "border-primary scale-110" : "border-white/20 hover:border-white/50"
                          }`}
                          style={{ backgroundColor: color.hex }}
                          title={color.name}
                          data-testid={`button-color-${color.name.toLowerCase().replace(/\s/g, "-")}`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {selectedItem.sizes && selectedItem.sizes.length > 1 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Size</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedItem.sizes.map((size) => (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                            selectedSize === size
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-white/10 hover:border-white/30"
                          }`}
                          data-testid={`button-size-${size}`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Truck size={14} />
                  <span>Ships in 3-5 business days via dropship fulfillment</span>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-3">
              <Button
                className="flex-1 h-12 text-base gap-2 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                data-testid="button-add-to-cart"
                onClick={() => {
                  addToCart(selectedItem, selectedSize, selectedColor);
                  setSelectedItem(null);
                }}
              >
                <ShoppingCart size={18} />
                Add to Cart — ${selectedItem.price.toFixed(2)}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="sm:max-w-lg bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <ShoppingCart size={22} className="text-primary" /> Your Cart
            </DialogTitle>
          </DialogHeader>

          {cart.length === 0 ? (
            <div className="py-10 text-center">
              <ShoppingCart size={48} className="mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {cart.map((ci, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg" data-testid={`cart-item-${index}`}>
                  <img src={ci.item.image} alt={ci.item.name} className="w-14 h-14 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{ci.item.name}</p>
                    <p className="text-xs text-muted-foreground">{ci.size} • {ci.color}</p>
                    <p className="text-sm font-bold">${(ci.item.price * ci.quantity).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateCartQuantity(index, -1)} className="w-7 h-7 rounded bg-white/10 flex items-center justify-center hover:bg-white/20">
                      <Minus size={12} />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{ci.quantity}</span>
                    <button onClick={() => updateCartQuantity(index, 1)} className="w-7 h-7 rounded bg-white/10 flex items-center justify-center hover:bg-white/20">
                      <Plus size={12} />
                    </button>
                  </div>
                  <button onClick={() => removeFromCart(index)} className="text-muted-foreground hover:text-red-400">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="border-t border-white/10 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Shipping</span>
                <span className={freeShipping ? "text-primary" : ""}>
                  {freeShipping ? "FREE" : `$${shippingCost.toFixed(2)}`}
                </span>
              </div>
              {!freeShipping && (
                <p className="text-xs text-muted-foreground">Add ${(75 - cartTotal).toFixed(2)} more for free shipping</p>
              )}
              <div className="flex justify-between text-lg font-bold border-t border-white/10 pt-2">
                <span>Total</span>
                <span>${(cartTotal + shippingCost).toFixed(2)}</span>
              </div>
              <Button
                className="w-full gap-2 h-12 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                onClick={() => { setShowCart(false); setShowCheckout(true); }}
                data-testid="button-proceed-checkout"
              >
                <CreditCard size={18} /> Proceed to Checkout
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="sm:max-w-lg bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <CreditCard size={22} className="text-primary" /> Checkout
            </DialogTitle>
            <DialogDescription>Enter your shipping address to complete your order.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              placeholder="Full Name"
              value={shippingInfo.name}
              onChange={(e) => setShippingInfo((s) => ({ ...s, name: e.target.value }))}
              className="bg-background/50 border-white/10"
              data-testid="input-shipping-name"
            />
            <Input
              placeholder="Street Address"
              value={shippingInfo.address}
              onChange={(e) => setShippingInfo((s) => ({ ...s, address: e.target.value }))}
              className="bg-background/50 border-white/10"
              data-testid="input-shipping-address"
            />
            <div className="grid grid-cols-3 gap-3">
              <Input
                placeholder="City"
                value={shippingInfo.city}
                onChange={(e) => setShippingInfo((s) => ({ ...s, city: e.target.value }))}
                className="bg-background/50 border-white/10"
                data-testid="input-shipping-city"
              />
              <Input
                placeholder="State"
                value={shippingInfo.state}
                onChange={(e) => setShippingInfo((s) => ({ ...s, state: e.target.value }))}
                className="bg-background/50 border-white/10"
                data-testid="input-shipping-state"
              />
              <Input
                placeholder="ZIP"
                value={shippingInfo.zip}
                onChange={(e) => setShippingInfo((s) => ({ ...s, zip: e.target.value }))}
                className="bg-background/50 border-white/10"
                data-testid="input-shipping-zip"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Email Address"
                type="email"
                value={shippingInfo.email}
                onChange={(e) => setShippingInfo((s) => ({ ...s, email: e.target.value }))}
                className="bg-background/50 border-white/10"
                data-testid="input-shipping-email"
              />
              <Input
                placeholder="Phone Number"
                type="tel"
                value={shippingInfo.phone}
                onChange={(e) => setShippingInfo((s) => ({ ...s, phone: e.target.value }))}
                className="bg-background/50 border-white/10"
                data-testid="input-shipping-phone"
              />
            </div>

            <div className="bg-white/5 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium mb-2">Order Summary</p>
              {cart.map((ci, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{ci.item.name} x{ci.quantity}</span>
                  <span>${(ci.item.price * ci.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                <span>Shipping</span>
                <span className={freeShipping ? "text-primary" : ""}>{freeShipping ? "FREE" : `$${shippingCost.toFixed(2)}`}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-white/10 pt-2">
                <span>Total</span>
                <span>${(cartTotal + shippingCost).toFixed(2)}</span>
              </div>
            </div>

            <Button
              className="w-full gap-2 h-12 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
              onClick={handleCheckout}
              disabled={checkingOut}
              data-testid="button-place-order"
            >
              {checkingOut ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
              {checkingOut ? "Processing..." : `Pay $${(cartTotal + shippingCost).toFixed(2)}`}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Secure checkout powered by Stripe. Orders fulfilled by our dropship partner.
              <br />Questions? <a href="mailto:nikcox@betfans.us" className="text-primary hover:underline" data-testid="link-merch-contact">nikcox@betfans.us</a>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
