import SwiftUI

struct ScanDetailView: View {
    let scan: Scan
    @EnvironmentObject private var convexService: ConvexService
    @Environment(\.dismiss) private var dismiss
    @State private var isSubmittingClarification = false
    @State private var customAnswer = ""
    @State private var showCustomInput = false
    @FocusState private var isCustomInputFocused: Bool
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Image (cached for instant loads)
                    CachedAsyncImage(url: URL(string: scan.imageUrl ?? "")) { image in
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
                    
                    // Clarification Card (when awaiting user input)
                    if scan.status.needsClarification,
                       let clarification = scan.extractedData?.clarificationNeeded {
                        clarificationCard(clarification: clarification)
                    }
                    
                    // Processing Progress (when not complete)
                    if scan.status.isProcessing {
                        ProcessingProgressView(status: scan.status)
                            .padding(.horizontal)
                    }
                    
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
                try await convexService.applyClarification(scanId: scan.id, field: field, value: value)
                
                // Resume the pipeline (runs research + refinement in background)
                try await convexService.resumePipeline(scanId: scan.id)
                
                // Refresh scans to get updated status
                try await convexService.fetchUserScans()
                
                // Dismiss so user sees updated scan in list
                // (The scan object in this view is immutable)
                dismiss()
            } catch {
                print("Clarification error: \(error)")
                isSubmittingClarification = false
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

