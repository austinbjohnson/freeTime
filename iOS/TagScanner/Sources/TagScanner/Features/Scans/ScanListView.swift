import SwiftUI

struct ScanListView: View {
    @EnvironmentObject var convexService: ConvexService
    @State private var selectedScan: Scan?
    
    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0a0a0f")
                    .ignoresSafeArea()
                
                if convexService.scans.isEmpty && !convexService.isLoading {
                    emptyStateView
                } else {
                    scansList
                }
            }
            .navigationTitle("Scans")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(Color(hex: "0a0a0f"), for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .refreshable {
                try? await convexService.fetchUserScans()
            }
            .sheet(item: $selectedScan) { scan in
                ScanDetailView(scan: scan)
            }
        }
        .task {
            try? await convexService.fetchUserScans()
        }
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "tag.slash")
                .font(.system(size: 60))
                .foregroundColor(Color(hex: "8888a0"))
            
            Text("No Scans Yet")
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(.white)
            
            Text("Take a photo of a clothing tag\nto get started")
                .font(.system(size: 16))
                .foregroundColor(Color(hex: "8888a0"))
                .multilineTextAlignment(.center)
        }
    }
    
    private var scansList: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(convexService.scans) { scan in
                    ScanCardView(scan: scan)
                        .onTapGesture {
                            selectedScan = scan
                        }
                }
            }
            .padding()
        }
    }
}

// MARK: - Scan Card

struct ScanCardView: View {
    let scan: Scan
    
    var body: some View {
        HStack(spacing: 16) {
            // Thumbnail
            AsyncImage(url: URL(string: scan.thumbnailUrl ?? scan.imageUrl ?? "")) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } placeholder: {
                Rectangle()
                    .fill(Color(hex: "1a1a24"))
                    .overlay {
                        Image(systemName: "photo")
                            .foregroundColor(Color(hex: "8888a0"))
                    }
            }
            .frame(width: 80, height: 80)
            .cornerRadius(12)
            
            // Content
            VStack(alignment: .leading, spacing: 8) {
                // Brand and status
                HStack {
                    Text(scan.extractedData?.brand ?? "Unknown Brand")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    StatusBadge(status: scan.status)
                }
                
                // Style number
                if let styleNumber = scan.extractedData?.styleNumber {
                    Text("Style: \(styleNumber)")
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: "8888a0"))
                }
                
                // Price range (if available)
                if let findings = scan.refinedFindings {
                    HStack(spacing: 4) {
                        Text(findings.suggestedPriceRange.formattedRange)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(Color(hex: "22c55e"))
                        
                        Text(findings.marketActivity.emoji)
                    }
                }
            }
        }
        .padding(16)
        .background(Color(hex: "12121a"))
        .cornerRadius(16)
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let status: ScanStatus
    
    var body: some View {
        HStack(spacing: 4) {
            if status.isProcessing {
                ProgressView()
                    .scaleEffect(0.6)
            }
            
            Text(status.displayName)
                .font(.system(size: 12, weight: .medium))
        }
        .foregroundColor(statusColor)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(statusColor.opacity(0.15))
        .cornerRadius(6)
    }
    
    private var statusColor: Color {
        switch status {
        case .completed:
            return Color(hex: "22c55e")
        case .failed:
            return Color(hex: "ef4444")
        case .uploaded, .extracting, .researching, .refining:
            return Color(hex: "6366f1")
        }
    }
}

#Preview {
    ScanListView()
        .environmentObject(ConvexService())
}

