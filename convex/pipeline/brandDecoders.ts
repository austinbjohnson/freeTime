/**
 * Brand Code Decoders - Extract structured data from brand-specific style codes
 * 
 * Many outdoor brands encode valuable information in their style/SKU codes:
 * season, year, category, product line, etc.
 * 
 * This module provides brand-specific decoders that extract this information
 * to improve research queries and enable caching.
 */

// ============================================
// Types
// ============================================

export interface DecodedStyleInfo {
  brand: string;
  rawCode: string;
  normalizedCode: string;      // Cleaned/normalized version for cache matching
  
  // Decoded fields (brand-specific, all optional)
  productLine?: string;        // e.g., "Better Sweater", "Beta AR", "Nuptse"
  category?: string;           // e.g., "jacket", "fleece", "pants"
  season?: string;             // e.g., "Fall", "Spring", "FW", "SS"
  year?: string;               // e.g., "2023", "23"
  gender?: string;             // e.g., "mens", "womens", "unisex"
  material?: string;           // e.g., "Gore-Tex", "G-1000", "Down"
  colorCode?: string;          // Internal color identifier
  
  // Pattern matching info
  patternType?: string;        // Which pattern matched (for debugging)
  confidence: number;          // 0-1 how confident in the decode
  
  // Suggested search terms based on decoded info
  searchTerms: string[];
}

export interface BrandDecoder {
  brandName: string;
  aliases: string[];           // Other names to match (case-insensitive)
  decode(code: string): DecodedStyleInfo | null;
}

// ============================================
// Utility Functions
// ============================================

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s\-_]/g, '').trim();
}

function createBaseResult(brand: string, code: string): DecodedStyleInfo {
  return {
    brand,
    rawCode: code,
    normalizedCode: normalizeCode(code),
    confidence: 0,
    searchTerms: [],
  };
}

// ============================================
// Patagonia Decoder
// ============================================

/**
 * Patagonia Style Code Patterns:
 * - Basic: 5-digit codes like "23056", "84211", "25500"
 * - Seasonal: "FA23-23056" (Fall 2023), "SP24-84211" (Spring 2024)
 * - Product line prefixes sometimes in separate field
 * 
 * Known product lines and their typical code ranges:
 * - Better Sweater: often starts with 25xxx
 * - R1/R2/R3 fleece: various ranges
 * - Down Sweater: often 84xxx
 * - Nano Puff: often 84xxx
 * - Torrentshell: often 83xxx
 */
const patagoniaDecoder: BrandDecoder = {
  brandName: "PATAGONIA",
  aliases: ["PATAGONIA INC", "PATAGONIA OUTDOOR"],
  
  decode(code: string): DecodedStyleInfo | null {
    const result = createBaseResult("PATAGONIA", code);
    const normalized = normalizeCode(code);
    
    // Pattern 1: Seasonal prefix (FA23-12345, SP24-12345, etc.)
    const seasonalMatch = normalized.match(/^(FA|SP|SS|FW|HO)(\d{2})(\d{5})$/);
    if (seasonalMatch) {
      const [, seasonCode, year, styleNum] = seasonalMatch;
      result.season = { FA: "Fall", SP: "Spring", SS: "Spring/Summer", FW: "Fall/Winter", HO: "Holiday" }[seasonCode];
      result.year = `20${year}`;
      result.normalizedCode = styleNum; // Normalize to just the style number
      result.patternType = "seasonal_prefix";
      result.confidence = 0.9;
      
      // Decode the style number
      Object.assign(result, decodePatagoniaStyleNumber(styleNum));
      
      result.searchTerms.push(
        `Patagonia ${result.productLine || ''} ${result.season} ${result.year}`.trim(),
        `Patagonia ${styleNum}`
      );
      return result;
    }
    
    // Pattern 2: Plain 5-digit style number
    const plainMatch = normalized.match(/^(\d{5})$/);
    if (plainMatch) {
      const styleNum = plainMatch[1];
      result.normalizedCode = styleNum;
      result.patternType = "plain_style";
      result.confidence = 0.7;
      
      Object.assign(result, decodePatagoniaStyleNumber(styleNum));
      
      result.searchTerms.push(
        `Patagonia ${result.productLine || ''} ${styleNum}`.trim(),
        `Patagonia style ${styleNum}`
      );
      return result;
    }
    
    // Pattern 3: With color suffix (12345-BLK, 12345-NVYB)
    const colorMatch = normalized.match(/^(\d{5})([A-Z]{2,4})$/);
    if (colorMatch) {
      const [, styleNum, colorCode] = colorMatch;
      result.normalizedCode = styleNum;
      result.colorCode = colorCode;
      result.patternType = "style_with_color";
      result.confidence = 0.75;
      
      Object.assign(result, decodePatagoniaStyleNumber(styleNum));
      
      result.searchTerms.push(
        `Patagonia ${result.productLine || ''} ${styleNum}`.trim()
      );
      return result;
    }
    
    // Fallback: can't decode but return normalized
    result.confidence = 0.3;
    result.searchTerms.push(`Patagonia ${code}`);
    return result;
  }
};

