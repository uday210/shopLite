export type Product = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  sku: string;
};

export type CartLine = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  qty: number;
  unitPriceCents: number;
  /** Units still available to sell. The cart picklist cannot exceed this. */
  stock: number;
};

export type OrderLine = {
  productId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
};

export type Order = {
  id: string;
  userId: string;
  status: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  items: OrderLine[];
  createdAt: string;
};

export type AppEnv = {
  Variables: {
    userId: string;
  };
};
