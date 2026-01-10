/**
 * Brand Seed Data
 * Curated list of popular clothing brands for resale
 * 
 * Categories: apparel, accessories, footwear, outerwear, activewear, denim
 * Tiers: luxury, premium, mid-range, budget, vintage
 */

export type BrandTier = "luxury" | "premium" | "mid-range" | "budget" | "vintage" | "unknown";

export interface BrandSeedEntry {
  name: string;
  aliases: string[];
  tier: BrandTier;
  parentCompany?: string;
  categories: string[];
  rnNumbers?: string[];
  wplNumbers?: string[];
  founded?: string;
  website?: string;
  notes?: string;
}

export const BRAND_SEED_DATA: BrandSeedEntry[] = [
  // ============================================
  // LUXURY BRANDS
  // ============================================
  {
    name: "GUCCI",
    aliases: ["GUCCI MADE IN ITALY", "GG"],
    tier: "luxury",
    parentCompany: "Kering",
    categories: ["apparel", "accessories", "footwear"],
    founded: "1921",
    website: "gucci.com",
  },
  {
    name: "PRADA",
    aliases: ["PRADA MILANO", "PRADA MADE IN ITALY"],
    tier: "luxury",
    parentCompany: "Prada S.p.A.",
    categories: ["apparel", "accessories", "footwear"],
    founded: "1913",
    website: "prada.com",
  },
  {
    name: "LOUIS VUITTON",
    aliases: ["LV", "LOUIS VUITTON PARIS", "LOUIS VUITTON MALLETIER"],
    tier: "luxury",
    parentCompany: "LVMH",
    categories: ["apparel", "accessories"],
    founded: "1854",
    website: "louisvuitton.com",
  },
  {
    name: "CHANEL",
    aliases: ["COCO CHANEL", "CHANEL PARIS"],
    tier: "luxury",
    categories: ["apparel", "accessories"],
    founded: "1910",
    website: "chanel.com",
  },
  {
    name: "HERMES",
    aliases: ["HERMÈS", "HERMES PARIS"],
    tier: "luxury",
    categories: ["apparel", "accessories"],
    founded: "1837",
    website: "hermes.com",
  },
  {
    name: "BURBERRY",
    aliases: ["BURBERRYS", "BURBERRY LONDON", "BURBERRY BRIT"],
    tier: "luxury",
    categories: ["apparel", "accessories", "outerwear"],
    founded: "1856",
    website: "burberry.com",
    notes: "Vintage pieces labeled 'Burberrys' (with 's') are pre-1999",
  },
  {
    name: "VERSACE",
    aliases: ["GIANNI VERSACE", "VERSACE JEANS COUTURE", "VERSUS VERSACE"],
    tier: "luxury",
    parentCompany: "Capri Holdings",
    categories: ["apparel", "accessories"],
    founded: "1978",
    website: "versace.com",
  },
  {
    name: "BALENCIAGA",
    aliases: ["BALENCIAGA PARIS"],
    tier: "luxury",
    parentCompany: "Kering",
    categories: ["apparel", "accessories", "footwear"],
    founded: "1919",
    website: "balenciaga.com",
  },
  {
    name: "SAINT LAURENT",
    aliases: ["YSL", "YVES SAINT LAURENT", "SAINT LAURENT PARIS"],
    tier: "luxury",
    parentCompany: "Kering",
    categories: ["apparel", "accessories"],
    founded: "1961",
    website: "ysl.com",
  },
  {
    name: "DIOR",
    aliases: ["CHRISTIAN DIOR", "DIOR HOMME", "MISS DIOR"],
    tier: "luxury",
    parentCompany: "LVMH",
    categories: ["apparel", "accessories"],
    founded: "1946",
    website: "dior.com",
  },
  {
    name: "FENDI",
    aliases: ["FENDI ROMA"],
    tier: "luxury",
    parentCompany: "LVMH",
    categories: ["apparel", "accessories"],
    founded: "1925",
    website: "fendi.com",
  },
  {
    name: "BOTTEGA VENETA",
    aliases: ["BV", "BOTTEGA"],
    tier: "luxury",
    parentCompany: "Kering",
    categories: ["apparel", "accessories"],
    founded: "1966",
    website: "bottegaveneta.com",
  },

  // ============================================
  // PREMIUM BRANDS
  // ============================================
  {
    name: "RALPH LAUREN",
    aliases: ["POLO RALPH LAUREN", "POLO RL", "RL", "POLO BY RALPH LAUREN", "LAUREN RALPH LAUREN", "RRL", "DOUBLE RL"],
    tier: "premium",
    categories: ["apparel", "accessories"],
    rnNumbers: ["41381"],
    founded: "1967",
    website: "ralphlauren.com",
    notes: "RRL/Double RL is vintage-inspired premium line",
  },
  {
    name: "TOMMY HILFIGER",
    aliases: ["TOMMY", "TOMMY JEANS", "HILFIGER"],
    tier: "premium",
    parentCompany: "PVH Corp",
    categories: ["apparel", "accessories"],
    founded: "1985",
    website: "tommy.com",
  },
  {
    name: "CALVIN KLEIN",
    aliases: ["CK", "CALVIN KLEIN JEANS", "CK CALVIN KLEIN"],
    tier: "premium",
    parentCompany: "PVH Corp",
    categories: ["apparel", "accessories", "denim"],
    founded: "1968",
    website: "calvinklein.com",
  },
  {
    name: "COACH",
    aliases: ["COACH NEW YORK"],
    tier: "premium",
    parentCompany: "Tapestry Inc",
    categories: ["accessories", "apparel"],
    founded: "1941",
    website: "coach.com",
  },
  {
    name: "KATE SPADE",
    aliases: ["KATE SPADE NEW YORK"],
    tier: "premium",
    parentCompany: "Tapestry Inc",
    categories: ["accessories", "apparel"],
    founded: "1993",
    website: "katespade.com",
  },
  {
    name: "MICHAEL KORS",
    aliases: ["MK", "MICHAEL MICHAEL KORS"],
    tier: "premium",
    parentCompany: "Capri Holdings",
    categories: ["accessories", "apparel"],
    founded: "1981",
    website: "michaelkors.com",
  },
  {
    name: "TORY BURCH",
    aliases: [],
    tier: "premium",
    categories: ["accessories", "apparel", "footwear"],
    founded: "2004",
    website: "toryburch.com",
  },
  {
    name: "THEORY",
    aliases: [],
    tier: "premium",
    parentCompany: "Fast Retailing",
    categories: ["apparel"],
    founded: "1997",
    website: "theory.com",
  },
  {
    name: "VINCE",
    aliases: [],
    tier: "premium",
    categories: ["apparel"],
    founded: "2002",
    website: "vince.com",
  },
  {
    name: "ALLSAINTS",
    aliases: ["ALL SAINTS"],
    tier: "premium",
    categories: ["apparel"],
    founded: "1994",
    website: "allsaints.com",
  },

  // ============================================
  // OUTDOOR & ACTIVEWEAR PREMIUM
  // ============================================
  {
    name: "PATAGONIA",
    aliases: ["PATAGUCCI"],
    tier: "premium",
    categories: ["outerwear", "activewear", "apparel"],
    rnNumbers: ["51884"],
    founded: "1973",
    website: "patagonia.com",
    notes: "High resale value, especially vintage pieces. RN 51884",
  },
  {
    name: "THE NORTH FACE",
    aliases: ["TNF", "NORTH FACE"],
    tier: "premium",
    parentCompany: "VF Corporation",
    categories: ["outerwear", "activewear"],
    founded: "1966",
    website: "thenorthface.com",
    notes: "Vintage Nuptse jackets command premium prices",
  },
  {
    name: "ARC'TERYX",
    aliases: ["ARCTERYX"],
    tier: "premium",
    parentCompany: "Amer Sports",
    categories: ["outerwear", "activewear"],
    founded: "1989",
    website: "arcteryx.com",
    notes: "Technical outdoor gear, high resale value",
  },
  {
    name: "LULULEMON",
    aliases: ["LULULEMON ATHLETICA"],
    tier: "premium",
    categories: ["activewear", "apparel"],
    founded: "1998",
    website: "lululemon.com",
  },
  {
    name: "CANADA GOOSE",
    aliases: [],
    tier: "premium",
    categories: ["outerwear"],
    founded: "1957",
    website: "canadagoose.com",
  },
  {
    name: "MONCLER",
    aliases: [],
    tier: "luxury",
    categories: ["outerwear"],
    founded: "1952",
    website: "moncler.com",
  },
  {
    name: "COLUMBIA",
    aliases: ["COLUMBIA SPORTSWEAR"],
    tier: "mid-range",
    categories: ["outerwear", "activewear"],
    founded: "1938",
    website: "columbia.com",
  },

  // ============================================
  // STREETWEAR
  // ============================================
  {
    name: "SUPREME",
    aliases: ["SUPREME NEW YORK", "SUPREME NYC"],
    tier: "premium",
    parentCompany: "VF Corporation",
    categories: ["apparel", "accessories"],
    founded: "1994",
    website: "supremenewyork.com",
    notes: "Extremely high resale on limited drops",
  },
  {
    name: "STUSSY",
    aliases: ["STÜSSY"],
    tier: "premium",
    categories: ["apparel"],
    founded: "1980",
    website: "stussy.com",
    notes: "Pioneer of streetwear, vintage pieces valuable",
  },
  {
    name: "BAPE",
    aliases: ["A BATHING APE", "BATHING APE"],
    tier: "premium",
    categories: ["apparel"],
    founded: "1993",
    website: "bape.com",
  },
  {
    name: "OFF-WHITE",
    aliases: ["OFF WHITE"],
    tier: "luxury",
    parentCompany: "LVMH",
    categories: ["apparel", "footwear"],
    founded: "2012",
    website: "off---white.com",
  },
  {
    name: "FEAR OF GOD",
    aliases: ["FOG", "ESSENTIALS"],
    tier: "premium",
    categories: ["apparel"],
    founded: "2013",
    website: "fearofgod.com",
    notes: "Essentials is diffusion line",
  },
  {
    name: "PALACE",
    aliases: ["PALACE SKATEBOARDS"],
    tier: "premium",
    categories: ["apparel"],
    founded: "2009",
    website: "palaceskateboards.com",
  },
  {
    name: "KITH",
    aliases: [],
    tier: "premium",
    categories: ["apparel", "footwear"],
    founded: "2011",
    website: "kith.com",
  },

  // ============================================
  // MID-RANGE BRANDS
  // ============================================
  {
    name: "J.CREW",
    aliases: ["J CREW", "JCREW"],
    tier: "mid-range",
    categories: ["apparel"],
    founded: "1983",
    website: "jcrew.com",
  },
  {
    name: "BANANA REPUBLIC",
    aliases: [],
    tier: "mid-range",
    parentCompany: "Gap Inc",
    categories: ["apparel"],
    founded: "1978",
    website: "bananarepublic.com",
  },
  {
    name: "GAP",
    aliases: ["THE GAP"],
    tier: "mid-range",
    parentCompany: "Gap Inc",
    categories: ["apparel", "denim"],
    founded: "1969",
    website: "gap.com",
  },
  {
    name: "ZARA",
    aliases: [],
    tier: "mid-range",
    parentCompany: "Inditex",
    categories: ["apparel"],
    founded: "1975",
    website: "zara.com",
  },
  {
    name: "H&M",
    aliases: ["HENNES & MAURITZ"],
    tier: "budget",
    categories: ["apparel"],
    founded: "1947",
    website: "hm.com",
  },
  {
    name: "UNIQLO",
    aliases: [],
    tier: "mid-range",
    parentCompany: "Fast Retailing",
    categories: ["apparel"],
    founded: "1984",
    website: "uniqlo.com",
  },
  {
    name: "MADEWELL",
    aliases: [],
    tier: "mid-range",
    parentCompany: "J.Crew Group",
    categories: ["apparel", "denim"],
    founded: "2006",
    website: "madewell.com",
  },
  {
    name: "ANTHROPOLOGIE",
    aliases: [],
    tier: "mid-range",
    parentCompany: "URBN",
    categories: ["apparel"],
    founded: "1992",
    website: "anthropologie.com",
  },
  {
    name: "FREE PEOPLE",
    aliases: [],
    tier: "mid-range",
    parentCompany: "URBN",
    categories: ["apparel"],
    founded: "1970",
    website: "freepeople.com",
  },
  {
    name: "URBAN OUTFITTERS",
    aliases: ["UO"],
    tier: "mid-range",
    parentCompany: "URBN",
    categories: ["apparel"],
    founded: "1970",
    website: "urbanoutfitters.com",
  },

  // ============================================
  // ATHLETIC BRANDS
  // ============================================
  {
    name: "NIKE",
    aliases: ["NIKE INC", "NIKE SPORTSWEAR", "NIKE ACG"],
    tier: "mid-range",
    categories: ["footwear", "activewear", "apparel"],
    founded: "1964",
    website: "nike.com",
    notes: "ACG and vintage pieces command premiums",
  },
  {
    name: "ADIDAS",
    aliases: ["ADIDAS ORIGINALS", "ADIDAS SPORTSWEAR"],
    tier: "mid-range",
    categories: ["footwear", "activewear", "apparel"],
    founded: "1949",
    website: "adidas.com",
  },
  {
    name: "NEW BALANCE",
    aliases: ["NB"],
    tier: "mid-range",
    categories: ["footwear", "activewear"],
    founded: "1906",
    website: "newbalance.com",
    notes: "Made in USA models are premium",
  },
  {
    name: "PUMA",
    aliases: [],
    tier: "mid-range",
    categories: ["footwear", "activewear"],
    founded: "1948",
    website: "puma.com",
  },
  {
    name: "REEBOK",
    aliases: [],
    tier: "mid-range",
    parentCompany: "Authentic Brands Group",
    categories: ["footwear", "activewear"],
    founded: "1958",
    website: "reebok.com",
  },
  {
    name: "UNDER ARMOUR",
    aliases: ["UA"],
    tier: "mid-range",
    categories: ["activewear", "apparel"],
    founded: "1996",
    website: "underarmour.com",
  },

  // ============================================
  // DENIM BRANDS
  // ============================================
  {
    name: "LEVI'S",
    aliases: ["LEVIS", "LEVI STRAUSS", "LEVI'S STRAUSS & CO"],
    tier: "mid-range",
    categories: ["denim", "apparel"],
    founded: "1853",
    website: "levi.com",
    notes: "Vintage 501s and Big E labels are highly collectible",
  },
  {
    name: "WRANGLER",
    aliases: [],
    tier: "mid-range",
    parentCompany: "Kontoor Brands",
    categories: ["denim", "apparel"],
    founded: "1947",
    website: "wrangler.com",
  },
  {
    name: "LEE",
    aliases: ["LEE JEANS"],
    tier: "mid-range",
    parentCompany: "Kontoor Brands",
    categories: ["denim", "apparel"],
    founded: "1889",
    website: "lee.com",
  },
  {
    name: "CITIZENS OF HUMANITY",
    aliases: ["COH"],
    tier: "premium",
    categories: ["denim"],
    founded: "2003",
    website: "citizensofhumanity.com",
  },
  {
    name: "AG JEANS",
    aliases: ["ADRIANO GOLDSCHMIED", "AG"],
    tier: "premium",
    categories: ["denim"],
    founded: "2000",
    website: "agjeans.com",
  },
  {
    name: "7 FOR ALL MANKIND",
    aliases: ["7FAM", "SEVEN FOR ALL MANKIND"],
    tier: "premium",
    categories: ["denim"],
    founded: "2000",
    website: "7forallmankind.com",
  },
  {
    name: "TRUE RELIGION",
    aliases: [],
    tier: "premium",
    categories: ["denim"],
    founded: "2002",
    website: "truereligion.com",
    notes: "Was very popular 2005-2015, now considered dated by some",
  },
  {
    name: "DIESEL",
    aliases: [],
    tier: "premium",
    categories: ["denim", "apparel"],
    founded: "1978",
    website: "diesel.com",
  },

  // ============================================
  // VINTAGE / HERITAGE BRANDS
  // ============================================
  {
    name: "PENDLETON",
    aliases: ["PENDLETON WOOLEN MILLS"],
    tier: "vintage",
    categories: ["apparel", "outerwear"],
    founded: "1863",
    website: "pendleton-usa.com",
    notes: "Made in USA wool products highly collectible",
  },
  {
    name: "FILSON",
    aliases: ["C.C. FILSON"],
    tier: "premium",
    categories: ["outerwear", "accessories"],
    founded: "1897",
    website: "filson.com",
    notes: "Heritage workwear, Made in USA",
  },
  {
    name: "L.L.BEAN",
    aliases: ["LL BEAN", "LLBEAN"],
    tier: "mid-range",
    categories: ["outerwear", "apparel", "footwear"],
    founded: "1912",
    website: "llbean.com",
    notes: "Vintage pieces with script logo are collectible",
  },
  {
    name: "CARHARTT",
    aliases: ["CARHARTT WIP"],
    tier: "mid-range",
    categories: ["apparel", "outerwear"],
    founded: "1889",
    website: "carhartt.com",
    notes: "WIP (Work In Progress) is fashion-focused line",
  },
  {
    name: "WOOLRICH",
    aliases: [],
    tier: "vintage",
    categories: ["outerwear", "apparel"],
    founded: "1830",
    website: "woolrich.com",
    notes: "One of oldest American outdoor brands",
  },
  {
    name: "EDDIE BAUER",
    aliases: [],
    tier: "mid-range",
    categories: ["outerwear", "apparel"],
    founded: "1920",
    website: "eddiebauer.com",
  },
  {
    name: "COWICHAN",
    aliases: ["COWICHAN SWEATER", "COWICHAN VALLEY"],
    tier: "vintage",
    categories: ["apparel"],
    notes: "Hand-knit Indigenous sweaters from British Columbia, highly collectible",
  },
  {
    name: "COOGI",
    aliases: [],
    tier: "vintage",
    categories: ["apparel"],
    founded: "1969",
    website: "coogi.com.au",
    notes: "Australian knitwear, iconic 90s hip-hop association",
  },
];

// Helper to get count by tier
export function getBrandCountByTier(): Record<BrandTier, number> {
  const counts: Record<BrandTier, number> = {
    luxury: 0,
    premium: 0,
    "mid-range": 0,
    budget: 0,
    vintage: 0,
    unknown: 0,
  };
  
  for (const brand of BRAND_SEED_DATA) {
    counts[brand.tier]++;
  }
  
  return counts;
}