function decodePatagoniaStyleNumber(styleNum: string): Partial<DecodedStyleInfo> {
  const prefix = styleNum.substring(0, 2);
  const info: Partial<DecodedStyleInfo> = {};
  
  // Known Patagonia style number prefixes
  const prefixMap: Record<string, { productLine?: string; category?: string }> = {
    "23": { productLine: "Synchilla", category: "fleece" },
    "25": { productLine: "Better Sweater", category: "fleece" },
    "26": { productLine: "R1", category: "fleece" },
    "40": { productLine: "Baggies", category: "shorts" },
    "57": { productLine: "Stand Up", category: "shorts" },
    "82": { productLine: "Nano Puff", category: "insulated jacket" },
    "83": { productLine: "Torrentshell", category: "rain jacket" },
    "84": { productLine: "Down Sweater", category: "down jacket" },
    "85": { productLine: "Tres", category: "3-in-1 jacket" },
  };
  
  if (prefixMap[prefix]) {
    Object.assign(info, prefixMap[prefix]);
  }
  
  return info;
}

// ============================================
// Arc'teryx Decoder
// ============================================

/**
 * Arc'teryx Style Code Patterns:
 * - Basic: 5-digit codes like "24105", "17305", "21782"
 * - The naming convention (Alpha, Beta, Gamma, etc.) usually isn't in the code
 * - but the style number is consistent across seasons for the same model
 * 
 * Product line indicators in name (not code):
 * - Alpha = climbing/mountaineering (most technical)
 * - Beta = all-round (most popular)
 * - Gamma = softshell/rock climbing
 * - Delta = fleece/midlayer
 * - Atom = insulated pieces
 * - Cerium = down
 * - Proton = synthetic insulation
 * 
 * Suffixes: AR (all-round), LT (light), SV (severe), SL (super light)
 */
const arcteryxDecoder: BrandDecoder = {
  brandName: "ARC'TERYX",
  aliases: ["ARCTERYX", "ARC TERYX", "ARCTERYX EQUIPMENT"],
  
  decode(code: string): DecodedStyleInfo | null {
    const result = createBaseResult("ARC'TERYX", code);
    const normalized = normalizeCode(code);
    
    // Pattern 1: 5-digit style number
    const styleMatch = normalized.match(/^(\d{5})$/);
    if (styleMatch) {
      result.normalizedCode = styleMatch[1];
      result.patternType = "style_number";
      result.confidence = 0.7;
      
      // Arc'teryx doesn't encode much in the number itself
      // but the number is very useful for exact product matching
      result.searchTerms.push(
        `Arc'teryx ${styleMatch[1]}`,
        `Arcteryx style ${styleMatch[1]}`
      );
      return result;
    }
    
    // Pattern 2: With color/size suffix (21782-BLK-M)
    const extendedMatch = normalized.match(/^(\d{5})([A-Z]{2,4})?([XSML]{1,3})?$/);
    if (extendedMatch) {
      const [, styleNum, colorCode] = extendedMatch;
      result.normalizedCode = styleNum;
      if (colorCode) result.colorCode = colorCode;
      result.patternType = "extended_style";
      result.confidence = 0.75;
      
      result.searchTerms.push(
        `Arc'teryx ${styleNum}`,
        `Arcteryx ${styleNum}`
      );
      return result;
    }
    
    // Fallback
    result.confidence = 0.3;
    result.searchTerms.push(`Arc'teryx ${code}`);
    return result;
  }
};

