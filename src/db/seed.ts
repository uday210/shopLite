export type SeedProduct = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  sku: string;
};

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    id: "prod_tote",
    name: "Canvas Tote",
    description: "Heavyweight natural canvas tote with an interior pocket.",
    price_cents: 2400,
    stock: 20,
    sku: "TOTE-001",
  },
  {
    id: "prod_mug",
    name: "Ceramic Mug",
    description: "Speckled stoneware mug, 12 oz.",
    price_cents: 1400,
    stock: 35,
    sku: "MUG-002",
  },
  {
    id: "prod_notebook",
    name: "Notebook",
    description: "A5 ruled notebook with a lay-flat binding.",
    price_cents: 950,
    stock: 50,
    sku: "NOTE-003",
  },
  {
    id: "prod_lamp",
    name: "Desk Lamp",
    description: "Matte black task lamp with a warm LED bulb.",
    price_cents: 4200,
    stock: 12,
    sku: "LAMP-004",
  },
  {
    id: "prod_bottle",
    name: "Water Bottle",
    description: "Insulated stainless bottle, 20 oz.",
    price_cents: 1800,
    stock: 40,
    sku: "BOTTLE-005",
  },
];
