import SwiftUI

struct ScanDetailView: View {
    let scan: Scan
    @EnvironmentObject private var convexService: ConvexService
    @Environment(\.dismiss) private var dismiss
    @State private var isSubmittingClarification = false
    @State private var customAnswer = ""
    @State private var showCustomInput = false
    @State private var isPriceExplanationExpanded = false
    @FocusState private var isCustomInputFocused: Bool
    
    private var displayScan: Scan {
        convexService.scans.first { $0.id == scan.id } ?? scan
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    scanHeader
                    intakeActionRow
                    
                    if displayScan.status.needsClarification,
                       let clarification = displayScan.extractedData?.clarificationNeeded {
                        clarificationCard(clarification: clarification)
                    }
                    
                    if displayScan.status.isProcessing {
                        ProcessingProgressView(status: displayScan.status)
                            .padding(.horizontal)
                    }
                    
                    if let findings = displayScan.refinedFindings {
                        marketSnapshotCard(findings: findings, researchResults: displayScan.researchResults)
                    }
                    
                    if let researchResults = displayScan.researchResults,
                       !researchResults.soldListings.isEmpty {
                        soldCompsSection(listings: researchResults.soldListings)
                    }
                    
                    if let researchResults = displayScan.researchResults,
                       !researchResults.listings.isEmpty {
                        activeCompsSection(listings: researchResults.listings)
                    }
                    
                    if let researchResults = displayScan.researchResults,
                       researchResults.brandInfo != nil || researchResults.originalRetailPrice != nil {
                        brandContextCard(results: researchResults)
                    }
                    
                    if let findings = displayScan.refinedFindings,
                       !findings.insights.dropFirst(3).isEmpty || findings.brandTier != nil || !(findings.seasonalFactors ?? "").isEmpty {
                        insightsCard(findings: findings)
                    }
                    
                    if let data = displayScan.extractedData {
                        extractedDataCard(data: data)
                    }
                    
                    if let researchResults = displayScan.researchResults,
                       !researchResults.sources.isEmpty || !researchResults.searchQueries.isEmpty {
                        sourcesAndQueriesCard(results: researchResults)
                    }
                    
                    if let findings = displayScan.refinedFindings,
                       (displayScan.researchResults?.soldListings.isEmpty ?? true),
                       (displayScan.researchResults?.listings.isEmpty ?? true),
                       !findings.comparableListings.isEmpty {
                        comparableListingsCard(listings: findings.comparableListings)
                    }
                    
                    if let error = displayScan.errorMessage {
                        errorCard(message: error)
                    }
                }
                .padding(.vertical)
            }
            .background(Color(hex: "0a0a0f"))
            .navigationTitle(scanTitle)
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
    
    // MARK: - Header
    
    private var scanHeader: some View {
        VStack(spacing: 16) {
            CachedAsyncImage(url: URL(string: displayScan.imageUrl ?? "")) { image in
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
            
            scanSummaryCard
        }
        .padding(.horizontal)
    }
    
    private var scanSummaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(scanTitle)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                    
                    if !scanSubtitle.isEmpty {
                        Text(scanSubtitle)
                            .font(.system(size: 14))
                            .foregroundColor(Color(hex: "8888a0"))
                    }
                }
                
                Spacer()
                
                StatusBadge(status: displayScan.status)
            }
            
            if let confidenceText {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "22c55e"))
                    
                    Text("Confidence \(confidenceText)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(hex: "22c55e"))
                }
            }
        }
        .padding(16)
        .background(Color(hex: "12121a"))
        .cornerRadius(14)
    }
    
    private var intakeActionRow: some View {
        HStack(spacing: 12) {
            actionButton(title: "Accept & Price", icon: "tag.fill", color: Color(hex: "6366f1"), foreground: .white) {
                print("[Scan] Accept & Price tapped")
            }
            
            actionButton(title: "Queue", icon: "tray.fill", color: Color(hex: "1a1a24"), foreground: Color(hex: "d1d5db")) {
                print("[Scan] Queue tapped")
            }
            
            actionButton(title: "Reject", icon: "xmark.circle.fill", color: Color(hex: "ef4444"), foreground: .white) {
                print("[Scan] Reject tapped")
            }
        }
        .padding(.horizontal)
    }
    
    // MARK: - Clarification Card
    
    private func clarificationCard(clarification: ClarificationRequest) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "questionmark.circle.fill")
                    .foregroundColor(Color(hex: "f59e0b"))
                
                Text("Quick Question")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: "f59e0b"))
            }
            
            Text(clarification.question)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white)
            
            if isSubmittingClarification {
                HStack {
                    Spacer()
                    ProgressView()
                        .tint(Color(hex: "6366f1"))
                    Spacer()
                }
                .padding(.vertical, 8)
            } else {
                // Option buttons
                VStack(spacing: 8) {
                    ForEach(clarification.options) { option in
                        Button {
                            submitClarification(field: clarification.field, value: option.value)
                        } label: {
                            HStack {
                                Text(option.label)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.white)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(hex: "8888a0"))
                            }
                            .padding(12)
                            .background(Color(hex: "1a1a24"))
                            .cornerRadius(10)
                        }
                        .buttonStyle(.plain)
                    }
                    
                    // Custom "Other" input
                    if showCustomInput {
                        HStack(spacing: 8) {
                            TextField("Type your answer...", text: $customAnswer)
                                .font(.system(size: 14))
                                .foregroundColor(.white)
                                .padding(12)
                                .background(Color(hex: "1a1a24"))
                                .cornerRadius(10)
                                .focused($isCustomInputFocused)
                                .onChange(of: customAnswer) { _, newValue in
                                    // Limit to 128 characters
                                    if newValue.count > 128 {
                                        customAnswer = String(newValue.prefix(128))
                                    }
                                }
                                .onSubmit {
                                    if !customAnswer.trimmingCharacters(in: .whitespaces).isEmpty {
                                        submitClarification(field: clarification.field, value: customAnswer.trimmingCharacters(in: .whitespaces))
                                    }
                                }
                            
                            Button {
                                if !customAnswer.trimmingCharacters(in: .whitespaces).isEmpty {
                                    submitClarification(field: clarification.field, value: customAnswer.trimmingCharacters(in: .whitespaces))
                                }
                            } label: {
                                Image(systemName: "arrow.right.circle.fill")
                                    .font(.system(size: 28))
                                    .foregroundColor(customAnswer.trimmingCharacters(in: .whitespaces).isEmpty 
                                        ? Color(hex: "8888a0") 
                                        : Color(hex: "6366f1"))
                            }
                            .disabled(customAnswer.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        
                        // Character count
                        HStack {
                            Spacer()
                            Text("\(customAnswer.count)/128")
                                .font(.system(size: 11))
                                .foregroundColor(Color(hex: "8888a0"))
                        }
                    } else {
                        // "Other" button to show text field
                        Button {
                            showCustomInput = true
                            isCustomInputFocused = true
                        } label: {
                            HStack {
                                Text("Other...")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(Color(hex: "8888a0"))
                                Spacer()
                                Image(systemName: "pencil")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(hex: "8888a0"))
                            }
                            .padding(12)
                            .background(Color(hex: "1a1a24"))
                            .cornerRadius(10)
                        }
                        .buttonStyle(.plain)
                    }
                    
                    // Skip button
                    Button {
                        submitClarification(field: clarification.field, value: "skip")
                    } label: {
                        Text("Not sure • Skip")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color(hex: "8888a0"))
                            .padding(.vertical, 8)
                    }
                }
            }
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color(hex: "f59e0b").opacity(0.3), lineWidth: 1)
        )
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    private func submitClarification(field: String, value: String) {
        isSubmittingClarification = true
        
        Task {
            do {
                // Apply the clarification
                try await convexService.applyClarification(scanId: displayScan.id, field: field, value: value)
                
                // Resume the pipeline (runs research + refinement in background)
                try await convexService.resumePipeline(scanId: displayScan.id)
                
                // Updates stream via real-time subscription; return to list
                dismiss()
            } catch {
                print("Clarification error: \(error)")
                isSubmittingClarification = false
            }
        }
    }
    
    // MARK: - Market Snapshot
    
    private func marketSnapshotCard(findings: RefinedFindings, researchResults: ResearchResults?) -> some View {
        let soldCount = researchResults?.soldListings.count ?? 0
        let activeCount = researchResults?.listings.count ?? 0
        let queryCount = researchResults?.searchQueries.count ?? 0
        let quality = dataQualitySummary(soldCount: soldCount, activeCount: activeCount)
        let usesSoldDistribution = !(researchResults?.soldListings.isEmpty ?? true)
        let distributionListings = usesSoldDistribution ? (researchResults?.soldListings ?? []) : (researchResults?.listings ?? [])
        let distributionTitle = usesSoldDistribution ? "Sold price distribution" : "Active price distribution"
        let distributionPrices = distributionListings.map(\.price).filter { $0 > 0 }
        let distributionCurrency = distributionListings.first?.currency ?? findings.suggestedPriceRange.currency
        let marketRegion = researchResults?.marketRegion
        let primaryCurrency = researchResults?.primaryCurrency
        let stats = [
            ("Sold comps", "\(soldCount)"),
            ("Active comps", "\(activeCount)"),
            ("Queries", "\(queryCount)"),
            ("Confidence", "\(Int(findings.confidence * 100))%")
        ]
        
        return VStack(spacing: 16) {
            HStack {
                Text("Market Snapshot")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "8888a0"))
                
                Spacer()
                
                dataQualityBadge(label: quality.label, detail: quality.detail, color: quality.color)
            }
            
            if marketRegion != nil || primaryCurrency != nil {
                HStack(spacing: 12) {
                    if let region = marketRegion {
                        Text("Market \(region)")
                    }
                    if let currency = primaryCurrency {
                        Text("Currency \(currency)")
                    }
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(hex: "8888a0"))
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            
            HStack(spacing: 8) {
                Text(findings.marketActivity.emoji)
                Text(findings.marketActivity.rawValue.capitalized)
                    .font(.system(size: 13, weight: .medium))
                
                Text("•")
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "8888a0"))
                
                Text("Demand \(findings.demandLevel.rawValue.capitalized)")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "d1d5db"))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            
            Text("Suggested Price")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(hex: "8888a0"))
                .frame(maxWidth: .infinity, alignment: .leading)
            
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
                GeometryReader { _ in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color(hex: "1a1a24"))
                            .frame(height: 8)
                        
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
                    Text(formatPrice(findings.suggestedPriceRange.low, currency: findings.suggestedPriceRange.currency))
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "8888a0"))
                    
                    Spacer()
                    
                    Text(formatPrice(findings.suggestedPriceRange.high, currency: findings.suggestedPriceRange.currency))
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "8888a0"))
                }
            }
            
            if !distributionPrices.isEmpty {
                priceDistributionView(prices: distributionPrices, currency: distributionCurrency, title: distributionTitle)
            }
            
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(stats, id: \.0) { stat in
                    statTile(title: stat.0, value: stat.1)
                }
            }
            
            if !findings.insights.isEmpty {
                DisclosureGroup(isExpanded: $isPriceExplanationExpanded) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(findings.insights.prefix(3), id: \.self) { insight in
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(hex: "f59e0b"))
                                
                                Text(insight)
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(hex: "d1d5db"))
                            }
                        }
                    }
                    .padding(.top, 8)
                } label: {
                    Text("Why this price")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "6366f1"))
                }
            }
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    // MARK: - Research Sections
    
    private func soldCompsSection(listings: [Listing]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                sectionHeader("Sold Comps")
                Spacer()
                Text("\(listings.count) comps")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "8888a0"))
            }
            
            if let summary = priceSummary(for: listings) {
                Text("Avg \(formatPrice(summary.average, currency: summary.currency)) • Median \(formatPrice(summary.median, currency: summary.currency))")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "8888a0"))
            }
            
            VStack(spacing: 12) {
                ForEach(sortedSoldListings(listings).prefix(5)) { listing in
                    listingRow(listing: listing, isSold: true)
                }
            }
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    private func activeCompsSection(listings: [Listing]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                sectionHeader("Active Comps")
                Spacer()
                Text("\(listings.count) comps")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "8888a0"))
            }
            
            if let summary = priceSummary(for: listings) {
                Text("Avg \(formatPrice(summary.average, currency: summary.currency)) • Median \(formatPrice(summary.median, currency: summary.currency))")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "8888a0"))
            }
            
            VStack(spacing: 12) {
                ForEach(listings.prefix(5)) { listing in
                    listingRow(listing: listing, isSold: false)
                }
            }
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    private func brandContextCard(results: ResearchResults) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Brand & Retail Context")
            
            if let brand = results.brandInfo {
                VStack(alignment: .leading, spacing: 8) {
                    Text(brand.name)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                    
                    if let description = brand.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 13))
                            .foregroundColor(Color(hex: "d1d5db"))
                    }
                    
                    if let priceRange = brand.priceRange, !priceRange.isEmpty {
                        Text("Brand price range: \(priceRange)")
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: "8888a0"))
                    }
                }
            }
            
            if let retail = results.originalRetailPrice {
                HStack {
                    Text("Original retail")
                        .font(.system(size: 13))
                        .foregroundColor(Color(hex: "8888a0"))
                    
                    Spacer()
                    
                    Text(formatPrice(retail.amount, currency: retail.currency))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
        }
        .padding(20)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
        .padding(.horizontal)
    }
    
    private func sourcesAndQueriesCard(results: ResearchResults) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Sources & Search")
            
            if !results.sources.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Sources")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(hex: "8888a0"))
                    
                    flowLayoutChips(results.sources)
                }
            }
            
            if !results.searchQueries.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Search queries")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(hex: "8888a0"))
                    
                    flowLayoutChips(results.searchQueries)
                }
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

    private func insightMetaRow(label: String, value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(hex: "8888a0"))
                .frame(width: 90, alignment: .leading)
            
            Text(value)
                .font(.system(size: 12))
                .foregroundColor(Color(hex: "d1d5db"))
            
            Spacer()
        }
    }
    
    // MARK: - Insights Card
    
    private func insightsCard(findings: RefinedFindings) -> some View {
        let remainingInsights = Array(findings.insights.dropFirst(3))
        
        return VStack(alignment: .leading, spacing: 16) {
            Text("Market Insights")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: "8888a0"))
            
            VStack(alignment: .leading, spacing: 12) {
                if let brandTier = findings.brandTier {
                    insightMetaRow(label: "Brand tier", value: brandTier.rawValue.replacingOccurrences(of: "-", with: " ").capitalized)
                }
                if let seasonal = findings.seasonalFactors, !seasonal.isEmpty {
                    insightMetaRow(label: "Seasonality", value: seasonal)
                }
                
                ForEach(remainingInsights, id: \.self) { insight in
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
                                
                                HStack(spacing: 6) {
                                    Text(listing.platform)
                                        .font(.system(size: 12))
                                        .foregroundColor(Color(hex: "8888a0"))
                                    
                                    Text("• \(formattedRelevance(listing.relevanceScore)) match")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color(hex: "8888a0"))
                                }
                            }
                            
                            Spacer()
                            
                            Text(formatPrice(listing.price, currency: listing.currency))
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
    
    private var scanTitle: String {
        displayScan.extractedData?.brand ?? "Scan Details"
    }
    
    private var scanSubtitle: String {
        var parts: [String] = []
        if let styleNumber = displayScan.extractedData?.styleNumber, !styleNumber.isEmpty {
            parts.append("Style \(styleNumber)")
        }
        if let size = displayScan.extractedData?.size, !size.isEmpty {
            parts.append("Size \(size)")
        }
        if let sku = displayScan.extractedData?.sku, !sku.isEmpty {
            parts.append("SKU \(sku)")
        }
        return parts.joined(separator: " • ")
    }
    
    private var confidenceText: String? {
        if let confidence = displayScan.refinedFindings?.confidence {
            return "\(Int(confidence * 100))%"
        }
        if let confidence = displayScan.extractedData?.confidence {
            return "\(Int(confidence * 100))%"
        }
        return nil
    }
    
    private func actionButton(title: String, icon: String, color: Color, foreground: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .foregroundColor(foreground)
            .background(color)
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }

    private func dataQualitySummary(soldCount: Int, activeCount: Int) -> (label: String, color: Color, detail: String) {
        let total = soldCount + activeCount
        if total >= 12 && soldCount >= 6 {
            return ("High", Color(hex: "22c55e"), "\(total) comps")
        }
        if total >= 6 {
            return ("Medium", Color(hex: "f59e0b"), "\(total) comps")
        }
        return ("Low", Color(hex: "ef4444"), "\(total) comps")
    }
    
    private func dataQualityBadge(label: String, detail: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            
            Text("\(label) data • \(detail)")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(hex: "d1d5db"))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.12))
        .cornerRadius(8)
    }
    
    private func statTile(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(hex: "8888a0"))
            
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(hex: "1a1a24"))
        .cornerRadius(10)
    }
    
    @ViewBuilder
    private func priceDistributionView(prices: [Double], currency: String, title: String) -> some View {
        let normalizedPrices = prices.filter { $0 > 0 }.sorted()
        let minPrice = normalizedPrices.first
        let maxPrice = normalizedPrices.last
        let range = max((maxPrice ?? 0) - (minPrice ?? 0), 1)
        
        if let minPrice, let maxPrice {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "8888a0"))
                
                GeometryReader { geo in
                    let width = max(geo.size.width, 1)
                    
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color(hex: "1a1a24"))
                            .frame(height: 10)
                        
                        ForEach(Array(normalizedPrices.enumerated()), id: \.offset) { _, price in
                            let normalized = (price - minPrice) / range
                            let x = CGFloat(normalized) * (width - 6) + 3
                            
                            Circle()
                                .fill(Color(hex: "6366f1"))
                                .frame(width: 6, height: 6)
                                .position(x: x, y: 5)
                        }
                    }
                }
                .frame(height: 10)
                
                HStack {
                    Text(formatPrice(minPrice, currency: currency))
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "8888a0"))
                    
                    Spacer()
                    
                    Text(formatPrice(maxPrice, currency: currency))
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "8888a0"))
                }
            }
        }
    }
    
    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(Color(hex: "8888a0"))
    }
    
    private func listingRow(listing: Listing, isSold: Bool) -> some View {
        Link(destination: URL(string: listing.url) ?? URL(string: "about:blank")!) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(listing.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white)
                        .lineLimit(2)
                    
                    HStack(spacing: 8) {
                        Text(listing.platform)
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: "8888a0"))
                        
                        if isSold, let soldText = formattedSoldDate(listing.soldDate) {
                            Text("Sold \(soldText)")
                                .font(.system(size: 12))
                                .foregroundColor(Color(hex: "8888a0"))
                        } else if let condition = listing.condition, !condition.isEmpty {
                            Text(condition)
                                .font(.system(size: 12))
                                .foregroundColor(Color(hex: "8888a0"))
                        }
                    }
                }
                
                Spacer()
                
                Text(formatPrice(listing.price, currency: listing.currency))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: "22c55e"))
            }
            .padding(12)
            .background(Color(hex: "1a1a24"))
            .cornerRadius(10)
        }
    }
    
    private func flowLayoutChips(_ items: [String]) -> some View {
        let columns = [GridItem(.adaptive(minimum: 90), spacing: 8)]
        return LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color(hex: "d1d5db"))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color(hex: "1a1a24"))
                    .cornerRadius(10)
            }
        }
    }

    private func formattedRelevance(_ score: Double) -> String {
        let normalized = score > 1 ? score : score * 100
        let clamped = min(max(normalized, 0), 100)
        return "\(Int(clamped.rounded()))%"
    }
    
    private func priceSummary(for listings: [Listing]) -> (average: Double, median: Double, currency: String)? {
        guard !listings.isEmpty else { return nil }
        let prices = listings.map(\.price).sorted()
        let average = prices.reduce(0, +) / Double(prices.count)
        let median: Double
        if prices.count % 2 == 0 {
            let mid = prices.count / 2
            median = (prices[mid - 1] + prices[mid]) / 2
        } else {
            median = prices[prices.count / 2]
        }
        let currency = listings.first?.currency ?? "USD"
        return (average, median, currency)
    }
    
    private func sortedSoldListings(_ listings: [Listing]) -> [Listing] {
        listings.sorted { left, right in
            let leftDate = parseSoldDate(left.soldDate)
            let rightDate = parseSoldDate(right.soldDate)
            switch (leftDate, rightDate) {
            case let (.some(l), .some(r)):
                return l > r
            case (.some, .none):
                return true
            case (.none, .some):
                return false
            default:
                return left.price > right.price
            }
        }
    }
    
    private func parseSoldDate(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        let fallback = ISO8601DateFormatter()
        return fallback.date(from: value)
    }
    
    private func formattedSoldDate(_ value: String?) -> String? {
        guard let date = parseSoldDate(value) else { return value }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
    
    private func formatPrice(_ amount: Double, currency: String?) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency ?? "USD"
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
        researchResults: ResearchResults(
            listings: [
                Listing(title: "Patagonia Synchilla Snap-T Pullover", price: 72, currency: "USD", platform: "Poshmark", url: "https://example.com/1", condition: "Excellent", soldDate: nil, imageUrl: nil),
                Listing(title: "Patagonia Fleece Jacket Medium", price: 68, currency: "USD", platform: "eBay", url: "https://example.com/2", condition: "Good", soldDate: nil, imageUrl: nil)
            ],
            soldListings: [
                Listing(title: "Patagonia Synchilla Fleece M", price: 62, currency: "USD", platform: "eBay", url: "https://example.com/3", condition: nil, soldDate: "2024-11-12T00:00:00Z", imageUrl: nil),
                Listing(title: "Patagonia Snap-T Pullover", price: 75, currency: "USD", platform: "Mercari", url: "https://example.com/4", condition: nil, soldDate: "2024-11-08T00:00:00Z", imageUrl: nil),
                Listing(title: "Vintage Patagonia Synchilla", price: 55, currency: "USD", platform: "Depop", url: "https://example.com/5", condition: nil, soldDate: "2024-11-01T00:00:00Z", imageUrl: nil)
            ],
            originalRetailPrice: PriceInfo(amount: 139, currency: "USD", source: "Patagonia"),
            brandInfo: BrandInfo(name: "Patagonia", description: "Outdoor brand known for durable fleece and sustainability.", priceRange: "$$-$$$", founded: nil, website: nil),
            searchQueries: ["Patagonia Synchilla fleece", "Patagonia Snap-T pullover price", "Patagonia fleece resale value"],
            sources: ["eBay", "Poshmark", "Mercari"],
            marketRegion: "US",
            primaryCurrency: "USD",
            currencyCounts: ["USD": 5]
        ),
        refinedFindings: RefinedFindings(
            suggestedPriceRange: PriceRange(low: 45, high: 85, recommended: 65, currency: "USD"),
            marketActivity: .moderate,
            demandLevel: .medium,
            comparableListings: [],
            insights: [
                "Popular outdoor brand with strong resale value",
                "This style is in demand for fall season",
                "Recent comps show steady sell-through under 30 days"
            ],
            confidence: 0.85
        ),
        createdAt: Date()
    ))
    .environmentObject(ConvexService())
}