// ============================================
// The North Face Decoder
// ============================================

/**
 * The North Face Style Code Patterns:
 * - Modern: "NF0A4R52" (NF0A prefix + 4 alphanumeric)
 * - Legacy: "AZED", "A3SJL" (letter + 3-4 alphanumeric)
 * - Some codes: "T93XXX" format
 * 
 * The codes don't encode product info directly, but are useful for exact matching.
 * Product lines: Summit Series, Thermoball, Nuptse, etc.
 */
const northFaceDecoder: BrandDecoder = {
  brandName: "THE NORTH FACE",
  aliases: ["NORTH FACE", "TNF", "THE NORTHFACE"],
  
  decode(code: string): DecodedStyleInfo | null {
    const result = createBaseResult("THE NORTH FACE", code);
    const normalized = normalizeCode(code);
    
    // Pattern 1: Modern format (NF0A + 4 chars)
    const modernMatch = normalized.match(/^(NF0A)([A-Z0-9]{4})$/);
    if (modernMatch) {
      result.normalizedCode = normalized;
      result.patternType = "modern_style";
      result.confidence = 0.85;
      
      result.searchTerms.push(
        `North Face ${normalized}`,
        `TNF ${normalized}`,
        `"${modernMatch[1]}${modernMatch[2]}"`
      );
      return result;
    }
    
    // Pattern 2: Legacy format (letter + 3-4 alphanumeric)
    const legacyMatch = normalized.match(/^([A-Z])([A-Z0-9]{3,4})$/);
    if (legacyMatch) {
      result.normalizedCode = normalized;
      result.patternType = "legacy_style";
      result.confidence = 0.7;
      
      result.searchTerms.push(
        `North Face ${normalized}`,
        `TNF ${normalized}`
      );
      return result;
    }
    
    // Pattern 3: T93XXX format
    const t93Match = normalized.match(/^(T9[0-9])([A-Z0-9]{3,4})$/);
    if (t93Match) {
      result.normalizedCode = normalized;
      result.patternType = "t9_style";
      result.confidence = 0.75;
      
      result.searchTerms.push(
        `North Face ${normalized}`
      );
      return result;
    }
    
    // Fallback
    result.confidence = 0.3;
    result.searchTerms.push(`North Face ${code}`);
    return result;
  }
};

// ============================================
// Fjällräven Decoder
// ============================================

/**
 * Fjällräven Article Numbers:
 * - Usually 5-6 digit article numbers: "87213", "23561", "F87213"
 * - G-1000 fabric items often noted separately
 * - Kånken bags have specific numbering
 */
const fjallravenDecoder: BrandDecoder = {
  brandName: "FJÄLLRÄVEN",
  aliases: ["FJALLRAVEN", "FJALL RAVEN", "FJÄLLRÄVEN SWEDEN"],
  
  decode(code: string): DecodedStyleInfo | null {
    const result = createBaseResult("FJÄLLRÄVEN", code);
    const normalized = normalizeCode(code);
    
    // Pattern 1: F-prefix article number
    const fMatch = normalized.match(/^F?(\d{5,6})$/);
    if (fMatch) {
      result.normalizedCode = fMatch[1];
      result.patternType = "article_number";
      result.confidence = 0.75;
      
      // Check for known product ranges
      const articleNum = parseInt(fMatch[1]);
      if (articleNum >= 23500 && articleNum <= 23599) {
        result.productLine = "Kånken";
        result.category = "backpack";
        result.confidence = 0.85;
      } else if (articleNum >= 87000 && articleNum <= 87999) {
        result.productLine = "Greenland";
        result.category = "jacket";
      } else if (articleNum >= 81000 && articleNum <= 81999) {
        result.productLine = "Keb";
        result.category = "pants/jacket";
      }
      
      result.searchTerms.push(
        `Fjallraven ${fMatch[1]}`,
        `Fjällräven article ${fMatch[1]}`
      );
      return result;
    }
    
    // Fallback
    result.confidence = 0.3;
    result.searchTerms.push(`Fjallraven ${code}`);
    return result;
  }
};

