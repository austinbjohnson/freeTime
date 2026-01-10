import SwiftUI

struct ScanDetailView: View {
    let scan: Scan
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Image
                    AsyncImage(url: URL(string: scan.imageUrl ?? "")) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    } placeholder: {
                        Rectangle()
                            .fill(Color(hex: "1a1a24"))
                            .aspectRatio(3/4, contentMode: .fit)
                            .overlay {
                                ProgressView()
                            }
                    }
                    .cornerRadius(16)
                    .padding(.horizontal)
                    
                    // Price Range Card
                    if let findings = scan.refinedFindings {
                        priceCard(findings: findings)
                    }
                    
                    // Extracted Data
                    if let data = scan.extractedData {
                        extractedDataCard(data: data)
                    }
                    
                    // Insights
                    if let findings = scan.refinedFindings {
                        insightsCard(findings: findings)
                    }
                    
                    // Comparable Listings
                    if let findings = scan.refinedFindings,
                       !findings.comparableListings.isEmpty {
                        comparableListingsCard(listings: findings.comparableListings)
                    }
                    
                    // Error Message
                    if let error = scan.errorMessage {
                        errorCard(message: error)
                    }
                }
                .padding(.vertical)
            }
            .background(Color(hex: "0a0a0f"))
            .navigationTitle(scan.extractedData?.brand ?? "Scan Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color(hex: "0a0a0f"), for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(Color(hex: "6366f1"))
                }
            }
        }
    }
    
    // MARK: - Price Card
    
    private func priceCard(findings: RefinedFindings) -> some View {
        VStack(spacing: 16) {
            HStack {
                Text("Suggested Price")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "8888a0"))
                
                Spacer()
                
                HStack(spacing: 4) {
                    Text(findings.marketActivity.emoji)
                    Text(findings.marketActivity.rawValue.capitalized)
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(Color(hex: "8888a0"))
            }
            
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(findings.suggestedPriceRange.formattedRecommended)
                    .font(.system(size: 42, weight: .bold))
                    .foregroundColor(Color(hex: "22c55e"))
                
                Text("recommended")
                    .font(.system(size: 14))
                    .foregroundColor(Color(hex: "8888a0"))
            }
            
            // Price range bar
            VStack(spacing: 8) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        // Background
                        Capsule()
                            .fill(Color(hex: "1a1a24"))
                            .frame(height: 8)
                        
                        // Active range
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: "6366f1"), Color(hex: "22c55e")],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(height: 8)
                    }
                }
                .frame(height: 8)
                
                HStack {
                    Text(formatPrice(findings.suggestedPriceRange.low))
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "8888a0"))
                    
                    Spacer()
                    
                    Text(formatPrice(findings.suggestedPriceRange.high))
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "8888a0"))
                }
            }
            
            // Confidence
            HStack {
                Text("Confidence")
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "8888a0"))
                
                Spacer()
                
                Text("\(Int(findings.confidence * 100))%")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "6366f1"))
            }
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    // MARK: - Extracted Data Card
    
    private func extractedDataCard(data: ExtractedData) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Tag Information")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: "8888a0"))
            
            VStack(spacing: 12) {
                if let brand = data.brand {
                    dataRow(label: "Brand", value: brand)
                }
                if let style = data.styleNumber {
                    dataRow(label: "Style", value: style)
                }
                if let size = data.size {
                    dataRow(label: "Size", value: size)
                }
                if let materials = data.materials, !materials.isEmpty {
                    dataRow(label: "Materials", value: materials.joined(separator: ", "))
                }
                if let country = data.countryOfOrigin {
                    dataRow(label: "Made In", value: country)
                }
                if let rn = data.rnNumber {
                    dataRow(label: "RN", value: rn)
                }
            }
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    private func dataRow(label: String, value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.system(size: 14))
                .foregroundColor(Color(hex: "8888a0"))
                .frame(width: 80, alignment: .leading)
            
            Text(value)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white)
            
            Spacer()
        }
    }
    
    // MARK: - Insights Card
    
    private func insightsCard(findings: RefinedFindings) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Insights")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: "8888a0"))
            
            VStack(alignment: .leading, spacing: 12) {
                ForEach(findings.insights, id: \.self) { insight in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "lightbulb.fill")
                            .font(.system(size: 14))
                            .foregroundColor(Color(hex: "f59e0b"))
                        
                        Text(insight)
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                    }
                }
            }
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    // MARK: - Comparable Listings Card
    
    private func comparableListingsCard(listings: [ComparableListing]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Similar Listings")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: "8888a0"))
            
            VStack(spacing: 12) {
                ForEach(listings.prefix(5)) { listing in
                    Link(destination: URL(string: listing.url) ?? URL(string: "about:blank")!) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(listing.title)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                
                                Text(listing.platform)
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(hex: "8888a0"))
                            }
                            
                            Spacer()
                            
                            Text(formatPrice(listing.price))
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Color(hex: "22c55e"))
                            
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 12))
                                .foregroundColor(Color(hex: "6366f1"))
                        }
                        .padding(12)
                        .background(Color(hex: "1a1a24"))
                        .cornerRadius(10)
                    }
                }
            }
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    // MARK: - Error Card
    
    private func errorCard(message: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(Color(hex: "ef4444"))
            
            Text(message)
                .font(.system(size: 14))
                .foregroundColor(Color(hex: "ef4444"))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hex: "ef4444").opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
    
    // MARK: - Helpers
    
    private func formatPrice(_ amount: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: NSNumber(value: amount)) ?? "$\(amount)"
    }
}

#Preview {
    ScanDetailView(scan: Scan(
        id: "1",
        userId: "1",
        imageStorageId: "1",
        status: .completed,
        extractedData: ExtractedData(
            brand: "Patagonia",
            styleNumber: "84211",
            size: "M",
            materials: ["100% Recycled Polyester"],
            countryOfOrigin: "Vietnam",
            rawText: [],
            confidence: 0.92
        ),
        refinedFindings: RefinedFindings(
            suggestedPriceRange: PriceRange(low: 45, high: 85, recommended: 65, currency: "USD"),
            marketActivity: .moderate,
            demandLevel: .medium,
            comparableListings: [],
            insights: [
                "Popular outdoor brand with strong resale value",
                "This style is in demand for fall season"
            ],
            confidence: 0.85
        ),
        createdAt: Date()
    ))
}