// ============================================
// REI Co-op Decoder
// ============================================

/**
 * REI Co-op Product Codes:
 * - Item numbers: 6-8 digit codes like "1234567"
 * - Some products have "REI Co-op" followed by product line
 * - House brand items often have category in the name, not code
 */
const reiDecoder: BrandDecoder = {
  brandName: "REI CO-OP",
  aliases: ["REI", "REI COOP", "RECREATIONAL EQUIPMENT"],
  
  decode(code: string): DecodedStyleInfo | null {
    const result = createBaseResult("REI CO-OP", code);
    const normalized = normalizeCode(code);
    
    // Pattern 1: 6-8 digit item number
    const itemMatch = normalized.match(/^(\d{6,8})$/);
    if (itemMatch) {
      result.normalizedCode = itemMatch[1];
      result.patternType = "item_number";
      result.confidence = 0.7;
      
      result.searchTerms.push(
        `REI Co-op ${itemMatch[1]}`,
        `REI item ${itemMatch[1]}`
      );
      return result;
    }
    
    // Fallback
    result.confidence = 0.3;
    result.searchTerms.push(`REI ${code}`);
    return result;
  }
};

// ============================================
// Mammut Decoder
// ============================================

/**
 * Mammut Product Codes:
 * - Article numbers: typically "1010-XXXXX" or "1050-XXXXX" format
 * - The prefix indicates product category
 */
const mammutDecoder: BrandDecoder = {
  brandName: "MAMMUT",
  aliases: ["MAMMUT SPORTS", "MAMMUT SWITZERLAND"],
  
  decode(code: string): DecodedStyleInfo | null {
    const result = createBaseResult("MAMMUT", code);
    const normalized = normalizeCode(code);
    
    // Pattern 1: Article number with prefix (1010-12345)
    const articleMatch = normalized.match(/^(10[0-9]{2})(\d{5})$/);
    if (articleMatch) {
      const [, prefix, artNum] = articleMatch;
      result.normalizedCode = `${prefix}-${artNum}`;
      result.patternType = "article_number";
      result.confidence = 0.8;
      
      // Prefix decoding
      const prefixMap: Record<string, string> = {
        "1010": "jackets",
        "1012": "pants",
        "1014": "shirts/tops",
        "1020": "climbing gear",
        "1050": "accessories",
      };
      if (prefixMap[prefix]) {
        result.category = prefixMap[prefix];
      }
      
      result.searchTerms.push(
        `Mammut ${prefix}-${artNum}`,
        `Mammut article ${artNum}`
      );
      return result;
    }
    
    // Pattern 2: Plain number
    const plainMatch = normalized.match(/^(\d{5,7})$/);
    if (plainMatch) {
      result.normalizedCode = plainMatch[1];
      result.patternType = "plain_number";
      result.confidence = 0.6;
      
      result.searchTerms.push(`Mammut ${plainMatch[1]}`);
      return result;
    }
    
    // Fallback
    result.confidence = 0.3;
    result.searchTerms.push(`Mammut ${code}`);
    return result;
  }
};

// ============================================
// Mountain Hardwear Decoder  
// ============================================

/**
 * Mountain Hardwear Product Codes:
 * - Style numbers: typically 6-digit "OM1234" or plain numeric
 * - Popular lines: Ghost Whisperer, Stretchdown, Kor
 */
const mountainHardwearDecoder: BrandDecoder = {
  brandName: "MOUNTAIN HARDWEAR",
  aliases: ["MTN HARDWEAR", "MOUNTAIN HARDWARE"],
  
  decode(code: string): DecodedStyleInfo | null {
    const result = createBaseResult("MOUNTAIN HARDWEAR", code);
    const normalized = normalizeCode(code);
    
    // Pattern 1: OM-prefix style (OM1234)
    const omMatch = normalized.match(/^(OM|OL|OU)(\d{4,5})$/);
    if (omMatch) {
      const [, prefix, styleNum] = omMatch;
      result.normalizedCode = `${prefix}${styleNum}`;
      result.patternType = "om_style";
      result.confidence = 0.8;
      
      // Prefix indicates gender
      const genderMap: Record<string, string> = {
        "OM": "mens",
        "OL": "womens",
        "OU": "unisex",
      };
      result.gender = genderMap[prefix];
      
      result.searchTerms.push(
        `Mountain Hardwear ${prefix}${styleNum}`,
        `MHW ${styleNum}`
      );
      return result;
    }
    
    // Pattern 2: Plain numeric
    const numMatch = normalized.match(/^(\d{5,7})$/);
    if (numMatch) {
      result.normalizedCode = numMatch[1];
      result.patternType = "numeric_style";
      result.confidence = 0.65;
      
      result.searchTerms.push(`Mountain Hardwear ${numMatch[1]}`);
      return result;
    }
    
    // Fallback
    result.confidence = 0.3;
    result.searchTerms.push(`Mountain Hardwear ${code}`);
    return result;
  }
};

// ============================================
// Outdoor Research Decoder
// ============================================

/**
 * Outdoor Research Product Codes:
 * - Style numbers: often 5-6 digits, sometimes with letter prefix
 * - Popular lines: Helium, Foray, Ferrosi
 */
const outdoorResearchDecoder: BrandDecoder = {
  brandName: "OUTDOOR RESEARCH",
  aliases: ["OR", "OUTDOOR RESEARCH INC"],
  
  decode(code: string): DecodedStyleInfo | null {
    const result = createBaseResult("OUTDOOR RESEARCH", code);
    const normalized = normalizeCode(code);
    
    // Pattern 1: Numeric style
    const numMatch = normalized.match(/^(\d{5,7})$/);
    if (numMatch) {
      result.normalizedCode = numMatch[1];
      result.patternType = "numeric_style";
      result.confidence = 0.7;
      
      result.searchTerms.push(
        `Outdoor Research ${numMatch[1]}`,
        `OR ${numMatch[1]}`
      );
      return result;
    }
    
    // Fallback
    result.confidence = 0.3;
    result.searchTerms.push(`Outdoor Research ${code}`);
    return result;
  }
};

// ============================================
// Decoder Registry
// ============================================

const decoders: BrandDecoder[] = [
  patagoniaDecoder,
  arcteryxDecoder,
  northFaceDecoder,
  fjallravenDecoder,
  reiDecoder,
  mammutDecoder,
  mountainHardwearDecoder,
  outdoorResearchDecoder,
];

/**
 * Find decoder for a given brand name
 */
export function getDecoderForBrand(brandName: string): BrandDecoder | null {
  const normalized = brandName.toUpperCase().trim();
  
  for (const decoder of decoders) {
    if (decoder.brandName === normalized) {
      return decoder;
    }
    if (decoder.aliases.some(alias => alias === normalized)) {
      return decoder;
    }
  }
  
  return null;
}

/**
 * Attempt to decode a style code for a given brand
 * Returns null if no decoder exists or decoding fails
 */
export function decodeStyleCode(brandName: string, styleCode: string): DecodedStyleInfo | null {
  if (!brandName || !styleCode) return null;
  
  const decoder = getDecoderForBrand(brandName);
  if (!decoder) return null;
  
  return decoder.decode(styleCode);
}

/**
 * Get list of supported brand names for decoding
 */
export function getSupportedBrands(): string[] {
  return decoders.map(d => d.brandName);
}

/**
 * Check if a brand has a decoder
 */
export function hasBrandDecoder(brandName: string): boolean {
  return getDecoderForBrand(brandName) !== null;
}

